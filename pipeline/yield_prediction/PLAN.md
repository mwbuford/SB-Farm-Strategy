# Avocado Yield Prediction Plan — SoCal → Ortega Ridge

**Status:** Decisions locked 2026-07-28 · v1 scaffold started (`DECISIONS.md`, CAC panel built)

**Goal:** Predict avocado yield from weather + slope + soil, trained on Southern California / CA data, applied to 370 Ortega Ridge (Summerland).  
**Holdout test:** **CY2025** ranch total lbs (crop year **2024-11-01 → 2025-10-31**). Not used in training.  
**Ranch note:** CY2025 harvest was **shorter than usual** — call out in evaluation.

---

## Locked decisions

| Item | Choice |
|---|---|
| Target | Ranch **total** lbs |
| Time | CAC crop year Nov 1 – Oct 31 |
| Test | CY2025 |
| Approach | **Fast v1** (CAC/CA panel + PRISM → ranch transfer + bias correction) |
| Incomplete lbs | Statements first; else bins × **40 lb/bin** |
| Slope/soil v1 | Ranch static (L1/L2 + point DEM/SSURGO); county/CA means in train |

---

## 0. Reality check (lock this first)

| Constraint | Implication |
|---|---|
| Open SoCal **grove-level** multi-year yield is rare | Training set will be mostly **county–season** (and maybe CAC acreage polygons with county yield as proxy) |
| Slope/soil vary **within** a ranch | Ranch application needs **block-level** features from DEM + SSURGO + your soil reports |
| “2025 yield” must be defined | Use **CA avocado crop year** (confirm: typically Nov–Oct marketing year) **or** calendar 2025 — pick one and stick to it |
| Best ranch signal is your own logs | Model should be **hierarchical**: SoCal prior + ranch block features; final accuracy depends on having 2025 (and ideally 2022–2024) ranch lbs/bins |

**Success criteria (propose):**
- Primary: predict **2025 Ortega Ridge total avocado lbs** (or bins → lbs conversion) within ±20% of actual.
- Secondary: rank blocks by expected yield/acre (Spearman correlation > 0.5 vs actual block rankings if block yield exists).
- Baseline to beat: “use 3-year ranch average” and “use SB county NASS yield × bearing acres.”

---

## 1. Define the prediction target

**Ranch target (test & apply)**
- `y_ranch_2025` = total Hass (and other varieties if needed) **utilized lbs** for the chosen 2025 window.
- Preferred source order:
  1. Sum of `grower_statements.lbs_total` (settled truth)
  2. Else `bin_receipts.full_bins` × assumed lbs/bin (document conversion; calibrate from statements when both exist)
  3. Else `harvest_log.bins` (field estimate only)

**Optional finer target (if data allows)**
- `y_block_week` or `y_block_season` from pickups by `block_parcel`.

**Decision needed from you before build:**
- [ ] Crop year window for “2025” (dates)
- [ ] Lbs-per-bin assumption if statements incomplete
- [ ] Scope: total ranch only **vs** block-level predictions

---

## 2. Training universe (SoCal)

### 2A — Core panel (minimum viable)
Build a table of **county × season** for: Ventura, Santa Barbara, San Diego, Riverside, San Luis Obispo (≈90%+ of CA acres).

| Column | Source |
|---|---|
| county, year/season | key |
| bearing_acres | NASS Quick Stats / County Ag Commissioner / CAC mapping |
| production_lbs or tons | NASS / county crop reports |
| yield_lbs_per_ac | production / bearing acres |
| weather features | PRISM (ppt, tmin, tmax, tmean) + optional CIMIS ETo |
| soil/slope proxies | county-mean SSURGO attributes in avocado mask (if CAC/Land IQ polygons available) |

### 2B — Upgrade path (if time)
- Join CAC/Land IQ avocado polygons (condition, age, density) → aggregate weather/soil/slope **inside avocado acres only** (not whole-county mean).
- Age/condition become features (strong yield drivers).

### 2C — What we will **not** pretend
- We will not claim open per-grove historical yield labels for thousands of SoCal farms unless a licensed CAC dataset appears.

---

## 3. Feature engineering

### Weather (primary)
- **PRISM** monthly/daily grids (4 km or 800 m) at county centroids **and** at Ortega Ridge lat/lon.
- Season windows aligned to avocado phenology (document assumptions with UCCE Faber notes):
  - Winter chill / bloom window temps
  - Spring heat extremes
  - Growing-season precip + dry-season stress (ETo − precip)
- Suggested features per season: precip sum, mean tmax/tmin, count of days tmax > threshold, frost/near-frost days, rolling prior-year precip (alternate bearing).

### Slope
- USGS 3DEP / DEM → mean slope %, slope class shares, aspect (N/S), elevation for:
  - each SoCal training unit (county avocado mask or sample points)
  - each Ortega Ridge **block** (or 30–50 m grid cells rolled to blocks)

