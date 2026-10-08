# Bin Receipt OCR — FREE (Google Drive OCR)

This replaces the Gemini approach. It uses **Google Drive OCR** inside Apps Script, so there is **no API key, no billing, and no model quota**.

## How it works

1. Armando opens the web app on his phone
2. Takes a **photo of the Index Fresh receipt** (stored in Drive)
3. (Best) Copy text from image using phone OCR (Live Text / Lens) and paste into the form
4. The script cleans parsed fields (date, block/parcel, full bins, bin numbers)
5. Any typed fields override parsed values if needed
6. Taps **Read photo + save to sheet**
5. Apps Script writes:
   - 1 row → `bin_receipts`
   - 1 row per bin # → `bin_numbers`
   - photo link on the receipt row

No API keys. No billing. No quotas.

Important: this is still **OCR + review**, not magic. Printed fields usually work better than handwritten bin numbers.
Also, Drive OCR does **not** support `HEIC` images (common on iPhone). If possible, upload JPG/PNG or enter fields manually.

---

## Setup (~10 minutes)

### 1. Apps Script project

1. Open [script.google.com](https://script.google.com) → open your **Bin Receipt Scanner** project (or create new)
2. Replace `Code.gs` with the free version from this folder
3. Open / create HTML file named **`Upload`** → paste `Upload.html`
4. Save

### 2. Point it at the master sheet

In `Code.gs`, set `setupOnce` once:

```javascript
function setupOnce() {
  setupPipeline({
    spreadsheetId: 'PASTE_MASTER_SHEET_ID',
    // folderId: 'PASTE_EXISTING_FOLDER_ID', // optional
  });
}
```

Run **`setupOnce`** → approve Drive + Sheets permissions → check **Execution log** for IDs.

Then delete or comment out `setupOnce`.

### 3. Deploy web app

1. **Deploy → New deployment** (or Manage → Edit → New version if already deployed)
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone** (or Anyone with Google account)
5. Copy the URL → paste into master sheet `INDEX` under Form 5

Bookmark that URL on Armando’s phone.

---

## Armando workflow (20–45 seconds)

1. Open link  
2. Photo receipt  
3. Tap **Read photo + save to sheet**  
4. If OCR misses the block/date/bin numbers, type them and retry  

Tip: if handwritten bin numbers are messy, use **Paste text from image** or paste bin numbers manually separated by spaces.

---

## Optional even-simpler alternative: Google Form only

If you don’t want a custom web page at all:

1. Create a Google Form with:
   - Date
   - Block
   - Variety
   - Full bins
   - Bin numbers (paragraph text)
   - File upload: receipt photo
2. Link responses to `bin_receipts` (or a staging tab)
3. Add a tiny Apps Script `onFormSubmit` that only parses bin numbers into `bin_numbers`

The custom web page above is usually nicer on a phone than a Google Form.

---

## What changed vs the Gemini version

| Old (Gemini) | New (Free Drive OCR) |
|---|---|
| Photo only → AI reads fields | Photo OCR with optional manual overrides |
| Needs Gemini API key / billing | Only Google account + Apps Script |
| Can fail with 429 / limit 0 | No model quota issues |
| `extraction_confidence` = high/medium/low | `extraction_confidence` = `ocr_review` or `manual` |

Same destination tabs, so metrics keep working.
