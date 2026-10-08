# Owner Notes Repository

Central place for Sarah’s conversations with consultants, agronomists, and advisors — typed notes and photos of paper notes, filed into one chronological Google Doc, with searchable summaries.

**Separate from Field Notes** (`field_notes` / Form 4), which is Armando’s day-to-day irrigation/pest/equipment log.

## What it does

```
Phone/laptop form
   ├─ typed raw notes
   └─ optional photo of paper notes
        ↓
   Drive OCR (if photo)
        ↓
   ┌────────────────────────────────────┐
   │ 1. Google Doc — Owner Notes        │  chronological (newest first)
   │    heading + summary + notes       │
   │    + embedded photo + OCR text     │
   │ 2. Sheet tab owner_notes           │  one row per note (summaries)
   └────────────────────────────────────┘
        ↓
   Summaries tab in the form — search & open any note
```

| Capture | Where it lands |
|---------|----------------|
| Typed notes | Google Doc + `owner_notes.note_body` |
| Photo | Drive folder + embedded in Doc + `photo_url` |
| OCR from photo | Doc section + `ocr_text` (also fills body if she only uploaded a photo) |
| Auto summary | Doc + `owner_notes.summary` + Summaries browse UI |

## Sheet columns (`owner_notes`)

`logged_at | note_date | title | with_whom | category | note_body | summary | photo_file_id | photo_url | ocr_text | doc_file_id | doc_url | bookmark_id | bookmark_url | author`

Categories: Consulting · Agronomy · Advisor · Operations · Other

---

## Setup (~10 minutes)

### 1. New Apps Script project (**required — own project**)

Do **not** paste into the bin-receipt or grower-statement project (`doGet` conflict).

1. [script.google.com](https://script.google.com) → **New project**
2. Name it **Owner Notes**
3. Replace `Code.gs` with this folder’s `Code.gs`
4. **File → New → HTML file** named exactly **`Notes`** → paste `Notes.html`
5. Save

### 2. Point at the master sheet

In `Code.gs`, edit `setupOwnerNotesOnce`:

```javascript
function setupOwnerNotesOnce() {
  setupOwnerNotesPipeline({
    spreadsheetId: 'PASTE_MASTER_SHEET_ID',
    folderId: 'PASTE_FOLDER_ID', // Summerland Farm Operations Drive folder
  });
}
```

Run **`setupOwnerNotesOnce`** → approve Docs + Drive + Sheets + external request (OCR).

Creates:

- Tab **`owner_notes`** on the master sheet (if missing)
- Google Doc **Summerland Farm — Owner Notes** in your ops folder
- Subfolder **Owner Note Photos**

### 3. Deploy web app

1. **Deploy → New deployment** → **Web app**
2. Execute as: **Me**
3. Who has access: **Anyone with Google account** (or Anyone)
4. Copy URL → paste into master sheet **INDEX** as **Form 7: Owner Notes**

### 4. Phone home screen

Safari/Chrome → Share → Add to Home Screen → “Owner Notes”

---

## How Sarah uses it

**New note**
1. Date, title, who she met with, category
2. Type rough notes (or leave blank)
3. Optionally attach a photo of paper notes
4. Save → opens bookmark link to that section in the Doc

**Retrieve**
1. Open **Summaries** tab
2. Search by person, title, or keyword
3. Open in Doc (jumps to that note) or view the photo

**Full history**
- Link at the top of the form → chronological Google Doc

---

## Future (not built yet)

- AI-written summaries (Gemini) instead of extractive first-sentences
- Tagging by block / crop
- Export / email digest

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| “Not configured” | Run `setupOwnerNotesOnce` with real IDs |
| HEIC error | iPhone → Settings → Camera → Most Compatible, or export JPG |
| OCR empty | Photo may be blurry; typed notes still save; re-photo or type |
| Summaries empty | Confirm `owner_notes` tab has rows after a test save |
| Wrong doc | Clear script property `OWNER_NOTES_DOC_ID` and re-run setup (creates a new doc) |
