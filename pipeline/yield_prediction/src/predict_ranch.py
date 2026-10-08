"""Scale CA lbs/ac forecast to ranch total; optional bias correction."""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import joblib
import pandas as pd

from config_loader import load_config, path
from weather import build_feature_table, cache_daily


def load_ranch_actuals(actuals_path: Path) -> pd.DataFrame:
    if not actuals_path.exists():
        return pd.DataFrame()
    df = pd.read_csv(actuals_path)
    if "lbs_total" in df.columns:
        df["lbs_total"] = pd.to_numeric(df["lbs_total"], errors="coerce")
    return df


def historical_ranch_preds_from_cac(
    acres: float,
    labels: list[str],
) -> pd.DataFrame:
    """Use in-sample CA model preds (cac_predictions_v1) scaled to ranch acres."""
    pred_path = path("outputs") / "cac_predictions_v1.csv"
    if not pred_path.exists():
        return pd.DataFrame()
    cac = pd.read_csv(pred_path)
    if "pred_lbs_per_ac" not in cac.columns:
        return pd.DataFrame()
    rows = cac[cac["crop_year_label"].isin(labels)].copy()
    if rows.empty:
        return pd.DataFrame()
    rows["pred_ranch_lbs"] = rows["pred_lbs_per_ac"] * acres
    return rows[["crop_year_label", "pred_ranch_lbs", "pred_lbs_per_ac"]]


def bias_correction(
    actuals: pd.DataFrame,
    acres: float,
    calibration_labels: list[str],
) -> dict:
    if actuals.empty:
        return {"method": "none", "factor": 1.0, "offset": 0.0, "n": 0}

    hist = historical_ranch_preds_from_cac(acres, calibration_labels)
    if hist.empty:
        return {"method": "none", "factor": 1.0, "offset": 0.0, "n": 0}

    merged = hist.merge(actuals, on="crop_year_label", how="inner")
    merged = merged.dropna(subset=["lbs_total", "pred_ranch_lbs"])
    merged = merged[merged["pred_ranch_lbs"] > 0]

    # Prefer seasons marked complete (annual PDF totals or full weekly coverage).
    # Do not drop light-but-complete years (e.g. CY2022 = 293 bins).
    if "season_complete" in merged.columns:
        flagged = merged[merged["season_complete"].fillna(False).astype(bool)]
        if not flagged.empty:
            merged = flagged
        elif "full_bins_sum" in merged.columns:
            complete = merged[merged["full_bins_sum"] >= 400]
            merged = complete if not complete.empty else merged.sort_values("lbs_total", ascending=False).head(1)
    elif "full_bins_sum" in merged.columns:
        complete = merged[merged["full_bins_sum"] >= 400]
        if not complete.empty:
            merged = complete
        else:
            merged = merged.sort_values("lbs_total", ascending=False).head(1)

    if merged.empty:
        return {"method": "none", "factor": 1.0, "offset": 0.0, "n": 0}

    ratios = merged["lbs_total"] / merged["pred_ranch_lbs"]
    factor = float(ratios.mean())
    detail = [
        {
            "crop_year_label": r.crop_year_label,
            "actual_lbs": float(r.lbs_total),
            "pred_ranch_lbs": float(r.pred_ranch_lbs),
            "ratio": float(r.lbs_total / r.pred_ranch_lbs),
        }
        for r in merged.itertuples()
    ]
    return {
        "method": "mean_ratio",
        "factor": factor,
        "offset": 0.0,
        "n": int(len(merged)),
        "calibration_years": list(merged["crop_year_label"]),
        "detail": detail,
    }


