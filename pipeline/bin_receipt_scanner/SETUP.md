# Bin Receipt capture — use the FREE path

**Do not use Gemini OCR for farm ops.** The free Gemini tier often returns `limit: 0` / 429 errors.

→ Follow **[FREE_SETUP.md](./FREE_SETUP.md)** instead.

Armando attaches the receipt photo and types:
- date, block, variety, full bins, bin numbers

Apps Script (no API key) writes to `bin_receipts` + `bin_numbers` in the master sheet.
