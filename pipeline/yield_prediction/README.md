# Yield prediction — Ortega Ridge (v1)

Predict **ranch-total avocado lbs** for CAC crop years (Nov 1 → Oct 31), trained on SoCal/CA history, **test = CY2025** (2024-11-01 → 2025-10-31).

See `DECISIONS.md` and `PLAN.md`.

## Locked choices

- Crop year (not calendar year)
- Ranch total (not per-block v1)
- Fast v1: CAC statewide panel + weather transfer → ranch; bias-correct with complete CY2021–CY2024 ranch actuals
- Default **40 lb/bin** until statement calibration
- CY2025 was a **shorter** ranch harvest — flagged in evaluation

## Setup

```bash
cd pipeline/yield_prediction
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run v1 pipeline (no ranch lbs required)

```bash
python src/run_pipeline.py
```

This will:

1. Pull ERA5 daily weather via [Open-Meteo archive](https://open-meteo.com/en/docs/historical-weather-api) for the ranch point (CA statewide proxy for training)
2. Build crop-year weather features → `data/processed/weather_features_ca_statewide_proxy.csv`
3. Merge with CAC panel → `data/processed/training_table_v1.csv`
4. Train Ridge model on **CY2010–CY2024**, hold out **CY2025** CA lbs/ac
5. Forecast ranch CY2025 total → `outputs/ranch_forecast_v1.csv`

Outputs also include `outputs/model_metrics_v1.json` and `outputs/cac_predictions_v1.csv`.

## Ranch actuals (from grower statements)

```bash
# From a master-sheet CSV export (or Downloads copy):
python src/build_ranch_actuals.py \
  --input "/path/to/Summerland Farm Operations - grower_statements.csv"

# Writes:
#   data/raw/grower_statements.csv
#   data/processed/ranch_actuals.csv
#   data/processed/lbs_per_bin_calibration.json
```

Crop-year totals use **`sum(lbs_total)`** with CAC windows (Nov 1 → Oct 31).  
Index Fresh `bins_received` are **field bins (~960 lb median)**, not 40 lb units — config is updated.

Then:

```bash
python src/predict_ranch.py --actuals data/processed/ranch_actuals.csv --crop-year CY2025
```

Bias correction uses complete pre-holdout seasons (skips thin years like a 3-pool CY2023 stub).  
Outputs: `outputs/ranch_forecast_v1.csv`, `outputs/ranch_scorecard_v1.csv`.

**CY2025 is the test label — do not use it when fitting.** CY2026 in actuals may still be mid-season.

## Individual steps

```bash
# Free NASS key → county panel (optional v2)
export NASS_API_KEY=...
python src/fetch_nass_county.py

# Rebuild CAC panel anytime
python src/build_cac_panel.py

# Weather only
python src/build_weather_features.py --tag ca_statewide_proxy
python src/build_training_table.py --weather-tag ca_statewide_proxy
python src/train_model.py
python src/predict_ranch.py
```

## Artifacts

| Artifact | Path |
|---|---|
| CAC CA season panel (1972–2025) | `data/processed/cac_ca_season_panel.csv` |
| Weather features | `data/processed/weather_features_ca_statewide_proxy.csv` |
| Training table | `data/processed/training_table_v1.csv` |
| Ranch static soil/slope | `data/processed/ranch_static_features.csv` |
| Model + metrics | `outputs/model_v1.joblib`, `outputs/model_metrics_v1.json` |
| Ranch forecast | `outputs/ranch_forecast_v1.csv` |

## Model outline (v1)

1. Train on CAC `avg_lbs_per_bearing_acre` ~ f(weather) for seasons **CY2010–CY2024**
2. Predict CY2025 CA lbs/ac from CY2025 weather
3. Scale to ranch: `ŷ = ŷ_lbs_ac × 43.2 ac` then bias-correct with mean(ranch_actual / ŷ) on complete CY2021–24 (annual Index Fresh totals + weekly rollups)
4. Score vs CY2025 ranch actual; report MAPE and ±20% hit

v2: NASS county panel + PRISM/CIMIS + DEM/SSURGO + block features.
