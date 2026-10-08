# Google Forms Build Checklist

Use this when creating each form. All forms link to the **same master sheet** created by `MasterSetup.gs`.

---

## Before you start

- [ ] Run `MasterSetup.gs` — master sheet exists with tabs, headers, and metric formulas
- [ ] Fill the `blocks` tab with real ranch block IDs
- [ ] Create a shared Drive folder: `Summerland Farm Operations` (forms, sheet, photo archive live here)

> Dropdown options (blocks, workers, channels, units, activities) are typed directly into each form. There are no separate lookup tabs — keep block names matching the `blocks` tab.

---

## Form 1 — Avocado Harvest Log

1. [ ] **forms.google.com → Blank form**
2. [ ] Title: `Summerland — Avocado Harvest Log`
3. [ ] Description: `Log bins picked today. Use the same block ID as the Index Fresh receipt (e.g. L05 0505).`
4. [ ] Settings → Collect email addresses (optional)
5. [ ] Settings → Limit to 1 response: **Off**
6. [ ] Add questions per `../docs/MASTER_PIPELINE_DESIGN.md` Form 1 table
7. [ ] For **Block / parcel #**: use Dropdown → type options matching the `blocks` tab
8. [ ] **Responses → Link to Sheets** → select master sheet → choose **Select existing sheet** → pick `harvest_log`
9. [ ] If Google creates `Form Responses 1`, delete it after confirming `harvest_log` receives submissions
10. [ ] Test submit → verify row appears in `harvest_log`
11. [ ] Copy form URL → paste in master sheet `INDEX` tab

---

## Form 2 — Worker Hours Log

Simple version (recommended for Armando):
1. [ ] Title: `Summerland — Worker Hours Log`
2. [ ] Description: `Quick daily log: date, total hours, crew size, activity, and block worked on.`
3. [ ] Questions (required):
   - Date
   - Hours worked (total)
   - How many workers
   - What they did
   - Block worked on
4. [ ] Optional question: Notes
5. [ ] Link to `labor_log` tab (or any response tab, then map later)
6. [ ] Test + paste URL in `INDEX`
7. [ ] Optional automation: run `forms/CreateWorkerHoursForm.gs` to auto-create this exact form

---

## Form 3 — Passionfruit Sales Log

1. [ ] Title: `Summerland — Passionfruit Sales Log`
2. [ ] Description: `Log every sale — channel, quantity, and revenue.`
3. [ ] Questions per design doc Form 3
4. [ ] Link to `passionfruit_sales` tab
5. [ ] Test + paste URL in `INDEX`

---

## Form 4 — Field Notes

1. [ ] Title: `Summerland — Field Notes`
2. [ ] Description: `Quick notes on irrigation, pests, equipment, or tree health.`
3. [ ] Questions per design doc Form 4
4. [ ] File upload question → set upload folder to `Summerland Farm Operations / Field Note Photos`
5. [ ] Link to `field_notes` tab
6. [ ] Test + paste URL in `INDEX`

---

## Form 5 — Bin Receipt Photo Upload (Web App, not Google Form)

1. [ ] Follow `bin_receipt_scanner/SETUP.md`
2. [ ] In `setupPipeline()`, pass the **master sheet spreadsheet ID**
3. [ ] Deploy web app → copy URL → paste in `INDEX` tab as "Bin Receipt Photo Upload"
4. [ ] Test with a real receipt photo → verify `bin_receipts` and `bin_numbers` tabs populate
5. [ ] Bookmark URL on Armando's phone home screen

---

## Form 6 — Grower Statement PDF Upload (Web App)

1. [ ] Follow `grower_statement_scanner/SETUP.md`
2. [ ] Own Apps Script project (not shared with bin receipts)
3. [ ] Deploy → paste URL in INDEX as Form 6

---

## Form 7 — Owner Notes (Sarah, Web App)

Central knowledge base for consultant / agronomist / advisor conversations.

1. [ ] Follow `owner_notes/SETUP.md`
2. [ ] Own Apps Script project — paste `Code.gs` + HTML file named **`Notes`**
3. [ ] Run `setupOwnerNotesOnce` with master sheet ID + ops Drive folder ID
4. [ ] Deploy web app → paste URL in INDEX as **Form 7: Owner Notes (Sarah)**
5. [ ] Test: typed note + photo of paper notes → check Google Doc + `owner_notes` tab
6. [ ] Add to Sarah’s phone home screen

---

## Armando quick-reference card (text to send)

```
SUMMERLAND FARM — LOGGING LINKS

After picking avocados:     [Harvest Log URL]
Index Fresh pickup photo:   [Bin Receipt URL]
Sold passionfruit:          [Passionfruit Sales URL]
End of week hours:          [Worker Hours URL]
Field problem / note:       [Field Notes URL]
```

Sarah — Owner Notes (meetings / paper notes): [Owner Notes URL]

---

## Dropdown maintenance

When a new block, worker, or channel is added:
1. If it's a block, add a row to the `blocks` tab (keeps names consistent)
2. Open the relevant Google Form → edit the dropdown question → add the new option
