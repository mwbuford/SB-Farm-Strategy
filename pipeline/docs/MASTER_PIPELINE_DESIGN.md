# Farm Operations Master Pipeline — Design Spec

**Ranch:** 370 Ortega Ridge Road, Summerland/Montecito, CA  
**Users:** Armando (daily logging) · Owner (dashboard) · Max (build & QA)  
**Updated:** July 7, 2026

---

## Overview

One **master Google Sheet** is the single source of truth. Four lightweight **Google Forms** plus two Apps Script web apps (bin receipts + grower statements) feed data into log tabs. Metrics tabs roll up each log for the owner dashboard.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ARMANDO / MAX (phone or laptop)                 │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────────┤
│ Form 1   │ Form 2   │ Form 3   │ Form 4   │ Form 5   │ Form 6           │
│ Harvest  │ Worker   │ Passion  │ Field    │ Bin      │ Grower Statement │
│ Log      │ Hours    │ fruit    │ Notes    │ Receipt  │ PDF Upload       │
│          │          │ Sales    │          │ Photo    │                  │
│ (Form)   │ (Form)   │ (Form)   │ (Form)   │ (Web App)│ (Web App)        │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┴────────┬─────────┘
     │          │          │          │          │              │
     ▼          ▼          ▼          ▼          ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              MASTER SHEET: "Summerland Farm Operations"                 │
│  INDEX · blocks · harvest_log · labor_log · passionfruit_sales          │
│  field_notes · bin_receipts · bin_numbers                               │
│  grower_statements · grower_statement_receipts                          │
│  metrics_pickups · metrics_avocado · metrics_block_returns              │
│  metrics_labor · metrics_passionfruit                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Master Sheet — Tab Reference

| Tab | Type | Fed by | Purpose |
|---|---|---|---|
| `INDEX` | Guide | Manual | Form links, SOP, last-updated notes |
| `blocks` | Reference | Manual (Max) | Block IDs matching Index Fresh receipts (e.g. L05 0505) |
| `harvest_log` | Log | Form 1 | Field harvest activity (bins picked, crew, block) |
| `labor_log` | Log | Form 2 | Hours and pay by worker/activity/block |
| `passionfruit_sales` | Log | Form 3 | Sales by channel, qty, revenue |
| `field_notes` | Log | Form 4 | Irrigation, pest, equipment, tree health notes |
| `owner_notes` | Log | Form 7 | Sarah — consultant/agronomist notes + photo OCR → Google Doc |
| `bin_receipts` | Log | Photo upload | One row per Index Fresh pickup receipt |
| `bin_numbers` | Log | Photo upload | One row per individual bin # |
| `grower_statements` | Log | PDF upload | One row per Index Fresh statement page (block × pool week) |
| `grower_statement_receipts` | Log | PDF upload | One row per Field Receipt # (joins to `bin_receipts`) |
| `metrics_pickups` | Metrics | Formulas | Official pickup totals from bin receipts |
| `metrics_avocado` | Metrics | Formulas | Bins by block/week (harvest + pickup reconciled) |
| `metrics_block_returns` | Metrics | Formulas | Net $/bin and $/lb by block from grower statements |
| `metrics_labor` | Metrics | Formulas | Hours by activity, worker, week |
| `metrics_passionfruit` | Metrics | Formulas | Revenue by channel, price/unit |

> **Note on dropdowns:** Forms use manually typed dropdown options (blocks, workers, channels, units, activities) rather than separate lookup tabs. The `blocks` tab is kept as a shared reference so block IDs stay consistent with Index Fresh receipts. Update dropdown choices directly in each Google Form.

---

## Form → Sheet Mapping

Each Google Form is linked to the master sheet (**Responses → Link to Sheets → Select existing → master sheet → tab name**). Google auto-creates a `Form Responses N` tab on first link — **rename that tab** to the target name below (e.g. `harvest_log`) and delete any duplicate.

