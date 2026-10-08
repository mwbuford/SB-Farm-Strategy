#!/usr/bin/env python3
"""Dry-run grower-statement parse against sample OCR text (mirrors Code.gs fixes)."""

from __future__ import annotations

import re

SAMPLE = """
SB FARM LLC
P.O. Box 823
Carpinteria CA 93014
G R O W E R S T A T E M E N T
Index Fresh Inc.
Aug 11, 2023
SB FARM LLC
370 Ortega Ridge Rd,
Santa Barbara CA 93108
GROWER:
GROWER NO: POOL:
DATES:
BINS RECEIVED:
SB FARM LLC BLOCK: SB FARM GR1532 BLOCK ID: 231532HA001 Pool 37 Hass
Jul 09, 2023 TO Jul 15, 2023
88.00
GRADE SIZE POUNDS PERCENT RATE AMOUNTS #1
28 96.7 0.1% 1.2400 119.86
32 470.0 0.6% 1.2400 582.82
36 1,872.5 2.3% 1.2400 2,321.93
40 7,251.5 8.8% 1.2800 9,281.95
48 26,942.5 32.8% 1.3400 36,102.96
60 22,435.0 27.3% 1.1400 25,575.91
70 11,350.9 13.8% .8000 9,080.68
84 7,193.2 8.8% .6600 4,747.54
96 1,462.0 1.8% .2800 409.36
PW 270.9 0.3% .1600 43.35
79,345.3 96.7% 1.1124 88,266.36
#2
28 1.4 0.0% 1.0018 1.40
32 12.9 0.0% 1.0050 13.01
36 45.4 0.1% 1.0063 45.68
40 138.6 0.2% 1.0213 141.54
48 396.6 0.5% 1.0695 424.19
60 299.7 0.4% 1.0319 309.30
70 147.5 0.2% .6404 94.41
84 117.3 0.1% .2673 31.35
96 24.2 0.0% .1230 2.99
PW 2.0 0.0% .0830 .17
1,185.6 1.4% 0.8975 1,064.04
Culls
CULLS 1,524.1 1.9%
1,524.1 1.9%
Total Returns: 82,055.0 100.0% 1.0887 89,330.40 Charges
CAC Percentage of Grower Amount 89,330.40 0.0150 (1,339.96) HAB Rate Per Net Pounds 80,530.9 0.025 (2,013.31) Harvesting Advance (15,400.00)
70,577.13
Field Receipts: 066625 066626 066627 066628 072896 073387 073388
Aug 11, 2023 16:30:49 Page 1 of 1
"""

EXPECTED = {
    "period_start": "2023-07-09",
    "period_end": "2023-07-15",
    "statement_date": "2023-08-11",
    "pool_number": 37,
    "variety": "Hass",
    "bins_received": 88.0,
    "index_block_id": "231532HA001",
    "block_parcel": None,  # ranch name only — GR1532 is grower #, not a block
    "lbs_grade1": 79345.3,
    "lbs_grade2": 1185.6,
    "lbs_culls": 1524.1,
    "lbs_total": 82055.0,
    "avg_rate": 1.0887,
    "gross_amount": 89330.40,
    "charges_total": 18753.27,
    "net_amount": 70577.13,
}


def money(s):
    if s is None:
        return None
    try:
        return float(str(s).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None


def parse_english_date(s):
    m = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", s.replace(".", ""))
    if not m:
        return None
    months = {
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
        "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
        "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
    }
    month = months.get(m.group(1).lower())
    if not month:
        return None
    return f"{int(m.group(3)):04d}-{month:02d}-{int(m.group(2)):02d}"


def extract_bins(text):
    m = re.search(r"Bins\s*Received[:\s]+([\d,]+\.\d{2})", text, re.I)
    if m:
        n = money(m.group(1))
        if n and 0 < n < 500:
            return n
    m = re.search(
        r"(?:TO|to|[-–])\s*[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}\s*\n\s*([\d,]+\.\d{2})\s*(?:\n|$)",
        text,
    )
    if m:
        n = money(m.group(1))
        if n and 0 < n < 500:
            return n
    idx = re.search(r"Bins\s*Received", text, re.I)
    if idx:
        slice_ = text[idx.start() : idx.start() + 500]
        slice_ = re.sub(r"GR\d+", " ", slice_, flags=re.I)
        slice_ = re.sub(r"\b\d{6}HA\d{3}\b", " ", slice_, flags=re.I)
        slice_ = re.sub(r"Block\s*I\.?D\.?[:\s]*[A-Z0-9]+", " ", slice_, flags=re.I)
        slice_ = re.sub(r"Pool\s*#?\s*\d+", " ", slice_, flags=re.I)
        slice_ = re.sub(
            r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}",
            " ",
            slice_,
            flags=re.I,
        )
        for c in re.findall(r"[\d,]+\.\d{2}", slice_):
            n = money(c)
            if n and 0 < n < 500:
                return n
    return None


