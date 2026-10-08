"""Fetch/cache weather and write per-crop-year feature table."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

from config_loader import load_config, path
from weather import build_feature_table, cache_daily


def main() -> None:
    parser = argparse.ArgumentParser(description="Build crop-year weather features")
    parser.add_argument("--lat", type=float, default=None)
    parser.add_argument("--lon", type=float, default=None)
    parser.add_argument("--start-year", type=int, default=1972)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--tag", type=str, default="ca_statewide_proxy")
    args = parser.parse_args()

    cfg = load_config()
    lat = args.lat if args.lat is not None else cfg["ranch"]["lat"]
    lon = args.lon if args.lon is not None else cfg["ranch"]["lon"]

    start = date(args.start_year - 1, 11, 1)
    end = date(args.end_year, 10, 31)
    cache_dir = path("raw") / "weather"
    daily_path = cache_daily(lat, lon, start, end, cache_dir)
    daily = pd.read_csv(daily_path, parse_dates=["date"])

    end_years = list(range(args.start_year, args.end_year + 1))
    features = build_feature_table(daily, end_years)
    features["weather_lat"] = lat
    features["weather_lon"] = lon
    features["weather_tag"] = args.tag
    features["weather_source"] = "open_meteo_era5_archive"

    out = path("processed") / f"weather_features_{args.tag}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    features.to_csv(out, index=False)
    print(f"Wrote {len(features)} crop years -> {out}")


if __name__ == "__main__":
    main()