| # | Form name | Target tab | When Armando uses it |
|---|---|---|---|
| 1 | **Avocado Harvest Log** | `harvest_log` | Same day avocados are picked in the field |
| 2 | **Worker Hours Log** | `labor_log` | End of day or end of week |
| 3 | **Passionfruit Sales Log** | `passionfruit_sales` | When fruit is sold or shipped |
| 4 | **Field Notes** | `field_notes` | Anytime — irrigation, pests, equipment, trees |
| 5 | **Bin Receipt Photo Upload** | `bin_receipts` + `bin_numbers` | When Index Fresh picks up — photo of receipt |
| 6 | **Grower Statement PDF Upload** | `grower_statements` + `grower_statement_receipts` | When Index Fresh settlement PDF arrives |
| 7 | **Owner Notes** | `owner_notes` + Google Doc | Sarah — meeting notes / photos of paper notes |

Form 5 is the **Apps Script web app** in `bin_receipt_scanner/`.  
Form 6 is the **Apps Script web app** in `grower_statement_scanner/` (setup: `grower_statement_scanner/SETUP.md`).  
Form 7 is the **Apps Script web app** in `owner_notes/` (setup: `owner_notes/SETUP.md`) — writes a chronological Google Doc plus summary rows.  
**Fresh Facts** daily market PDFs are imported automatically from Gmail by `fresh_facts_scanner/` (Giuseppe Bonfiglio → `fresh_facts` / `fresh_facts_prices` / `fresh_facts_packed`).

---

## Form 1 — Avocado Harvest Log

**Target tab:** `harvest_log`

| Question | Type | Required | Notes |
|---|---|---|---|
| Date of harvest | Date | Yes | Default today |
| Block / parcel # | Dropdown | Yes | Type options from the `blocks` tab — use same IDs as receipts |
| Number of bins | Short answer | Yes | Whole or partial (e.g. `14` or `14.5`) |
| Bin type | Multiple choice | Yes | Full bin / Partial bin |
| Crew size | Short answer | No | How many pickers |
| Notes | Paragraph | No | Quality, weather, issues |

**Sheet columns** (after form link + header cleanup):

```
submitted_at, date, block_parcel, bins, bin_type, crew_size, notes, submitter_email
```

---

## Form 2 — Worker Hours Log

**Target tab:** `labor_log`

| Question | Type | Required | Notes |
|---|---|---|---|
| Date | Date | Yes | |
| Worker / crew name | Dropdown | Yes | Type crew names as options |
| Activity | Dropdown | Yes | Harvest, pruning, irrigation, weed control, spray, packing, maintenance, other |
| Block / area | Dropdown | No | Options from `blocks` tab + "Other / non-field" |
| Hours worked | Short answer | Yes | Decimal OK (e.g. `7.5`) |
| Hourly rate ($) | Short answer | No | For pay calc; can leave blank if fixed |
| Notes | Paragraph | No | |

**Sheet columns:**

```
submitted_at, date, worker, activity, block_area, hours, hourly_rate, notes, submitter_email
```

---

## Form 3 — Passionfruit Sales Log

**Target tab:** `passionfruit_sales`

| Question | Type | Required | Notes |
|---|---|---|---|
| Date of sale | Date | Yes | |
| Sales channel | Dropdown | Yes | Farmers market, wholesale, direct, restaurant, other (confirm with owner) |
| Quantity | Short answer | Yes | |
| Unit | Dropdown | Yes | lbs, flats, cases, each |
| Total revenue ($) | Short answer | Yes | |
| Notes | Paragraph | No | Buyer, delivery, etc. |

**Sheet columns:**

```
submitted_at, date, channel, quantity, unit, revenue, notes, submitter_email
```

---

## Form 4 — Field Notes

**Target tab:** `field_notes`

| Question | Type | Required | Notes |
|---|---|---|---|
| Date | Date | Yes | |
| Area / block | Dropdown | Yes | Options from `blocks` tab |
| Category | Multiple choice | Yes | Irrigation · Pest/disease · Equipment · Tree health · Other |
| Note | Paragraph | Yes | What happened, what was done |
| Photo (optional) | File upload | No | Stores to Drive; link in sheet |

**Sheet columns:**

```
submitted_at, date, block_area, category, note, photo_url, submitter_email
```

---

## Form 5 — Bin Receipt Entry (FREE web app)

**Target tabs:** `bin_receipts` + `bin_numbers`  
**Code:** `bin_receipt_scanner/Code.gs` + `Upload.html`  
**Setup:** `bin_receipt_scanner/FREE_SETUP.md`

