"""Build ranch_actuals.csv from grower_statements export (CAC crop years).

Prefer sum(lbs_total) by crop year. Also reports bins and calibrated lbs/bin.
CY2025 is the model test holdout — included in the file but not used for fit.

Annual Index Fresh YTD/total PDFs under data/grower_statements/{year}/ (repo root)
override thin weekly rollups when present (e.g. CY2021–CY2023).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from config_loader import path


CORE_COLS = [
    "logged_at",
    "statement_date",
    "pool_number",
    "variety",
    "period_start",
    "period_end",
    "block_parcel",
    "index_block_id",
    "bins_received",
    "lbs_grade1",
    "lbs_grade2",
    "lbs_culls",
    "lbs_total",
    "gross_amount",
    "charges_total",
    "net_amount",
]

# Season totals extracted from Index Fresh annual / YTD PDFs (not in sheet export).
# CY2021 was billed as Big Seed Farms (GR1021) for the same Ortega Ridge ranch.
ANNUAL_TOTAL_OVERRIDES = [
    {
        "crop_year_label": "CY2021",
        "crop_year_end_year": 2021,
        "lbs_total": 570716.0,
        "full_bins_sum": 630.0,
        "source": "BigSeed_2021_total.pdf",
        "notes": (
            "annual total PDF; PERIOD 11/01/2020–10/31/2021; "
            "grower Big Seed Farms GR1021 (pre–SB Farm); Total Returns lbs"
        ),
        "season_complete": True,
    },
    {
        "crop_year_label": "CY2022",
        "crop_year_end_year": 2022,
        "lbs_total": 272910.0,
        "full_bins_sum": 293.0,
        "source": "2022_total.pdf",
        "notes": (
            "annual total PDF; POOL STATEMENT 2022 YTD; "
            "SB FARM LLC GR1532; TOTAL RETURNS lbs"
        ),
        "season_complete": True,
    },
    {
        "crop_year_label": "CY2023",
        "crop_year_end_year": 2023,
        "lbs_total": 219069.0,
        "full_bins_sum": 235.0,
        "source": "2023_ytd_total.pdf",
        "notes": (
            "annual total PDF confirms sheet rollup; "
            "POOL STATEMENT 2023 YTD; TOTAL RETURNS lbs"
        ),
        "season_complete": True,
    },
]


def crop_year_end_year(dt: pd.Timestamp) -> int:
    """CAC crop year ending year: Nov 1 (Y-1) → Oct 31 Y."""
    if pd.isna(dt):
        return -1
    return int(dt.year + 1) if dt.month >= 11 else int(dt.year)


def clean_statements_export(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Google Sheet exports sometimes insert extra header columns (avg_rate, …)
    and shift field_receipts / pdf_* into those slots. Core fields through
    net_amount are reliable; rebuild trailing columns when shifted.
    """
    df = raw.copy()

    # If avg_rate looks like receipt numbers, columns were shifted
    if "avg_rate" in df.columns:
        sample = str(df["avg_rate"].iloc[0] if len(df) else "")
        if sample and sample.replace(" ", "").replace("0", "").isdigit() is False:
            # often "072895 073390…" — digits + spaces
            pass
        if sample and all(c.isdigit() or c.isspace() for c in sample) and len(sample) > 5:
            df["field_receipts"] = df.get("avg_rate")
            df["pdf_file_id"] = df.get("grade1_pct")
            df["pdf_url"] = df.get("cull_pct")
            df["extraction_confidence"] = df.get("field_receipts") if "field_receipts" in raw.columns else df.get("extraction_confidence")
            # The original field_receipts column may now hold confidence
            if "field_receipts" in raw.columns and str(raw["field_receipts"].iloc[0]).lower() in {
                "ocr_reviewed",
                "ocr",
                "manual",
            }:
                df["extraction_confidence"] = raw["field_receipts"]
                df["field_receipts"] = raw["avg_rate"]
                df["pdf_file_id"] = raw["grade1_pct"]
                df["pdf_url"] = raw["cull_pct"]

    for c in [
        "bins_received",
        "lbs_grade1",
        "lbs_grade2",
        "lbs_culls",
        "lbs_total",
        "gross_amount",
        "charges_total",
        "net_amount",
        "pool_number",
    ]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    df["period_start"] = pd.to_datetime(df["period_start"], errors="coerce")
    df["period_end"] = pd.to_datetime(df["period_end"], errors="coerce")
    df["statement_date"] = pd.to_datetime(df["statement_date"], errors="coerce")
    return df


