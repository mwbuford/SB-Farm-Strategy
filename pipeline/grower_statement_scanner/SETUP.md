# Grower Statement PDF Upload — FREE (Google Drive OCR)

Upload Index Fresh **Grower Statement** PDFs → OCR → review one card per block/page → write to the master sheet.

**Part of the master pipeline** — see `../docs/MASTER_PIPELINE_DESIGN.md`.

## What it captures

Each statement page is typically **one block × one pool week**:

| Field | Sheet column |
|---|---|
| Pool # + variety | `pool_number`, `variety` |
| Week range | `period_start`, `period_end` |
| Ranch block (dropdown / fuzzy) | `block_parcel` — Ardillas, Caballos, … never GR#### |
| Index block ID | `index_block_id` |
| Bins received | `bins_received` |
| Lbs #1 / #2 / culls / total | `lbs_*` |
| Avg rate ($/lb) | shown in review form (from Total Returns) |
| Gross $, charges, net $ | `gross_amount`, `charges_total`, `net_amount` |
| Field receipt #s | `field_receipts` + rows in `grower_statement_receipts` |

**Join key:** `grower_statement_receipts.receipt_number` ↔ `bin_receipts.receipt_number`

### Parser fixes (Jul 2026)

Verified against `Jul092023TOJul152023.pdf` and 2024 scanned pools (`pool 35a/35b`, `pool 34 b`). After updating `Code.gs` + `Upload.html`, **re-deploy** the web app (Deploy → Manage deployments → Edit → New version).

| Bug | Fix |
|---|---|
| Dates off by 1 day | Parse month/day/year without UTC timezone shift |
| Bins = 1532 from `GR1532` | Ignore block-ID digits; prefer `88.00` after period line |
| Empty Grade #1 / #2 | Match `AMOUNTS #1` and standalone `#2` headers |
| Culls/total/gross scrambled | Prefer 1-decimal = lbs, 2-decimal = $ on Total Returns |
| Net blank | Read bare amount after Harvesting Advance |
| Block = `GR1532` / `SB FARM GR…` | Leave blank + force ranch dropdown (grower # ≠ block) |
| **2024 scanned PDFs (35a/35b)** | Columnar OCR: POUNDS/AMOUNTS dumps, `Pool 35 B HA`, `BLOCK 10:`→ID, filename pool/date hints |

## Setup (~10 minutes)

### 1. New Apps Script project (**required — do not paste into bin-receipt project**)

Bin receipts and grower statements must be **two separate** Apps Script projects.  
If you paste this `Code.gs` into the same project as bin receipts (e.g. `indexFresh.gs`), you get:

`SyntaxError: Identifier 'KNOWN_BLOCKS' has already been declared`

1. Open [script.google.com](https://script.google.com) → **New project** (blank)
2. Name it **Grower Statement Scanner** (not your bin-receipt / IndexFresh project)
3. Replace `Code.gs` with this folder’s `Code.gs`
4. **File → New → HTML file** named exactly **`Upload`** → paste `Upload.html`
5. Save

### 2. Point it at the master sheet

In `Code.gs`, edit `setupGrowerStatementOnce`:

```javascript
function setupGrowerStatementOnce() {
  setupGrowerStatementPipeline({
    spreadsheetId: 'PASTE_MASTER_SHEET_ID',
    folderId: 'PASTE_FOLDER_ID', // same Farm Operations folder is fine
  });
}
```

Run **`setupGrowerStatementOnce`** → approve Drive + Sheets + Docs permissions.

This creates (if missing):

- `grower_statements`
- `grower_statement_receipts`

### 3. Deploy web app

1. **Deploy → New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone** (or Anyone with Google account)
5. Copy URL → paste into master sheet `INDEX` under **Form 6: Grower Statement PDF Upload**

Redeploy a **New version** after every code change.

## Workflow

1. Open the web app
2. Upload the Index Fresh PDF (or page photos)
3. Wait for OCR (15–40s for multi-page PDFs)
4. Review each statement card — **pick ranch block from the dropdown** (required), check net $, field receipts
5. **Save to sheet**

**Fallback if OCR fails:** open the PDF in Preview/Adobe → select all → copy → paste into “Full detected text” → **Re-parse from text**.

## Existing master sheet (already created)

If your workbook was created before these tabs existed, either:

- Run `setupGrowerStatementOnce()` from this project (creates the two tabs), or
- Manually add sheets named `grower_statements` and `grower_statement_receipts` with the headers in `Code.gs`

Optional: add `metrics_block_returns` via updated `MasterSetup.gs` or copy the formula note from there.

## Tips

- Statements are often **scanned images** inside PDFs — Drive OCR still works with `convert=true`
- Multi-page PDFs (Pool 34 = 4 blocks) should produce **one card per “GROWER STATEMENT”**
- Block aliases match ranch list (`Godornicez` → Codornices, `Los Cuervo` → Cuervos, etc.)
- Parser **scans the full OCR text** for a ranch name; `GR1532` / `SB FARM GR…` are ignored as blocks
- Always check **Net $** and **Field receipt #s** before saving — those drive the block-returns join

## Auto-inbox (optional)

Drop PDFs into a Drive folder → Apps Script OCR/parses → writes the sheet → moves the file.

1. Paste updated `Code.gs` (+ `Upload.html` if using the form)
2. Run **`setupGrowerStatementInboxFolders()`** once → creates:
   - `Grower Statement Inbox`
   - `Grower Statement Processed`
   - `Grower Statement Needs Review`
   - `Grower Statement Failed`
3. Run **`installGrowerStatementInboxTrigger()`** (every 5 minutes)  
   or run **`processGrowerStatementInbox()`** manually anytime
4. Put statement PDFs in **Inbox**

If a ranch block name appears anywhere in the OCR text, it is used automatically.  
If only `GR####` is present and no list name is found, the file goes to **Needs Review** (not written).
