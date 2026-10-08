"""Merge CAC panel with weather features."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from config_loader import path


def merge_panel(
    cac_path: Path,
    weather_path: Path,
    out_path: Path,
) -> pd.DataFrame:
    cac = pd.read_csv(cac_path)
    weather = pd.read_csv(weather_path)
    merged = cac.merge(
        weather,
        on=["crop_year_label", "crop_year_end_year"],
        how="left",
        suffixes=("", "_wx"),
    )
    missing = merged["ppt_annual_mm"].isna().sum()
    if missing:
        print(f"Warning: {missing} CAC seasons missing weather features")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(out_path, index=False)
    print(f"Wrote {len(merged)} rows -> {out_path}")
    return merged


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--weather-tag",
        default="ca_statewide_proxy",
        help="Suffix used in weather_features_<tag>.csv",
    )
    args = parser.parse_args()

    cac_path = path("processed") / "cac_ca_season_panel.csv"
    weather_path = path("processed") / f"weather_features_{args.weather_tag}.csv"
    out_path = path("processed") / "training_table_v1.csv"
    merge_panel(cac_path, weather_path, out_path)


if __name__ == "__main__":
    main()