### Soil
- **SSURGO**: clay %, AWC, drainage class, erodibility, depth
- **Ranch overlay:** L1/L2 map units (Todos TbE2, Diablo DaD, etc.) + % of each block
- Encode: dominant series, % clay-loam vs clay, erosion hazard class

### Ranch static context
- Bearing acres by block (from `blocks` + L2 43.2 ac avocado footprint)
- Variety (mostly Hass)
- Optional: irrigation intensity proxy later (not required for v1)

---

## 4. Dataset build steps (execution order)

| Step | Task | Output |
|---|---|---|
| 1 | Pull NASS + county crop reports (2010–2024) for 5 SoCal counties | `socal_yield_panel.csv` |
| 2 | Download PRISM monthly 2010–2025 for SoCal bbox + ranch point | `weather/` rasters or extracted series |
| 3 | Get DEM + SSURGO for SoCal avocado counties + ranch AOI | `terrain/`, `soils/` |
| 4 | (Optional) CAC acreage tables/polygons by year | `acreage_by_county_year.csv` |
| 5 | Export ranch 2022–2025 pickups/statements from master sheet | `ranch_yield_actuals.csv` |
| 6 | Build block polygons or centroids (manual from map if needed) | `ranch_blocks.geojson` |
| 7 | Feature join → modeling table | `model_matrix.parquet` |

**Repo location (proposed):**  
`pipeline/yield_prediction/`

---

## 5. Model strategy

### Stage A — SoCal regional model
- Train on county–season rows, **years ≤ 2024** (never 2025).
- Models: baseline (mean yield), Ridge/Elastic Net, Gradient Boosting (HistGBM / XGBoost).
- Cross-val: leave-one-year-out **and** leave-one-county-out (tests spatial transfer).

### Stage B — Ranch transfer
Two acceptable approaches (pick based on ranch history depth):

**B1 — Direct transfer (few ranch years):**  
Apply Stage A model to Ortega Ridge features (weather 2025 + soil/slope). Recalibrate with a simple bias correction using 2022–2024 ranch actuals if available (`ŷ_ranch = a + b·ŷ_socal_transfer`).

**B2 — Hierarchical / residual model (preferred if ≥3 ranch seasons):**  
`y_ranch = f_socal(weather) + g(soil, slope, acres) + ranch residual`.  
Train `g` + residual on ranch block-years; keep 2025 fully held out.

### Explicit holdout
- **Test set = 2025 ranch actual yield only** (and optionally 2025 SB county as a secondary check).
- No tuning on 2025. Lock hyperparameters on 2010–2024 CV before touching 2025.

---

## 6. Evaluation & deliverables

1. Metrics vs baselines: MAE, MAPE, ±20% hit rate on 2025 ranch total.
2. Feature importance / partial dependence (weather vs soil vs slope).
3. Block map: predicted lbs/acre for Ortega Ridge (even if trained regionally).
4. Short memo: what the model can/can’t say; data gaps; next season improvements.
5. Reproducible notebook or script: `train.py`, `predict_ranch_2025.py`, `config.yaml`.

---

## 7. Timeline (practical)

| Phase | Time | Work |
|---|---|---|
| **P0** | 0.5 day | Lock crop-year definition, lbs/bin, ranch actuals export for 2022–2025 |
| **P1** | 1–2 days | Build SoCal yield panel + PRISM weather features |
| **P2** | 1–2 days | DEM slope + SSURGO + ranch soil join |
| **P3** | 1–2 days | Train/CV regional models; pick champion |
| **P4** | 0.5–1 day | Transfer to ranch; **score 2025 holdout**; write results |
| **P5** | 0.5 day | Package scripts + one-page owner summary |

**Total:** ~1–1.5 weeks of focused work.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| County yield ≠ hillside orchard yield | Emphasize transfer + ranch bias correction; report uncertainty bands |
| 2025 ranch lbs incomplete | Prioritize grower statements; document any bin→lb conversion |
| Alternate bearing / bloom weather | Include prior-year yield & winter/spring weather features |
| Slope/soil dominate locally but weak in county panel | Use ranch block features in Stage B; don’t overclaim Stage A soil coefficients |
| CAC spatial data access limited | Fall back to county means; still usable for weather-driven season forecast |

---

## 9. Immediate next actions (start execution)

1. Confirm **2025 date window** and export ranch actuals from the master sheet.
2. Create folder `pipeline/yield_prediction/` with `data/raw`, `data/processed`, `notebooks`, `src`.
3. Pull first NASS Quick Stats extract for avocado yield/production/acreage for the 5 SoCal counties (2010–2024).
4. Geocode Ortega Ridge + list block centroids/acres.

---

## 10. Decision checklist (reply with choices)

- [ ] Crop year definition for “2025 yield”: ________________
- [ ] Predict **ranch total only** or **per-block**?
- [ ] Do you have grower statements / pickup totals for **2022–2024** as well as 2025?
- [ ] OK to use **bins × lbs/bin** if lbs incomplete? Suggested default lbs/bin: ____
- [ ] Priority: **fast v1** (county weather model + ranch apply) vs **full** (CAC polygons + block DEM/soil)?