def grade_bounds(text, key):
    if key == 1:
        start_re = r"Grade[\s\S]{0,80}(?:AMOUNTS?\s*)?[#:]?\s*1\b|AMOUNTS?\s*#\s*1\b"
        end_re = r"(?:^|\n)\s*#\s*2\b|Grade[\s\S]{0,20}[#:]?\s*2\b|Culls?\b|Total\s+Returns"
    elif key == 2:
        start_re = r"(?:^|\n)\s*#\s*2\b|Grade[\s\S]{0,20}#[\s:]*2\b|AMOUNTS?\s*#\s*2\b"
        end_re = r"Culls?\b|Total\s+Returns"
    else:
        start_re = r"\bCulls?\b"
        end_re = r"Total\s+Returns|CAC\s+(?:Percentage|Rate)|HAB\s+Rate|Charges\b"
    sm = re.search(start_re, text, re.I | re.M)
    if not sm:
        return None
    after = text[sm.end() :]
    em = re.search(end_re, after, re.I | re.M)
    end = sm.end() + em.start() if em else len(text)
    return text[sm.start() : end]


def is_size_line(line):
    s = line.strip()
    if re.search(r"\bTota[l1]\b", s, re.I):
        return False
    if re.match(r"^(PW|28|32|36|40|48|60|70|84|96)\b", s, re.I):
        return True
    if re.match(r"^\d{2}\s+[\d,]+\.\d", s):
        return True
    return False


def line_pound(line):
    tokens = re.findall(r"[\d,]+\.\d+", line)
    one = []
    for t in tokens:
        n = money(t)
        if n is None:
            continue
        if len(t.split(".")[1]) == 1 and n >= 10:
            one.append(n)
    if one:
        return max(one)
    return None


def grade_lbs(text, key):
    section = grade_bounds(text, key)
    if not section:
        return None
    best_summary = None
    best = None
    for line in section.splitlines():
        line = line.strip()
        if not line or "Returns" in line:
            continue
        if is_size_line(line):
            continue
        lbs = line_pound(line)
        if lbs is None:
            continue
        is_sum = bool(re.search(r"\bTota[l1]\b", line, re.I)) or (
            len(re.findall(r"[\d,]+\.\d+", line)) >= 2
        )
        if is_sum and (best_summary is None or lbs > best_summary):
            best_summary = lbs
        if best is None or lbs > best:
            best = lbs
    return best_summary if best_summary is not None else best


def parse_summary(line):
    tokens = []
    for m in re.finditer(r"[\d,]+\.\d+", line):
        n = money(m.group(0))
        if n is None:
            continue
        tokens.append((m.group(0), n, len(m.group(0).split(".")[1])))
    lbs = percent = rate = amount = None
    for raw, n, d in tokens:
        if d == 1 and n >= 20 and n != 100 and lbs is None:
            lbs = n
    for raw, n, d in tokens:
        if lbs is not None and n == lbs:
            continue
        if d == 1 and 0 <= n <= 100.05 and percent is None:
            percent = n
            continue
        if 0.05 < n < 8 and rate is None and n != percent:
            rate = n
            continue
        if amount is None and d == 2 and n > 100 and n != lbs:
            amount = n
    return lbs, rate, amount


