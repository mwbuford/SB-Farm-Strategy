# Locked project decisions — Ortega Ridge avocado yield model

## Decisions (2026-07-28)

| Item | Choice |
|---|---|
| Target | **Ranch total** Hass avocado yield (lbs) |
| Time unit | **CAC crop year** Nov 1 → Oct 31 |
| Test holdout | **2024–25 crop year** (Nov 1, 2024 – Oct 31, 2025) — “2025 season”; note: shorter harvest window on ranch |
| Train years | Crop years ending **2010–2024** (no 2024–25 ranch labels in fit/tune) |
| Approach | **Fast v1**: SoCal 5-county panel + PRISM weather → transfer to ranch + bias correction |
| Lbs if incomplete | Prefer `grower_statements.lbs_total`; else `full_bins × lbs_per_bin` |
| Default lbs/bin | **40 lb** field bin until calibrated from statement÷bins overlap |
| Slope/soil v1 | Ranch static features from L1/L2 + SSURGO/DEM at ranch point; county means for training |
| Upgrade later | CAC polygons + block DEM/soil (v2) |

## Crop-year labels

| Label | Window |
|---|---|
| CY2025 (test) | 2024-11-01 → 2025-10-31 |
| CY2024 | 2023-11-01 → 2024-10-31 |
| CY2023 | 2022-11-01 → 2023-10-31 |
| … | … |

Ranch note: CY2025 harvest was **shorter than usual** — model should still predict full crop-year lbs; evaluation memo will call out shorter season as a caveat (possible under-delivery vs weather potential).

## SoCal training counties

Ventura, Santa Barbara, San Diego, Riverside, San Luis Obispo

## Ranch

- Site: 370 Ortega Ridge Rd, Summerland/Montecito, CA
- Avocado footprint (L2): ~43.2 acres planted (consolidate plan exists; use current bearing estimate in config)
- Coords (approx ridge): set in `config.yaml`
