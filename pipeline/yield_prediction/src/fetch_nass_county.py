"""Fetch CA avocado stats from USDA NASS Quick Stats (requires free API key).

Get a key: https://quickstats.nass.usda.gov/api
Then: export NASS_API_KEY=...
      python src/fetch_nass_county.py
"""

from __future__ import annotations

import csv
import os
import sys
import urllib.parse
import urllib.request
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "nass_avocado_county.json"
OUT_CSV = ROOT / "data" / "processed" / "nass_socal_county_panel.csv"

COUNTIES = {
    "VENTURA": "Ventura",
    "SANTA BARBARA": "Santa Barbara",
    "SAN DIEGO": "San Diego",
    "RIVERSIDE": "Riverside",
    "SAN LUIS OBISPO": "San Luis Obispo",
}


def fetch(key: str) -> dict:
    params = {
        "key": key,
        "commodity_desc": "AVOCADOS",
        "state_alpha": "CA",
        "agg_level_desc": "COUNTY",
        "year__GE": "2010",
        "format": "JSON",
    }
    url = "https://quickstats.nass.usda.gov/api/api_GET/?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def to_rows(payload: dict) -> list[dict]:
    data = payload.get("data") or []
    rows = []
    for d in data:
        county = (d.get("county_name") or "").upper()
        if county not in COUNTIES:
            continue
        item = d.get("short_desc") or d.get("statisticcat_desc") or ""
        rows.append(
            {
                "year": d.get("year"),
                "county": COUNTIES[county],
                "short_desc": d.get("short_desc"),
                "statisticcat_desc": d.get("statisticcat_desc"),
                "unit_desc": d.get("unit_desc"),
                "value": d.get("Value"),
                "source_desc": d.get("source_desc"),
            }
        )
    return rows


def main() -> int:
    key = os.environ.get("NASS_API_KEY", "").strip()
    if not key:
        print("Set NASS_API_KEY (free at https://quickstats.nass.usda.gov/api)", file=sys.stderr)
        return 1
    payload = fetch(key)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload), encoding="utf-8")
    rows = to_rows(payload)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        if not rows:
            print("No county rows returned — check API filters / key", file=sys.stderr)
            return 2
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows -> {OUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
