"""Open-Meteo historical daily weather → CAC crop-year feature rows."""

from __future__ import annotations

import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = [
    "precipitation_sum",
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "et0_fao_evapotranspiration",
]


def _chunk_ranges(start: date, end: date, years: int = 1) -> list[tuple[date, date]]:
    chunks: list[tuple[date, date]] = []
    cur = start
    while cur <= end:
        chunk_end = min(
            date(cur.year + years, cur.month, cur.day) - timedelta(days=1),
            end,
        )
        chunks.append((cur, chunk_end))
        cur = chunk_end + timedelta(days=1)
    return chunks


def fetch_daily(
    lat: float,
    lon: float,
    start: date,
    end: date,
    timezone: str = "America/Los_Angeles",
    pause_s: float = 1.5,
    max_retries: int = 8,
    cache_path: Path | None = None,
) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    if cache_path and cache_path.exists():
        frames.append(pd.read_csv(cache_path, parse_dates=["date"]))

    for chunk_start, chunk_end in _chunk_ranges(start, end):
        if frames:
            have = pd.concat(frames, ignore_index=True)
            if not have.empty:
                have_start = have["date"].min().date()
                have_end = have["date"].max().date()
                if chunk_start >= have_start and chunk_end <= have_end:
                    continue

        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": chunk_start.isoformat(),
            "end_date": chunk_end.isoformat(),
            "daily": ",".join(DAILY_VARS),
            "timezone": timezone,
        }
        for attempt in range(max_retries):
            resp = requests.get(ARCHIVE_URL, params=params, timeout=120)
            if resp.status_code == 429:
                wait = min(60, pause_s * (2 ** attempt))
                time.sleep(wait)
                continue
            resp.raise_for_status()
            break
        else:
            if cache_path and frames:
                out = pd.concat(frames, ignore_index=True)
                out = out.sort_values("date").drop_duplicates("date")
                out.to_csv(cache_path, index=False)
            raise RuntimeError(f"Rate limited fetching {chunk_start}–{chunk_end}")

        payload = resp.json()
        daily = payload.get("daily", {})
        df = pd.DataFrame(daily)
        if df.empty:
            raise RuntimeError(f"No daily data for {chunk_start}–{chunk_end}")
        df["date"] = pd.to_datetime(df["time"])
        df = df.drop(columns=["time"])
        frames.append(df)
        if cache_path:
            out = pd.concat(frames, ignore_index=True)
            out = out.sort_values("date").drop_duplicates("date")
            out.to_csv(cache_path, index=False)
        time.sleep(pause_s)

    out = pd.concat(frames, ignore_index=True)
    out = out.sort_values("date").drop_duplicates("date")
    return out


def cache_daily(
    lat: float,
    lon: float,
    start: date,
    end: date,
    cache_dir: Path,
) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    tag = f"open_meteo_{lat:.4f}_{lon:.4f}"
    path = cache_dir / f"{tag}_daily.csv"
    existing = pd.DataFrame()
    if path.exists():
        existing = pd.read_csv(path, parse_dates=["date"])

    need_start = start
    need_end = end
    if not existing.empty:
        have_start = existing["date"].min().date()
        have_end = existing["date"].max().date()
        if have_start <= start and have_end >= end:
            return path
        frames = [existing]
        if start < have_start:
            frames.insert(
                0,
                fetch_daily(
                    lat,
                    lon,
                    start,
                    have_start - timedelta(days=1),
                    cache_path=path,
                ),
            )
        if end > have_end:
            frames.append(
                fetch_daily(
                    lat,
                    lon,
                    have_end + timedelta(days=1),
                    end,
                    cache_path=path,
                )
            )
        out = pd.concat(frames, ignore_index=True)
        out = out.sort_values("date").drop_duplicates("date")
        out.to_csv(path, index=False)
        return path

    df = fetch_daily(lat, lon, need_start, need_end, cache_path=path)
    df.to_csv(path, index=False)
    return path


def crop_year_windows(end_years: list[int]) -> pd.DataFrame:
    rows = []
    for y in end_years:
        rows.append(
            {
                "crop_year_end_year": y,
                "crop_year_label": f"CY{y}",
                "crop_year_start": date(y - 1, 11, 1),
                "crop_year_end": date(y, 10, 31),
            }
        )
    return pd.DataFrame(rows)


def _season_mask(dates: pd.Series, start: date, end: date, months: tuple[int, ...]) -> pd.Series:
    in_window = (dates.dt.date >= start) & (dates.dt.date <= end)
    return in_window & dates.dt.month.isin(months)


def aggregate_crop_year_features(daily: pd.DataFrame, end_year: int) -> dict:
    start = date(end_year - 1, 11, 1)
    end = date(end_year, 10, 31)
    d = daily.copy()
    d = d[(d["date"].dt.date >= start) & (d["date"].dt.date <= end)]
    if d.empty:
        raise ValueError(f"No weather rows for CY{end_year}")

    seasons = {
        "fall_winter": (11, 12, 1),
        "late_winter": (2,),
        "spring": (3, 4, 5),
        "summer": (6, 7, 8),
        "early_fall": (9, 10),
    }
    row: dict = {
        "crop_year_end_year": end_year,
        "crop_year_label": f"CY{end_year}",
        "crop_year_start": start.isoformat(),
        "crop_year_end": end.isoformat(),
        "ppt_annual_mm": float(d["precipitation_sum"].sum()),
        "tmean_annual_c": float(d["temperature_2m_mean"].mean()),
        "et0_annual_mm": float(d["et0_fao_evapotranspiration"].sum()),
    }
    for name, months in seasons.items():
        mask = d["date"].dt.month.isin(months)
        sub = d.loc[mask]
        row[f"ppt_{name}_mm"] = float(sub["precipitation_sum"].sum())
        row[f"tmean_{name}_c"] = float(sub["temperature_2m_mean"].mean())
        row[f"tmax_{name}_c"] = float(sub["temperature_2m_max"].mean())
        row[f"et0_{name}_mm"] = float(sub["et0_fao_evapotranspiration"].sum())
    # Avocado-relevant spring stress proxy
    row["spring_heat_days"] = int((d.loc[d["date"].dt.month.isin((3, 4, 5)), "temperature_2m_max"] > 32).sum())
    row["winter_chill_proxy"] = float(
        d.loc[d["date"].dt.month.isin((11, 12, 1, 2)), "temperature_2m_min"].mean()
    )
    return row


def build_feature_table(daily: pd.DataFrame, end_years: list[int]) -> pd.DataFrame:
    rows = [aggregate_crop_year_features(daily, y) for y in end_years]
    return pd.DataFrame(rows)
