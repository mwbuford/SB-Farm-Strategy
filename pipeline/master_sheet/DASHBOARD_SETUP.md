# Owner Dashboard (Sarah) — avocado-first

One-page executive summary for avocado, with year browse + exotics below.

## Avocado coverage (Sarah’s KPI list)

| Need | Where on DASHBOARD |
|------|-------------------|
| **Operational — weekly harvest** | This week harvest bins + weekly bins chart |
| **Operational — bins picked** | Hero BINS PICKED + this week bins + weekly chart |
| **Operational — pounds harvested** | Hero LBS HARVESTED |
| **Operational — revenue** | Hero REVENUE (NET) + gross on strip |
| **Operational — block performance** | Yearly table + bar chart only (no weekly blocks on dash) |
| **Financial — labor cost** | Year total + **labor $ by week** (table + chart, follows year menu) |
| **Financial — production by block** | Block performance yearly table (bins / lbs / net / $/lb) |
| **Financial — historical trends** | Net $ by year + weekly bins charts |
| **Exotics — fruit by year** | Bar chart of fruit $ for selected year · **Exotics year** menu |
| **Business — executive summary** | Top hero card (this year) |
| **Business — drill-down** | Footer links → metrics / grower_statements |
| **Business — YoY** | Year-over-year table (net, lbs, bins, $/lb) |
| **Market — Hass mid $/lb** | Line chart from `Market_Avo_FreshFacts` (sizes 48/60/70/84) |

Block detail on this page is **yearly only**. Weekly-by-block lives in `metrics_block_returns` (drill-down).

## Setup

1. Paste updated `DashboardSetup.gs` into the master sheet Apps Script project  
2. Run **`createOwnerDashboard`**  
3. Switch years: **Summerland Dashboard → Avocado year**

## Sources

| KPI | Tab |
|-----|-----|
| Yearly revenue / lbs / bins / rate | `metrics_grower_yearly` |
| Weekly bins picked | `metrics_pickups` |
| Weekly harvest bins | `metrics_avocado` (from `harvest_log`) |
| Labor cost / hours | `metrics_labor` |
| Labor $ by week (selected year) | `metrics_labor` rolled by `week_start` |
| Block yearly | `grower_statements` rolled by year × block |
| Weekly block (drill-down only) | `metrics_block_returns` |