Armando photographs the Index Fresh bin receipt **and types** the key fields (no AI / no Gemini). Apps Script expands each bin # into its own row.

| Field | How it gets in | `bin_receipts` | `bin_numbers` |
|---|---|---|---|
| Date picked up | Typed | ✓ | ✓ |
| Block / parcel # | Typed | ✓ | ✓ |
| Variety (Hass, etc.) | Typed | ✓ | ✓ |
| Full bins count | Typed | ✓ | — |
| Each bin # | Typed / pasted list | — | ✓ (one row each) |
| Receipt # | Typed (optional) | ✓ | ✓ |
| Photo | Attached | ✓ (Drive link) | — |
| Confidence | Always `manual` | ✓ | — |

**Relationship to Form 1:** `harvest_log` = what was picked in the field. `bin_receipts` = official pickup record from Index Fresh. `metrics_avocado` can flag when harvest bins ≠ pickup bins for the same block/week.

---

## Form 6 — Grower Statement PDF Upload (FREE web app)

**Target tabs:** `grower_statements` + `grower_statement_receipts`  
**Code:** `grower_statement_scanner/Code.gs` + `Upload.html`  
**Setup:** `grower_statement_scanner/SETUP.md`

Upload the Index Fresh **Grower Statement** PDF (often multi-page — one block per page). Drive OCR → one editable card per statement → save.

| Field | How it gets in | Notes |
|---|---|---|
| Pool #, variety | OCR + review | e.g. Pool 34 Hass |
| Period start/end | OCR + review | Pool week dates |
| Block | OCR + fuzzy match | Same ranch block list as bin receipts |
| Bins received, lbs, gross/net $ | OCR + review | Net $ is money of record |
| Field receipt #s | OCR + review | Joins to `bin_receipts.receipt_number` |
| PDF | Attached | Stored in Drive; link on statement row |

**Relationship to Form 5:** Field Receipt #s on the statement are the same IDs as bin receipt numbers. Use that join (or block + date window) for “money per block vs when fruit was picked.”

---

## `blocks` — Reference Data

The only reference tab. Populate with block IDs that match Index Fresh receipts and ranch maps. Used to keep block names consistent across all forms. Starter rows (created automatically by `MasterSetup.gs`):

| block_id | crop | acres | notes |
|---|---|---|---|
| L05 0505 | Hass avocado | | Matches receipt format |
| L01 | Hass avocado | | |
| L02 | Hass avocado | | |
| Citrus — North | Lemon (declining) | | |
| Citrus — South | Lemon (declining) | | |
| Passionfruit | Passionfruit | | |
| Other | | | Non-field / general |

*Max: fill in acres/notes from site visit notes and Armando interview.*

Other dropdown values (workers, channels, units, activities) are typed directly into each Google Form — no separate lookup tabs.

---

## Metrics Tabs — Key Metrics

### `metrics_pickups` (from `bin_receipts` + `bin_numbers`)

| Metric | Formula logic |
|---|---|
| Bins picked up this week | COUNT rows in `bin_numbers` where week = current |
| Bins by block (MTD) | GROUP BY `block_parcel` |
| Pickups by variety | GROUP BY `variety` |
| Avg bins per pickup | `bin_receipts.full_bins` AVG |

### `metrics_avocado` (harvest + pickup reconciled)

| Metric | Source |
|---|---|
| Field harvest bins by block/week | `harvest_log` |
| Official pickup bins by block/week | `bin_numbers` |
| Delta (harvest − pickup) | Flag if > 1 bin difference |

### `metrics_block_returns` (from `grower_statements`)

| Metric | Source |
|---|---|
| Net $ by block / pool week | `grower_statements.net_amount` |
| $/bin | `net_amount / bins_received` |
| $/lb | `net_amount / lbs_total` |
| Join to pickups | `grower_statement_receipts.receipt_number` ↔ `bin_receipts.receipt_number` |

### `metrics_labor`

| Metric | Source |
|---|---|
| Hours by worker (week) | `labor_log` |
| Hours by activity | `labor_log` |
| Est. labor cost | `hours × hourly_rate` |
| Hours per bin harvested | Join `labor_log` harvest activity to `bin_numbers` |

