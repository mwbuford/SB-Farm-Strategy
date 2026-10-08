# Summerland Farm Operations

Work from a summer 2026 farm strategy internship at a ~80-acre avocado, citrus, and passionfruit ranch in Summerland, CA.

The main deliverable is an **operations data pipeline**. Google Forms and Apps Script web apps feed one master Google Sheet. That sheet rolls the data up into metrics tabs and an **owner dashboard**. Alongside it: a Python avocado yield-forecast model, farm-visit research decks, and the supporting data.

> **Confidential:** this repo contains the ranch's real grower statements and sales data. Keep the GitHub repo **private** unless the owner approves sharing.

## Example dashboard

[`dashboard_example/Summerland_Owner_Dashboard_Example.csv`](dashboard_example/Summerland_Owner_Dashboard_Example.csv) is a snapshot of the final owner dashboard as delivered in August 2026. Sections appear top to bottom in the same order as the live sheet, and each chart is replaced by the table that feeds it:

| Section | What it shows |
|---|---|
| This year | Net revenue, lbs harvested, avg $/lb, bins picked |
| Operations / finance strip | Latest week's bins, year-to-date labor cost |
| Year-over-year | Current season vs. prior season |
| Historical trends | Net $, gross $, lbs and bins by year (2021–2026) |
| Grade mix | #1 / #2 / culls split |
| Weekly harvest | Bins picked per week |
| Block performance | Bins, lbs, net $ and $/lb per orchard block |
| Labor cost by week | Est. labor $ and hours per week |
| Market | Hass mid $/lb by size from Index Fresh "Fresh Facts" reports |
| Exotics & passionfruit | Passionfruit by year, all exotics by product, current-year fruit sales |

The numbers are real master-sheet data, except the **labor figures, which are illustrative** (the crew's labor form responses weren't exported). To regenerate it:

```bash
python3 dashboard_example/build_dashboard_example.py
```

In production, the dashboard is a Google Sheets tab built by [`pipeline/master_sheet/DashboardSetup.gs`](pipeline/master_sheet/DashboardSetup.gs). It has charts, color-coded KPI cards, and a **Summerland Dashboard** menu for switching the avocado and exotics years.

## Repository layout

```
.
├── dashboard_example/        Example owner dashboard (CSV) + script that builds it
├── pipeline/                 The operations data pipeline
│   ├── docs/                 Pipeline design spec, workflow diagram, "where forms go" guide
│   ├── master_sheet/         Master sheet setup, metrics formulas, dashboard, exotics import
│   ├── forms/                Google Form builders + checklist
│   ├── bin_receipt_scanner/  Web app: Index Fresh bin receipt photo → bin_receipts / bin_numbers
│   ├── grower_statement_scanner/  Web app: grower statement PDF (Drive OCR) → grower_statements
│   ├── fresh_facts_scanner/  Gmail → Fresh Facts Hass market price tables
│   ├── owner_notes/          Web app: owner meeting notes / photos → Google Doc + sheet
│   └── yield_prediction/     Python model forecasting ranch avocado lbs per crop year
├── data/
│   ├── grower_statements/    Index Fresh statements (PDF, 2021–2026) + master-sheet export
│   ├── exotic_sales/         Exotics / passionfruit sales by year (CSV)
│   ├── market_prices/        Example Fresh Facts weekly price report
│   └── soil/                 Soil data workbook + text extracts of site assessment reports
├── presentations/            Farm-visit lessons decks (PPTX), speaker notes, build scripts
└── docs/internship/          Role description, kickoff notes, schedule, background research
```

## How the pipeline fits together

```
Field crew / owner                       Master Google Sheet                       Owner
──────────────────                       ───────────────────                       ─────
Harvest Log form        ─┐
Worker Hours form        │               log tabs (harvest_log, labor_log,
Passionfruit Sales form  ├──────────▶    bin_receipts, grower_statements, …)
Field Notes form         │                        │
Bin Receipt web app      │                        ▼
Grower Statement web app │               metrics_* tabs (formula rollups)  ──▶  DASHBOARD tab
Owner Notes web app     ─┘                        ▲
Fresh Facts (Gmail)     ──────────────────────────┘
```

Start with [`pipeline/docs/MASTER_PIPELINE_DESIGN.md`](pipeline/docs/MASTER_PIPELINE_DESIGN.md) for the full tab and form reference. Each component folder has its own `SETUP.md`.

### Setting up the Google Sheet

1. Create an Apps Script project bound to a new Google Sheet and paste in `pipeline/master_sheet/MasterSetup.gs`. Run `createMasterWorkbook()` to create every log and metrics tab.
2. Build the forms using `pipeline/forms/FORM_BUILD_CHECKLIST.md`, then link each one to its tab.
3. Deploy the web apps (`bin_receipt_scanner`, `grower_statement_scanner`, `owner_notes`) and the Gmail importer (`fresh_facts_scanner`) by following each folder's `SETUP.md`.
4. Paste `DashboardSetup.gs` and `PassionfruitImport.gs` into the same project, then run `createOwnerDashboard()`. Details: [`pipeline/master_sheet/DASHBOARD_SETUP.md`](pipeline/master_sheet/DASHBOARD_SETUP.md), [`METRICS.md`](pipeline/master_sheet/METRICS.md).

### Yield prediction (Python)

```bash
cd pipeline/yield_prediction
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python src/run_pipeline.py
```

See [`pipeline/yield_prediction/README.md`](pipeline/yield_prediction/README.md) for the model design, decisions and outputs.

### Presentations

`presentations/farm_visit_deck/` holds the final versions of both farm-visit decks, plus the `python-pptx` scripts that generate them (`build_deck.py`, `build_visit_lessons_deck.py`). Those scripts use the compressed photos in `images/*/_preview/`.

## Not included in the repo

These stayed in the original working folder:

- Travel receipts and personal planning documents
- Superseded deck versions (11 timestamped copies) and original HEIC/MOV phone media
- The 226 MB county CDP plan set and the 49–73 MB soil consultant reports (PDF/DOCX). Text extracts of the soil reports are in `data/soil/`.
- The Python virtual environment (`.venv`)