def predict_for_crop_year(cfg: dict, pipe, feats: list[str], holdout: str) -> dict:
    end_year = int(holdout.replace("CY", ""))
    lat = cfg["ranch"]["lat"]
    lon = cfg["ranch"]["lon"]
    acres = float(cfg["ranch"]["avocado_acres_est"])

    cache_dir = path("raw") / "weather"
    start = date(end_year - 1, 11, 1)
    end = date(end_year, 10, 31)

    # Prefer weather features already built for this crop year (offline-friendly)
    wx_path = path("processed") / "weather_features_ca_statewide_proxy.csv"
    wx_row = None
    if wx_path.exists():
        wx = pd.read_csv(wx_path)
        hit = wx[wx["crop_year_label"] == holdout]
        if not hit.empty:
            wx_row = hit.iloc[0]

    if wx_row is None:
        daily_path = cache_daily(lat, lon, start, end, cache_dir)
        daily = pd.read_csv(daily_path, parse_dates=["date"])
        wx_row = build_feature_table(daily, [end_year]).iloc[0]

    X = wx_row[feats]
    pred_lbs_ac = float(pipe.predict(pd.DataFrame([X]))[0])
    return {
        "pred_lbs_per_ac": pred_lbs_ac,
        "pred_ranch_lbs": pred_lbs_ac * acres,
        "acres": acres,
        "lat": lat,
        "lon": lon,
        "end_year": end_year,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--crop-year", default=None, help="e.g. CY2025")
    parser.add_argument("--actuals", type=Path, default=None)
    args = parser.parse_args()

    cfg = load_config()
    model_bundle = joblib.load(path("outputs") / "model_v1.joblib")
    pipe = model_bundle["pipeline"]
    feats = model_bundle["features"]

    holdout = args.crop_year or cfg["target"]["test_crop_year_label"]
    acres = float(cfg["ranch"]["avocado_acres_est"])

    pred = predict_for_crop_year(cfg, pipe, feats, holdout)
    pred_ranch_lbs = pred["pred_ranch_lbs"]
    pred_lbs_ac = pred["pred_lbs_per_ac"]

    actuals_path = args.actuals or (path("processed") / "ranch_actuals.csv")
    actuals = load_ranch_actuals(actuals_path)
    # Calibrate on completed pre-holdout seasons present in actuals (never the test year)
    cal_labels = [
        f"CY{y}"
        for y in range(2021, int(holdout.replace("CY", "")))
        if f"CY{y}" in set(actuals.get("crop_year_label", pd.Series(dtype=str)))
    ]
    bias = bias_correction(actuals, acres, cal_labels)
    corrected = pred_ranch_lbs * bias["factor"] + bias["offset"]

    static = pd.read_csv(path("processed") / "ranch_static_features.csv")
    out_row = {
        "crop_year_label": holdout,
        "ranch_name": cfg["ranch"]["name"],
        "weather_lat": pred["lat"],
        "weather_lon": pred["lon"],
        "pred_lbs_per_ac_ca_model": pred_lbs_ac,
        "ranch_acres": acres,
        "pred_ranch_lbs_raw": pred_ranch_lbs,
        "bias_correction": bias["method"],
        "bias_factor": bias["factor"],
        "pred_ranch_lbs_corrected": corrected,
        "dominant_soil": static["dominant_soil_series"].iloc[0],
        "slope_pct_mid": static["slope_pct_mid"].iloc[0],
        "notes": cfg["ranch"].get("notes", ""),
        "ranch_actual_lbs": None,
    }

    if not actuals.empty:
        act = actuals.loc[actuals["crop_year_label"] == holdout, "lbs_total"]
        if not act.empty and pd.notna(act.iloc[0]):
            out_row["ranch_actual_lbs"] = float(act.iloc[0])
            out_row["error_lbs"] = out_row["ranch_actual_lbs"] - out_row["pred_ranch_lbs_corrected"]
            out_row["error_pct"] = out_row["error_lbs"] / out_row["ranch_actual_lbs"]

    out_df = pd.DataFrame([out_row])
    out_path = path("outputs") / "ranch_forecast_v1.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(out_path, index=False)

    # Multi-year scorecard for all actuals years
    scorecard = []
    if not actuals.empty:
        hist = historical_ranch_preds_from_cac(acres, list(actuals["crop_year_label"]))
        if not hist.empty:
            m = hist.merge(actuals, on="crop_year_label", how="inner")
            for r in m.itertuples():
                raw = float(r.pred_ranch_lbs)
                corr = raw * bias["factor"] + bias["offset"]
                actual = float(r.lbs_total)
                scorecard.append(
                    {
                        "crop_year_label": r.crop_year_label,
                        "actual_lbs": actual,
                        "pred_raw": raw,
                        "pred_corrected": corr,
                        "error_pct_corrected": (actual - corr) / actual if actual else None,
                        "is_holdout": r.crop_year_label == holdout,
                        "used_in_bias_fit": r.crop_year_label in bias.get("calibration_years", []),
                    }
                )
    score_path = path("outputs") / "ranch_scorecard_v1.csv"
    pd.DataFrame(scorecard).to_csv(score_path, index=False)

    summary = {
        "forecast": out_row,
        "bias_correction": bias,
        "scorecard": scorecard,
        "static_features": static.to_dict(orient="records"),
        "lbs_per_bin_note": "See data/processed/lbs_per_bin_calibration.json (~960 lb field bins)",
    }
    summary_path = path("outputs") / "ranch_forecast_v1.json"
    summary_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))
    print(f"Wrote {out_path}")
    print(f"Wrote {score_path}")


if __name__ == "__main__":
    main()