def aggregate_ranch_actuals(df: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    df = df.dropna(subset=["period_start", "lbs_total"]).copy()
    df["crop_year_end_year"] = df["period_start"].map(crop_year_end_year)
    df["crop_year_label"] = df["crop_year_end_year"].map(lambda y: f"CY{y}")

    g = (
        df.groupby(["crop_year_label", "crop_year_end_year"], as_index=False)
        .agg(
            lbs_total=("lbs_total", "sum"),
            full_bins_sum=("bins_received", "sum"),
            n_statements=("lbs_total", "count"),
            period_min=("period_start", "min"),
            period_max=("period_end", "max"),
        )
        .sort_values("crop_year_end_year")
    )

    g["crop_year_start"] = g["crop_year_end_year"].map(lambda y: f"{y - 1}-11-01")
    g["crop_year_end"] = g["crop_year_end_year"].map(lambda y: f"{y}-10-31")
    g["source"] = "grower_statements.lbs_total"
    g["season_complete"] = False
    g["lbs_per_bin_used"] = g["lbs_total"] / g["full_bins_sum"].replace(0, pd.NA)

    # Ranch-wide calibrated lbs/bin from all statement rows
    valid = df[(df["bins_received"] > 0) & (df["lbs_total"] > 0)]
    lbs_per_bin = float((valid["lbs_total"] / valid["bins_received"]).median()) if len(valid) else 960.0

    notes = []
    for _, row in g.iterrows():
        note = f"{int(row['n_statements'])} statements; {row['period_min'].date()}→{row['period_max'].date()}"
        if row["crop_year_label"] == "CY2025":
            note += "; TEST_HOLDOUT; shorter harvest season on ranch"
        if row["crop_year_label"] == "CY2026":
            note += "; season in progress / may be incomplete"
        # Heuristic: many bins / many weeks → treat as complete season
        if row["crop_year_label"] not in {"CY2025", "CY2026"} and (
            row["full_bins_sum"] >= 400 or row["n_statements"] >= 10
        ):
            g.loc[g["crop_year_label"] == row["crop_year_label"], "season_complete"] = True
        notes.append(note)
    g["notes"] = notes

    # Merge / override with annual Index Fresh totals (fills CY2021–22; confirms CY2023)
    override_rows = []
    for ov in ANNUAL_TOTAL_OVERRIDES:
        y = int(ov["crop_year_end_year"])
        override_rows.append(
            {
                "crop_year_label": ov["crop_year_label"],
                "crop_year_end_year": y,
                "crop_year_start": f"{y - 1}-11-01",
                "crop_year_end": f"{y}-10-31",
                "source": ov["source"],
                "lbs_total": float(ov["lbs_total"]),
                "full_bins_sum": float(ov["full_bins_sum"]),
                "lbs_per_bin_used": float(ov["lbs_total"]) / float(ov["full_bins_sum"])
                if ov["full_bins_sum"]
                else pd.NA,
                "notes": ov["notes"],
                "season_complete": bool(ov.get("season_complete", True)),
                "n_statements": pd.NA,
                "period_min": pd.NaT,
                "period_max": pd.NaT,
            }
        )
    ov_df = pd.DataFrame(override_rows)
    # Prefer annual PDF when present for that crop year
    g = g[~g["crop_year_label"].isin(ov_df["crop_year_label"])]
    g = pd.concat([ov_df, g], ignore_index=True).sort_values("crop_year_end_year")

    out = g[
        [
            "crop_year_label",
            "crop_year_start",
            "crop_year_end",
            "source",
            "lbs_total",
            "full_bins_sum",
            "lbs_per_bin_used",
            "season_complete",
            "notes",
        ]
    ]
    return out, lbs_per_bin


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Raw grower_statements CSV export",
    )
    parser.add_argument(
        "--clean-out",
        type=Path,
        default=None,
        help="Where to write cleaned statements CSV",
    )
    args = parser.parse_args()

    default_input = (
        Path.home()
        / "Downloads"
        / "Summerland Farm Operations - grower_statements (1).csv"
    )
    input_path = args.input or default_input
    if not input_path.exists():
        # fall back to repo copy
        alt = path("raw") / "grower_statements.csv"
        if alt.exists():
            input_path = alt
        else:
            raise SystemExit(f"Input not found: {input_path}")

    raw = pd.read_csv(input_path)
    cleaned = clean_statements_export(raw)

    clean_out = args.clean_out or (path("raw") / "grower_statements.csv")
    clean_out.parent.mkdir(parents=True, exist_ok=True)
    # Serialize dates as ISO for stability
    to_save = cleaned.copy()
    for c in ("period_start", "period_end", "statement_date"):
        if c in to_save.columns:
            to_save[c] = pd.to_datetime(to_save[c], errors="coerce").dt.strftime("%Y-%m-%d")
    keep = [c for c in CORE_COLS + ["field_receipts", "pdf_file_id", "pdf_url", "extraction_confidence", "notes"] if c in to_save.columns]
    to_save[keep].to_csv(clean_out, index=False)
    print(f"Wrote cleaned statements ({len(to_save)} rows) -> {clean_out}")

    actuals, lbs_per_bin = aggregate_ranch_actuals(cleaned)
    actuals_path = path("processed") / "ranch_actuals.csv"
    actuals.to_csv(actuals_path, index=False)
    print(f"Wrote ranch actuals -> {actuals_path}")
    print(actuals.to_string(index=False))
    print(f"Calibrated median lbs/bin: {lbs_per_bin:.1f}")

    cal_path = path("processed") / "lbs_per_bin_calibration.json"
    import json

    cal_path.write_text(
        json.dumps(
            {
                "lbs_per_bin_median": lbs_per_bin,
                "n_rows": int(len(cleaned)),
                "source": str(clean_out),
                "note": "Index Fresh bins_received ≈ field bins (~1000 lb), not 40 lb packing units",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {cal_path}")


if __name__ == "__main__":
    main()
