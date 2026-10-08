#!/usr/bin/env python3
"""Build exotics_sales_summary CSV from local SB Farm exotics exports (summaries only)."""

from __future__ import annotations

import argparse
import csv
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SKIP_RE = re.compile(
    r"sales by|total cash|deposits to|unaccounted|benchmark|running total|"
    r"seasonally|estimate|checksum|weeks paid|amt ",
    re.I,
)

HEADERS = ["year", "product", "total_lbs", "total_revenue", "avg_price_per_lb"]
DEFAULT_INPUT = Path(__file__).resolve().parents[2] / "data" / "exotic_sales"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "outputs" / "exotics_sales_summary.csv"


def parse_money(v):
    if not v:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace("$", "").replace(",", "").strip())
    except ValueError:
        return None


def parse_qty(v):
    if not v:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def parse_date(s):
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            pass
    return None


def classify(fruit: str) -> str | None:
    raw = fruit.strip()
    if not raw:
        return None
    f = re.sub(r"\s+", " ", raw.lower())
    if re.search(r"avocado|^avos$", f):
        return None
    if re.search(r"passion|mix passion", f) or re.fullmatch(r"red|yellow|passion", f):
        return "Passionfruit"
    if re.search(r"chile", f):
        return "Chiles"
    if re.search(r"lemon", f):
        return "Lemons"
    if re.search(r"dragon", f):
        return "Dragonfruit"
    if re.search(r"orange", f):
        return "Oranges"
    if re.search(r"melon", f):
        return "Melon"
    if re.fullmatch(r"mix", f):
        return "Mix"
    return "Other"


def is_summary(date_s, fruit):
    return bool(SKIP_RE.search(date_s or "") or SKIP_RE.search(fruit or ""))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    totals: dict[tuple[int, str], dict[str, float]] = defaultdict(lambda: {"lbs": 0.0, "rev": 0.0})

    for path in sorted(args.input_dir.glob("SB Farm exotics - *.csv")):
        with path.open(newline="", encoding="utf-8-sig") as fh:
            reader = csv.reader(fh)
            next(reader, None)
            for row in reader:
                if len(row) < 6:
                    continue
                date_s, _, fruit, _, qty, total = row[0], row[1], row[2], row[3], row[4], row[5]
                if is_summary(date_s, fruit):
                    break
                if not date_s or not fruit:
                    continue
                product = classify(fruit)
                if not product:
                    continue
                dt = parse_date(date_s)
                q, r = parse_qty(qty), parse_money(total)
                if not dt or q is None or r is None:
                    continue
                key = (dt.year, product)
                totals[key]["lbs"] += q
                totals[key]["rev"] += r

    rows = []
    for (year, product) in sorted(totals):
        t = totals[(year, product)]
        avg = t["rev"] / t["lbs"] if t["lbs"] else ""
        rows.append([year, product, round(t["lbs"], 2), round(t["rev"], 2), round(avg, 4) if avg else ""])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(HEADERS)
        w.writerows(rows)

    print(f"Wrote {len(rows)} summary rows to {args.out}")
    for row in rows:
        print(f"  {row[0]} {row[1]}: {row[2]:,.0f} lbs, ${row[3]:,.2f}, ${row[4]}/lb")


if __name__ == "__main__":
    main()
