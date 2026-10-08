"""Train v1 weather-only model on CAC lbs/ac; hold out CY2025."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from config_loader import load_config, path

TARGET = "avg_lbs_per_bearing_acre"
FEATURE_PREFIXES = ("ppt_", "tmean_", "tmax_", "et0_")
EXPLICIT_FEATURES = ("spring_heat_days", "winter_chill_proxy")


def feature_columns(df: pd.DataFrame) -> list[str]:
    cols = []
    for c in df.columns:
        if c in EXPLICIT_FEATURES or any(c.startswith(p) for p in FEATURE_PREFIXES):
            cols.append(c)
    return sorted(cols)


def mape(y_true, y_pred) -> float:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    mask = y_true != 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def within_pct(y_true, y_pred, pct: float = 0.2) -> float:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    mask = y_true != 0
    if not mask.any():
        return float("nan")
    hits = np.abs(y_pred[mask] - y_true[mask]) <= pct * y_true[mask]
    return float(np.mean(hits))


def train_and_evaluate(
    table_path: Path,
    train_end_years: list[int],
    holdout_label: str,
    model_out: Path,
    metrics_out: Path,
    preds_out: Path,
) -> dict:
    df = pd.read_csv(table_path)
    feats = feature_columns(df)
    if not feats:
        raise RuntimeError("No weather feature columns found in training table")

    train_mask = df["crop_year_end_year"].isin(train_end_years)
    holdout_mask = df["crop_year_label"] == holdout_label

    train_df = df.loc[train_mask].dropna(subset=[TARGET])
    holdout_df = df.loc[holdout_mask]

    X_train = train_df[feats]
    y_train = train_df[TARGET]
    pipe = Pipeline(
        [
            ("scale", StandardScaler()),
            ("model", Ridge(alpha=5.0)),
        ]
    )
    pipe.fit(X_train, y_train)

    # Time-series CV on training window
    cv_scores = []
    tscv = TimeSeriesSplit(n_splits=5)
    idx = np.arange(len(train_df))
    for tr, te in tscv.split(idx):
        X_tr, X_te = X_train.iloc[tr], X_train.iloc[te]
        y_tr, y_te = y_train.iloc[tr], y_train.iloc[te]
        fold = Pipeline(
            [
                ("scale", StandardScaler()),
                ("model", Ridge(alpha=5.0)),
            ]
        )
        fold.fit(X_tr, y_tr)
        pred = fold.predict(X_te)
        cv_scores.append(
            {
                "mae": float(mean_absolute_error(y_te, pred)),
                "mape": mape(y_te, pred),
                "within_20pct": within_pct(y_te, pred),
            }
        )

    train_pred = pipe.predict(X_train)
    metrics: dict = {
        "target": TARGET,
        "n_train": int(len(train_df)),
        "feature_count": len(feats),
        "features": feats,
        "train_mae": float(mean_absolute_error(y_train, train_pred)),
        "train_mape": mape(y_train, train_pred),
        "train_r2": float(r2_score(y_train, train_pred)),
        "cv_folds": cv_scores,
        "cv_mae_mean": float(np.mean([s["mae"] for s in cv_scores])),
        "cv_mape_mean": float(np.mean([s["mape"] for s in cv_scores])),
        "cv_within_20pct_mean": float(np.mean([s["within_20pct"] for s in cv_scores])),
    }

    all_pred = df.copy()
    valid = all_pred[feats].notna().all(axis=1)
    all_pred["pred_lbs_per_ac"] = np.nan
    all_pred.loc[valid, "pred_lbs_per_ac"] = pipe.predict(all_pred.loc[valid, feats])

    if not holdout_df.empty and holdout_df[feats].notna().all(axis=1).all():
        y_hold = holdout_df[TARGET].iloc[0]
        p_hold = float(all_pred.loc[holdout_mask, "pred_lbs_per_ac"].iloc[0])
        metrics["holdout_crop_year"] = holdout_label
        metrics["holdout_actual_lbs_ac"] = float(y_hold)
        metrics["holdout_pred_lbs_ac"] = p_hold
        metrics["holdout_mae"] = float(abs(y_hold - p_hold))
        metrics["holdout_mape"] = mape([y_hold], [p_hold])
        metrics["holdout_within_20pct"] = within_pct([y_hold], [p_hold])

    model_out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "pipeline": pipe,
            "features": feats,
            "target": TARGET,
            "train_end_years": train_end_years,
            "holdout_label": holdout_label,
        },
        model_out,
    )
    metrics_out.parent.mkdir(parents=True, exist_ok=True)
    metrics_out.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    preds_out.parent.mkdir(parents=True, exist_ok=True)
    all_pred.to_csv(preds_out, index=False)
    print(json.dumps(metrics, indent=2))
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", type=Path, default=None)
    args = parser.parse_args()

    cfg = load_config()
    table_path = args.table or (path("processed") / "training_table_v1.csv")
    train_years = cfg["target"]["train_crop_years_end"]
    holdout = cfg["target"]["test_crop_year_label"]

    train_and_evaluate(
        table_path=table_path,
        train_end_years=train_years,
        holdout_label=holdout,
        model_out=path("outputs") / "model_v1.joblib",
        metrics_out=path("outputs") / "model_metrics_v1.json",
        preds_out=path("outputs") / "cac_predictions_v1.csv",
    )


if __name__ == "__main__":
    main()
