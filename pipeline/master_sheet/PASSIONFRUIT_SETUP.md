# Exotic sales — live connection to SB Farm exotics

Full transaction data stays in **SB Farm exotics**. The operations sheet holds **`exotics_sales_summary`** only (~20 rows), updated automatically from the source sheet.

## How it stays in sync

| Event | What happens |
|-------|----------------|
| Add tab `2026` in exotics sheet | Next sync auto-detects it (any tab named `2022`, `2023`, …) |
| Add sales rows in any year tab | Summaries update on next sync |
| Daily 6am trigger | Auto-refresh (after you install it once) |
| Open operations sheet | Auto-refresh if last sync was >1 hour ago |
| Menu → Sync now | Manual refresh anytime |

Avocados can appear in the fruit×year table; overall **Exotics TOTAL $** on the dashboard excludes them. Products match the Fruit dropdown (Red Passion, Yellow Passion, Mix Passion, Chiles, Lemons, …).

---

## One-time setup (3 steps)

### 1. Add tab manually on operations sheet

Tab name: **`exotics_sales_summary`**

Row 1 headers: `year` | `product` | `total_lbs` | `total_revenue` | `avg_price_per_lb`

Leave rows 2+ empty — the script fills them.

### 2. Paste Apps Script

In the **operations** spreadsheet: **Extensions → Apps Script**

Paste both files:
- `MasterSetup.gs`
- `PassionfruitImport.gs`

Save. Reload the operations sheet — you should see menu **Summerland Ops**.

### 3. Connect the exotics sheet

1. Open SB Farm exotics → copy spreadsheet ID from URL  
   `https://docs.google.com/spreadsheets/d/THIS_PART/edit`
2. On operations **INDEX** tab, paste ID in column B next to **SB Farm exotics — sheet ID**
3. Menu: **Summerland Ops → Connect exotics sheet**  
   (or run `connectExoticSalesFromIndex()` in Apps Script)
4. Menu: **Summerland Ops → Install daily auto-sync trigger**

Done. Check `exotics_sales_summary` — should have year × product rows.

---

## When they add a new year

1. In **SB Farm exotics**, add a new tab named **`2026`** (must be 4-digit year)
2. Same columns as other years: Date, Buyer, Fruit, Price per lb, Pounds, Total
3. Summaries update automatically (daily, on open, or run **Sync now**)

No changes needed on the operations sheet.

---

## Architecture

```
SB Farm exotics                    Operations sheet
├── 2022 (detail)                  ├── exotics_sales_summary ← auto-synced summaries
├── 2023 (detail)                  └── metrics_passionfruit_yearly (optional)
├── 2024 (detail)
├── 2025 (detail)
└── 2026 (new — auto-detected)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Menu doesn't appear | Reload sheet; check Apps Script saved |
| "Connect first" error | Paste exotics sheet ID in INDEX column B |
| New year missing | Tab must be named exactly `2026` not `2026 sales` |
| Permission error | Run connect once and approve access to both sheets |
| Stale data | Summerland Ops → Sync exotic sales summaries now |
