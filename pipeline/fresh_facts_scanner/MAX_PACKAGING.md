# Max — how to package Fresh Facts for Sarah (Option 2)

Goal: Sarah never opens Apps Script. She only **Make a copy → menu Connect → menu Turn on daily import**.

---

## One-time: build the template spreadsheet

### A. Create a bound script (important)

The script must be **attached to the spreadsheet** (Extensions → Apps Script), not a standalone project at script.google.com.

1. Create a new Google Sheet named  
   `TEMPLATE — Summerland Fresh Facts (make a copy)`
2. **Extensions → Apps Script**
3. Delete any default code
4. Paste all of `Code.gs` from this folder
5. Open **Project Settings** (gear) → check **Show "appsscript.json" manifest**
6. Replace `appsscript.json` with this folder’s manifest (timezone `America/Los_Angeles` + oauthScopes)
7. Save

### B. Seed the START HERE tab

1. Back in the sheet, refresh
2. You should see menu **🥑 Fresh Facts**
3. Run **1. Connect** once on *your* account only to create tabs / verify the parser  
   - Or run `ensureStartHereSheet_` / `setupFreshFactsPipeline` from the editor
4. Clear any test rows from `fresh_facts*` if you don’t want sample data in the template
5. On **START HERE**, leave status as the default instructions (Connect will rewrite status on Sarah’s copy)

### C. Share as a template

1. Put the sheet in a Drive folder: `Summerland Fresh Facts — Starter Pack`
2. Add `SARAH_SETUP.md` content into a Google Doc in the same folder titled  
   `Fresh Facts — setup for Sarah (read me)`  
   (copy from `SARAH_SETUP.md`)
3. Share the **folder** with Sarah as **Viewer** (or Editor)
4. Tell her: open the spreadsheet → **File → Make a copy** → follow the Doc

**Do not** have her edit the template itself. Make-a-copy gives her a private bound script she authorizes with *her* Gmail.

---

## What to email Sarah

```
Subject: Fresh Facts auto-import — 5-minute setup

Hi Sarah —

I set up automatic capture of Giuseppe’s daily Fresh Facts emails
(prices + market notes) into a Google Sheet.

Setup (about 5 minutes, no coding):
1. Open this folder: [LINK]
2. Open the Doc “Fresh Facts — setup for Sarah”
3. Open the spreadsheet → File → Make a copy
4. In YOUR copy: menu 🥑 Fresh Facts → 1. Connect → Allow
5. Menu → 2. Turn on daily auto-import

Use the Google account that receives the Fresh Facts emails.

After that it runs by itself around 7am Pacific.
Optional: “Import last 90 days” to load older reports.

Questions → reply here / text me.
```

---

## After she copies (checklist)

- [ ] She used the account that receives Giuseppe’s mail  
- [ ] **START HERE** shows Connected = Yes  
- [ ] Daily auto-import = On  
- [ ] **Import now** creates a row (or log says `no_mail` / `skipped`)  
- [ ] If `no_mail`: open one Fresh Facts email → note exact From address → she uses **Change email sender…**

---

## Notes / gotchas

| Issue | Fix |
|-------|-----|
| Menu missing after Make a copy | Refresh; wait for `onOpen`; or Extensions → Apps Script → run `onOpen` once |
| “App isn’t verified” | Expected for personal scripts — Advanced → Go to … → Allow |
| Make a copy doesn’t copy triggers | Correct — she must click **Turn on daily auto-import** on her copy |
| Script properties don’t copy | Correct — **Connect** re-creates them on her copy |
| Confidential Index Fresh data | Her copy + her Gmail; don’t share Viewer access broadly |

---

## Optional: attach to master ops sheet instead

If you prefer one workbook:

1. Open the master Farm Operations sheet  
2. Extensions → Apps Script → add `Code.gs` as a file in **that** project  
   - Avoid name collisions with `doGet` from other scanners — this Fresh Facts file has no `doGet`, so it can live in the master sheet project  
3. Still give Sarah the menu path; she won’t need a separate template  

Separate template sheet is still cleaner for handoff and permissions.
