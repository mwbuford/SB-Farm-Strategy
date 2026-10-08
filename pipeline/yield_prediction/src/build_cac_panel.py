"""Rebuild processed CAC statewide season panel from downloaded CSV."""

from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cac_hist.csv"
OUT = ROOT / "data" / "processed" / "cac_ca_season_panel.csv"


def century_year(yy: str) -> int:
    y = int(yy)
    return 1900 + y if y >= 71 else 2000 + y


def num(x: str):
    x = x.replace("$", "").replace(",", "").replace("¢", "").strip()
    return None if x in ("", "-") else float(x)


def main() -> None:
    rows = []
    with RAW.open(newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            cells = [c.strip() for c in row]
            year = next((c for c in cells if re.fullmatch(r"\d{2}/\d{2}", c)), None)
            if not year:
                continue
            a_s, b_s = year.split("/")
            a, b = century_year(a_s), century_year(b_s)
            if a_s == "99" and b_s == "00":
                a, b = 1999, 2000
            rest = cells[cells.index(year) + 1 :]
            acres = num(rest[0])
            vol_m = num(rest[1])
            rows.append(
                {
                    "season_label": f"{a_s}/{b_s}",
                    "crop_year_start": f"{a}-11-01",
                    "crop_year_end": f"{b}-10-31",
                    "crop_year_end_year": b,
                    "crop_year_label": f"CY{b}",
                    "bearing_acres": acres,
                    "volume_million_lbs": vol_m,
                    "volume_lbs": None if vol_m is None else vol_m * 1_000_000,
                    "crop_value_usd": num(rest[2]),
                    "price_cents_per_lb": num(rest[3]),
                    "avg_dollars_per_bearing_acre": num(rest[4]),
                    "avg_lbs_per_bearing_acre": num(rest[5]) if len(rest) > 5 else None,
                    "geography": "California",
                    "source": "CAC Industry Statistical Data spreadsheet",
                    "is_holdout_season": b == 2025,
                }
            )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} seasons -> {OUT}")


if __name__ == "__main__":
    main()
