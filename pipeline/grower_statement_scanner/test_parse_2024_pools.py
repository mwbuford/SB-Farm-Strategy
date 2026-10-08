#!/usr/bin/env python3
"""Verify columnar OCR parse for 2024 pool 35a/35b/34b PDFs."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2] / "data" / "grower_statements" / "2024"

EXPECTED = {
    "Jun 23, 2024 TO Jun 29, 2024 pool 35b.pdf": {
        "pool_number": 35,
        "bins_received": 24.0,
        "lbs_grade1": 18844.0,
        "lbs_grade2": 3478.0,
        "lbs_culls": 819.0,
        "lbs_total": 23141.0,
        "gross_amount": 34354.77,
        "net_amount": 28823.72,
        "index_block_id": "241532HA001",
        "period_start": "2024-06-23",
        "period_end": "2024-06-29",
    },
    "Jun 23, 2024 TO Jun 29, 2024 pool 35a.pdf": {
        "pool_number": 35,
        "bins_received": 68.0,
        "lbs_grade1": 56428.2,
        "lbs_grade2": 6518.9,
        "lbs_culls": 2024.9,
        "lbs_total": 64972.0,
        "gross_amount": 93833.34,
        "net_amount": 78248.43,
        "period_start": "2024-06-23",
        "period_end": "2024-06-29",
    },
    "Jun 16, 2024 TO Jun 22, 2024 pool 34 b.pdf": {
        "pool_number": 34,
        "bins_received": 16.0,
        "lbs_grade1": 9570.6,
        "lbs_grade2": 4068.4,
        "lbs_culls": 1806.1,
        "lbs_total": 15445.0,
        "gross_amount": 22040.19,
        "net_amount": 18403.33,
        "period_start": "2024-06-16",
        "period_end": "2024-06-22",
    },
}


def money(s):
    try:
        return float(str(s).replace(",", "").replace("$", "").replace(" ", "").strip())
    except ValueError:
        return None


def parse_date(s):
    m = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", s.replace(".", ""))
    if not m:
        return None
    months = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    }
    mo = months.get(m.group(1).lower()[:3]) or months.get(m.group(1).lower())
    if not mo:
        return None
    return f"{int(m.group(3)):04d}-{mo:02d}-{int(m.group(2)):02d}"


def hints_from_filename(name):
    out = {"pool_number": None, "period_start": None, "period_end": None}
    m = re.search(r"pool\s*(\d+)\s*([ab])?", name, re.I)
    if m:
        out["pool_number"] = int(m.group(1))
    p = re.search(
        r"([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*(?:TO|to|[-–])\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})",
        name,
    )
    if p:
        out["period_start"] = parse_date(p.group(1))
        out["period_end"] = parse_date(p.group(2))
    return out


def extract_index_id(text):
    m = re.search(r"\b(\d{6}HA[0-9O]{3})\b", text, re.I)
    if not m:
        m = re.search(r"BLOCK\s*(?:ID|10|IO)\s*[:\s]*([A-Z0-9 O]{8,14})", text, re.I)
    if not m:
        return None
    cleaned = re.sub(r"\s+", "", m.group(1)).upper().replace("O", "0")
    mm = re.search(r"(\d{6}HA\d{3})", cleaned)
    return mm.group(1) if mm else cleaned


def extract_bins(text):
    m = re.search(r"Bins\s*Received[:\s]+([\d,]+\.\d{2})", text, re.I)
    if m:
        n = money(m.group(1))
        if n and 0 < n < 500:
            return n
    m = re.search(
        r"(?:TO|to)\s*[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}\s*\n\s*([\d,]+\.\d{2})",
        text,
    )
    if m:
        n = money(m.group(1))
        if n and 0 < n < 500:
            return n
    return None


def sum_arr(a):
    return sum(a)


def find_grade_totals(lbs_seq):
    for n1 in range(8, 11):
        if len(lbs_seq) < n1 + 2:
            continue
        sizes1 = lbs_seq[:n1]
        t1 = lbs_seq[n1]
        if abs(sum_arr(sizes1) - t1) > max(2, t1 * 0.02):
            continue
        for n2 in range(8, 11):
            start2 = n1 + 1
            if len(lbs_seq) < start2 + n2 + 2:
                continue
            sizes2 = lbs_seq[start2 : start2 + n2]
            t2 = lbs_seq[start2 + n2]
            if abs(sum_arr(sizes2) - t2) > max(2, t2 * 0.02):
                continue
            idx = start2 + n2 + 1
            culls = None
            if idx < len(lbs_seq):
                culls = lbs_seq[idx]
                if idx + 1 < len(lbs_seq) and abs(lbs_seq[idx + 1] - culls) < 0.15:
                    idx += 1
                idx += 1
            total = lbs_seq[idx] if idx < len(lbs_seq) else None
            expected = t1 + t2 + (culls or 0)
            if total is not None and abs(total - expected) > max(3, expected * 0.03):
                total = lbs_seq[start2 + n2 + 1]
                culls = max(0, round(total - t1 - t2, 1))
            if total is None:
                total = round(expected, 1)
            return {"g1": t1, "g2": t2, "culls": culls, "total": total}
    return None


def columnar(text):
    out = {
        "lbs_grade1": None,
        "lbs_grade2": None,
        "lbs_culls": None,
        "lbs_total": None,
        "gross_amount": None,
        "net_amount": None,
    }
    m = re.search(
        r"POUNDS\s*((?:[\d,]+\.\d+\s*){8,80}?)(?=PERCENT|RATE|AMOUNTS|BLOCK:|Field\s*Receipts|$)",
        text,
        re.I,
    )
    if m:
        nums = []
        for tok in re.findall(r"[\d,]+\.\d+", m.group(1)):
            n = money(tok)
            if n is None:
                continue
            nums.append((n, len(tok.split(".")[1])))
        lbs_seq = [n for n, d in nums if d == 1]
        if len(lbs_seq) >= 12:
            totals = find_grade_totals(lbs_seq)
            if totals:
                out["lbs_grade1"] = totals["g1"]
                out["lbs_grade2"] = totals["g2"]
                out["lbs_culls"] = totals["culls"]
                out["lbs_total"] = totals["total"]
        for i, (n, d) in enumerate(nums):
            if d == 2 and n > 500 and i > len(lbs_seq) * 0.4:
                if out["gross_amount"] is None or n > out["gross_amount"]:
                    out["gross_amount"] = n

    m = re.search(
        r"AMOUNTS\s*((?:[\s\S]*?))(?=Field\s*Receipts|Page\s+\d|$)",
        text,
        re.I,
    )
    if m:
        block = m.group(1)
        money_vals = [money(x) for x in re.findall(r"[\d,]+\.\d{2}", block)]
        money_vals = [x for x in money_vals if x is not None]
        parens = {money(x) for x in re.findall(r"\(\s*([\d,]+\.\d{2})\s*\)", block)}
        large = [x for x in money_vals if x > 500 and x not in parens]
        if large:
            out["gross_amount"] = out["gross_amount"] or max(large)
            out["net_amount"] = large[-1]
            if out["net_amount"] == out["gross_amount"] and len(large) >= 2:
                out["net_amount"] = large[-2]

    if out["net_amount"] is None:
        rs = re.search(r"Field\s*Receipts?[:\s]*([\s\S]{0,500}?)(?:Page\s+\d|$)", text, re.I)
        if rs:
            best = None
            for tok in re.findall(r"[\d,]+\.\d{2}", rs.group(1)):
                n = money(tok)
                if n and n > 500 and (best is None or n > best):
                    best = n
            out["net_amount"] = best
    return out


def parse(text, filename):
    hints = hints_from_filename(filename)
    pool = re.search(r"Pool\s+(\d+)\s*[AB]?\b", text, re.I)
    period = re.search(
        r"([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*(?:TO|to)\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})",
        text,
    )
    col = columnar(text)
    return {
        "pool_number": int(pool.group(1)) if pool else hints["pool_number"],
        "bins_received": extract_bins(text),
        "index_block_id": extract_index_id(text),
        "period_start": parse_date(period.group(1)) if period else hints["period_start"],
        "period_end": parse_date(period.group(2)) if period else hints["period_end"],
        **col,
    }


def main():
    ok_all = True
    for name, exp in EXPECTED.items():
        path = ROOT / name
        doc = fitz.open(path)
        text = "\n".join(page.get_text("text") for page in doc)
        doc.close()
        got = parse(text, name)
        print("=" * 60)
        print(name)
        for k, e in exp.items():
            g = got.get(k)
            if isinstance(e, float):
                match = g is not None and abs(float(g) - e) < 0.15
                status = "OK" if match else "FAIL"
                print(f"  {k:18} exp={e:>12} got={g}  {status}")
            else:
                match = g == e
                status = "OK" if match else "FAIL"
                print(f"  {k:18} exp={e!s:>12} got={g!s}  {status}")
            if not match:
                ok_all = False
    print()
    print("PASS" if ok_all else "FAIL")
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
