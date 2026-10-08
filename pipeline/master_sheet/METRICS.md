# Metrics tabs — how they work

These tabs power the owner dashboard. Each is formula-driven from a log tab. Do **not** type into the metrics sheets (except notes columns if you add them later) — edit the source logs instead.

## Apply / refresh formulas

In the Apps Script project that owns the master sheet (`MasterSetup.gs`):

1. Paste the latest `MasterSetup.gs` if needed.
2. Run **`refreshMetricsFormulas`** (uses Script Property `SPREADSHEET_ID`, or the active spreadsheet).
3. Optional: run **`seedMetricsSampleData`** once to append sample log rows and confirm spills.

New workbooks created with `createMasterWorkbook()` get formulas automatically.

## Tab map

| Metrics tab | Source log(s) | What it shows |
|---|---|---|
| `metrics_pickups` | `bin_receipts` | Week × block × variety: pickup count + sum of `full_bins` |
| `metrics_avocado` | `harvest_log` + `bin_receipts` | Week × block: harvest bins vs pickup bins, delta, `CHECK` if \|delta\| > 1 |
| `metrics_labor` | `labor_log` (Form) | Week × activity: total hours + cost at **$27/hr** (rate in `metrics_labor!I1`) |
| `metrics_passionfruit` | `passionfruit_sales` | Month × channel: qty, revenue, weighted avg price |
| `metrics_passionfruit_yearly` | `exotics_sales_summary` (Passionfruit) + `passionfruit_sales` | Passionfruit year totals only |
| `metrics_block_returns` | `grower_statements` | Week × block × pool: bins, lbs, gross, net, $/bin, $/lb |

**Exotic sales:** Full data stays in SB Farm exotics sheet. Operations sheet has `exotics_sales_summary` only (year × product: lbs, revenue, avg $/lb). Point dashboard at that tab and filter by `product`.

`week_start` is always the **Monday** of the source date (`period_start` for grower statements).

## Live `labor_log` (Form_Responses) — important

Your sheet already uses the Spanish/simple form columns:

| Col | Header | Use in metrics |
|---|---|---|
| A | Timestamp | (ignored) |
| B | Fecha | week_start |
| C | Horas trabajadas (total) | total_hours |
| D | Cuantos trabajadores | not rolled up (crew size only) |
| E | Trabajo realizado | activity |
| F | Block trabajó en | not in metrics_labor yet |
| G | Notas | (ignored) |

`est_cost` = `Horas trabajadas (total) × $27`. Change the rate anytime in **`metrics_labor!I1`**.

Worker names in Notas are not parsed — each form row is treated as **crew** totals.

### Paste this yourself (no remake)

1. On **`metrics_labor`**, delete the old **worker** column (B) if it’s still there.
2. Row 1 headers should be: `week_start | activity | total_hours | est_cost`
3. **H1** = `hourly_rate_$`, **I1** = `27`
4. Format column **A** as **Date**
5. Paste into **A2**:

```
=IF(COUNTA(labor_log!A:A)<=1,"",QUERY({ARRAYFORMULA(IF(labor_log!B2:B="","",INT(labor_log!B2:B-WEEKDAY(labor_log!B2:B,2)+1))),labor_log!E2:E,ARRAYFORMULA(IF(labor_log!B2:B="","",N(labor_log!C2:C))),ARRAYFORMULA(IF(labor_log!B2:B="","",N(labor_log!C2:C)*$I$1))},"select Col1, Col2, sum(Col3), sum(Col4) where Col1 is not null group by Col1, Col2 label sum(Col3) '', sum(Col4) ''",0))
```

## Exotic sales historical sync

The **SB Farm exotics** workbook (tabs `2022`–2025`) stays the source of truth. Only **`exotics_sales_summary`** lives on the operations sheet.

1. Paste `PassionfruitImport.gs` + `MasterSetup.gs` into Apps Script (optional).
2. Run **`setupExoticSalesSource({ spreadsheetId: '...' })`** once.
3. Run **`syncExoticSalesSummaries()`** — writes ~20 summary rows (year × product), not full transactions.
4. Or type/paste summaries manually from each year tab’s “Sales by Fruit” block.

**Offline bootstrap:** `python import_passionfruit_history.py` → `outputs/exotics_sales_summary.csv`

### Dashboard charts

| Chart | Data source | Filter |
|---|---|---|
| Passionfruit revenue by year | `metrics_passionfruit_yearly` | passionfruit only |
| All exotics by product | `metrics_exotics_yearly` | filter `product` column per section |
| Chiles / Lemons / etc. | `metrics_exotics_yearly` | `product = 'Chiles'` etc. |
| Monthly current season | `metrics_passionfruit` | Form 3 only |

## Dashboard next step

Point Looker Studio (or Sheets charts) at these five metrics tabs. Paste the dashboard URL into `INDEX` → **Owner Dashboard (Looker Studio)**.

Receipt-level money reconciliation (`grower_statement_receipts.receipt_number` ↔ `bin_receipts.receipt_number`) stays in the log tabs for a later dashboard join — not duplicated in the metrics rollups.
