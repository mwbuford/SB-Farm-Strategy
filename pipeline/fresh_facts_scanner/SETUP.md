# Fresh Facts Email Scanner

Automatically pulls Index Fresh **Fresh Facts** PDFs from Gmail (Giuseppe Bonfiglio), saves them to Drive, and writes prices / inventory / commentary into sheet tabs.

---

## For Sarah (no coding)

→ Follow **[SARAH_SETUP.md](./SARAH_SETUP.md)**  
Three steps: Make a copy → menu **Connect** → menu **Turn on daily auto-import**.

---

## For Max (package the template)

→ Follow **[MAX_PACKAGING.md](./MAX_PACKAGING.md)**  
Build a bound-script template sheet she can copy.

---

## What it captures

| Tab | Contents |
|---|---|
| `START HERE` | Status + click-by-click instructions |
| `fresh_facts` | One row per report day |
| `fresh_facts_prices` | Hass / Organic Hass / Lamb Hass by size |
| `fresh_facts_packed` | Packed inventory by carton size |
| `fresh_facts_import_log` | Import audit trail |

Email match: subject contains `Fresh Facts`, PDF attached, from Giuseppe (configurable in menu).

---

## Menu reference

| Menu | Action |
|---|---|
| 1. Connect (one-time setup) | Tabs + Drive folder + Google permissions |
| 2. Turn on daily auto-import | ~7am Pacific trigger |
| Import now | Manual pull |
| Import last 90 days | Backfill |
| Change email sender… | Fix From: if search finds nothing |
| Turn off daily auto-import | Remove trigger |
| Show status / help | Status summary |

---

## Developer / advanced

Standalone setup with pasted IDs still works via `setupFreshFactsOnce()` — not needed for Sarah.

Test parser: run `testParseFreshFactsSample` from the Apps Script editor.