def total_returns(text):
    idx = re.search(r"Total\s+Returns", text, re.I)
    if not idx:
        return None, None, None
    after = re.sub(r"^[\s\S]*?Total\s+Returns[:\s]*", "", text[idx.start() :], count=1, flags=re.I)
    line = after.split("\n")[0]
    lbs, rate, amount = parse_summary(line)
    m = re.search(r"([\d,]+\.\d)\b", after)
    if m:
        n = money(m.group(1))
        if n and n > 100:
            lbs = n
    if amount is None or amount <= 100.5:
        for t in re.findall(r"([\d,]+\.\d{2})\b", after):
            a = money(t)
            if a and a > 100 and a != lbs:
                amount = a
                break
    return lbs, rate, amount


def net_amount(text):
    m = re.search(
        r"Harvesting\s+Advance\s*\(\s*[\d,]+\.\d{2}\s*\)\s*([\d,]+\.\d{2})",
        text,
        re.I,
    )
    if m:
        return money(m.group(1))
    m = re.search(r"([\d,]+\.\d{2})\s*(?:\n|\r)+\s*Field\s*Receipts", text, re.I)
    if m:
        return money(m.group(1))
    return None


def charges(text):
    total = 0.0
    found = 0
    block_m = re.search(
        r"(?:CAC|HAB|Harvesting\s+Advance|Charges)[\s\S]{0,900}?(?=Field\s*Receipts|Page\s+\d|$)",
        text,
        re.I,
    )
    block = block_m.group(0) if block_m else text
    for m in re.finditer(r"\(\s*\$?\s*([\d,]+\.\d{2})\s*\)", block):
        a = money(m.group(1))
        if a and a >= 0.5:
            total += a
            found += 1
    return round(total, 2) if found else None


def parse(text):
    period = re.search(
        r"([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*(?:TO|to|[-–])\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})",
        text,
    )
    stmt = re.search(r"\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2})\b", text)
    pool = re.search(r"Pool\s+(\d+)", text, re.I)
    idx = re.search(r"\b(\d{6}HA\d{3})\b", text, re.I)
    # Ranch block names only — never GR#### grower codes
    KNOWN = [
        "Ardillas", "Codornices", "Colibri", "Tecolotes", "Venados", "Gato Montez",
        "Ranas", "El Puma", "Las Abejas", "Gavilanes", "Los Osos", "Caballos", "La Casa", "Cuervos",
    ]
    block_parcel = None
    compact = re.sub(r"[^A-Za-z0-9]+", "", text).upper()
    for name in KNOWN:
        key = re.sub(r"[^A-Za-z0-9]+", "", name).upper()
        if key and key in compact:
            block_parcel = name
            break
    lbs1 = grade_lbs(text, 1)
    lbs2 = grade_lbs(text, 2)
    culls = grade_lbs(text, "culls")
    tot_lbs, rate, gross = total_returns(text)
    net = net_amount(text)
    chg = charges(text)
    return {
        "period_start": parse_english_date(period.group(1)) if period else None,
        "period_end": parse_english_date(period.group(2)) if period else None,
        "statement_date": parse_english_date(stmt.group(1)) if stmt else None,
        "pool_number": int(pool.group(1)) if pool else None,
        "variety": "Hass" if re.search(r"\bHass\b", text, re.I) else None,
        "bins_received": extract_bins(text),
        "index_block_id": idx.group(1) if idx else None,
        "block_parcel": block_parcel,
        "lbs_grade1": lbs1,
        "lbs_grade2": lbs2,
        "lbs_culls": culls,
        "lbs_total": tot_lbs,
        "avg_rate": rate,
        "gross_amount": gross,
        "charges_total": chg,
        "net_amount": net,
    }


def main():
    got = parse(SAMPLE)
    ok = True
    print(f"{'field':22} {'expected':>14} {'got':>14}  status")
    print("-" * 60)
    for k, exp in EXPECTED.items():
        g = got.get(k)
        if isinstance(exp, float):
            match = g is not None and abs(float(g) - exp) < 0.05
            g_disp = f"{g:.4f}" if isinstance(g, float) else g
            e_disp = f"{exp:.4f}"
        else:
            match = g == exp
            g_disp, e_disp = g, exp
        status = "OK" if match else "FAIL"
        if not match:
            ok = False
        print(f"{k:22} {str(e_disp):>14} {str(g_disp):>14}  {status}")
    print()
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