### `metrics_passionfruit`

| Metric | Source |
|---|---|
| Revenue MTD | SUM `passionfruit_sales.revenue` |
| Revenue by channel | GROUP BY `channel` |
| Avg price per unit | `revenue / quantity` |

---

## INDEX Tab Layout

Row 1: **Summerland Farm Operations — Data Pipeline**  
Row 3+: Quick links (paste URLs after deployment)

| A | B |
|---|---|
| **Form 1: Avocado Harvest** | `[paste form URL]` |
| **Form 2: Worker Hours** | `[paste form URL]` |
| **Form 3: Passionfruit Sales** | `[paste form URL]` |
| **Form 4: Field Notes** | `[paste form URL]` |
| **Form 5: Bin Receipt Photo** | `[paste web app URL]` |
| **Form 6: Grower Statement PDF** | `[paste web app URL]` |
| **Owner Dashboard** | `[paste Looker Studio URL]` |
| **Photo archive folder** | `[paste Drive folder URL]` |

**Armando SOP (short):**
1. Pick avocados → submit **Harvest Log** same day  
2. Index Fresh picks up → photograph receipt → **Bin Receipt Upload**  
3. Index Fresh grower statement arrives → **Grower Statement PDF Upload**  
4. Sell passionfruit → **Passionfruit Sales**  
5. End of week → **Worker Hours**  
6. See a problem in the field → **Field Notes** anytime  

---

## Build Order (Week 4)

| Step | Task | Time est. |
|---|---|---|
| 1 | Run `MasterSetup.gs` → creates master sheet + all tabs (metrics formulas included) | 10 min |
| 2 | Fill the `blocks` tab with ranch-specific data | 20 min |
| 3 | Create Forms 1–4; link each to correct tab | 45 min |
| 4 | Deploy bin receipt web app; link to same sheet | 20 min |
| 5 | Armando walkthrough + pilot with 1 real receipt | 30 min |
| 6 | Connect metrics tabs to Looker Studio | Week 5 |

### Metrics formulas (prerequisite for Step 6)

Formulas live in `master_sheet/MasterSetup.gs` → `addMetricsFormulas_()`.

On an **existing** master workbook, run **`refreshMetricsFormulas`** from the Apps Script editor after updating `MasterSetup.gs`. Optional: **`seedMetricsSampleData`** to append sample rows and confirm spills.

Details: `master_sheet/METRICS.md`.

---

## File Structure in This Repo

```
pipeline/
├── docs/
│   ├── MASTER_PIPELINE_DESIGN.md ← this document
│   ├── Farm_Operations_Pipeline_Workflow.pdf
│   └── Where_Forms_Go.pdf
├── master_sheet/
│   ├── MasterSetup.gs            ← one-click sheet creation
│   ├── DashboardSetup.gs         ← builds the owner DASHBOARD tab
│   ├── PassionfruitImport.gs     ← exotics / passionfruit sync
│   └── schemas/                  ← column headers per tab (CSV)
├── fresh_facts_scanner/          ← Gmail → Fresh Facts Hass market prices
├── owner_notes/                  ← owner notes web app → Google Doc
├── yield_prediction/             ← Python yield forecast model
├── bin_receipt_scanner/
│   ├── Code.gs                   ← photo → bin_receipts + bin_numbers
│   ├── Upload.html
│   ├── SETUP.md
│   └── sample_output.csv
├── grower_statement_scanner/
│   ├── Code.gs                   ← PDF → grower_statements + field receipts
│   ├── Upload.html
│   └── SETUP.md
└── forms/
    └── FORM_BUILD_CHECKLIST.md   ← step-by-step Google Form creation
```

---

## Permissions

| Person | Master Sheet | Forms | Photo web app | Dashboard |
|---|---|---|---|---|
| Max | Editor | Owner | Deployer | Editor |
| Armando | Editor (or submit-only via forms) | Can submit | Can submit | — |
| Owner | Viewer or Editor | — | Can submit | Viewer |

Share the master sheet with Armando as **Editor** only if he needs to fix bad OCR rows; otherwise forms-only access is enough.

---

## Backup

Monthly: **File → Download → CSV** for each raw tab, or Apps Script time-driven trigger to export to a `Backups/` Drive folder.
