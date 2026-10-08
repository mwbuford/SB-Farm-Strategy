/**
 * Index Fresh — Fresh Facts daily email importer
 *
 * OWNER (Sarah) path — no coding:
 *   1. Make a copy of this spreadsheet (File → Make a copy)
 *   2. Menu: Fresh Facts → 1. Connect (one-time setup) → click Allow
 *   3. Menu: Fresh Facts → 2. Turn on daily auto-import
 *   4. Optional: Fresh Facts → Import now
 *
 * Finds Gmail from Giuseppe Bonfiglio with subject like "Fresh Facts 07-24-26",
 * saves the PDF, parses market data, writes to:
 *   fresh_facts / fresh_facts_prices / fresh_facts_packed / fresh_facts_import_log
 *
 * Must run as the Google account that RECEIVES the Fresh Facts email.
 */

const FF_SHEET_START = 'START HERE';
const FF_SHEET_SUMMARY = 'fresh_facts';
const FF_SHEET_PRICES = 'fresh_facts_prices';
const FF_SHEET_PACKED = 'fresh_facts_packed';
const FF_SHEET_LOG = 'fresh_facts_import_log';

const FF_PROP_SPREADSHEET = 'FF_SPREADSHEET_ID';
const FF_PROP_FOLDER = 'FF_UPLOAD_FOLDER_ID';
const FF_PROP_SENDER = 'FF_SENDER_QUERY';
const FF_PROP_SETUP_DONE = 'FF_SETUP_DONE';
const FF_PROP_TRIGGER_ON = 'FF_TRIGGER_ON';
const FF_LABEL_IMPORTED = 'FreshFacts/Imported';

/** Default Gmail from: clause — override via menu if address differs. */
const FF_DEFAULT_SENDER = 'Giuseppe Bonfiglio';

const FF_SUMMARY_HEADERS = [
  'logged_at',
  'report_date',
  'subject',
  'message_id',
  'market_commentary',
  'ca_inv_total_lbs',
  'ca_inv_others_lbs',
  'ca_inv_hass_lbs',
  'ca_bins_hass',
  'ca_bins_org',
  'ca_bins_others',
  'ca_bins_total',
  'inv_ca_lbs',
  'inv_mexico_lbs',
  'inv_peru_lbs',
  'inv_colombia_lbs',
  'inv_chile_lbs',
  'inv_dominican_lbs',
  'inv_worldwide_lbs',
  'harvest_this_week_total_lbs',
  'harvest_next_week_total_lbs',
  'packed_inv_today_total',
  'packed_shipped_yesterday',
  'pdf_file_id',
  'pdf_url',
  'pdf_name',
  'extraction_confidence',
  'notes',
];

const FF_PRICE_HEADERS = [
  'logged_at',
  'report_date',
  'size',
  'variety',
  'price_low',
  'price_high',
  'price_mid',
  'pdf_file_id',
];

const FF_PACKED_HEADERS = [
  'logged_at',
  'report_date',
  'size',
  'packed_last_week',
  'packed_yesterday',
  'packed_today',
  'shipped_yesterday',
  'pct_inventory_shipped',
  'days_on_hand',
  'pdf_file_id',
];

const FF_LOG_HEADERS = [
  'logged_at',
  'status',
  'subject',
  'message_id',
  'pdf_name',
  'report_date',
  'detail',
];

// ---------------------------------------------------------------------------
// Owner menu (Sarah) — no Apps Script editor needed
// ---------------------------------------------------------------------------

/**
 * Adds the Fresh Facts menu when the spreadsheet opens.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🥑 Fresh Facts')
    .addItem('1. Connect (one-time setup)', 'menuConnectSetup')
    .addItem('2. Turn on daily auto-import', 'menuTurnOnDailyImport')
    .addSeparator()
    .addItem('Import now', 'menuImportNow')
    .addItem('Import last 90 days (backfill)', 'menuBackfill')
    .addSeparator()
    .addItem('Change email sender…', 'menuChangeSender')
    .addItem('Turn off daily auto-import', 'menuTurnOffDailyImport')
    .addItem('Show status / help', 'menuHelp')
    .addToUi();

  try {
    ensureStartHereSheet_(SpreadsheetApp.getActiveSpreadsheet());
  } catch (err) {
    // Ignore onOpen failures (permissions on first open before auth)
  }
}

/**
 * Step 1 — create tabs, Drive folder, Gmail label; prompt Google permissions.
 */
function menuConnectSetup() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Connect Fresh Facts',
    'This one-time setup will:\n\n' +
      '• Create the Fresh Facts data tabs\n' +
      '• Create a Drive folder for PDF backups\n' +
      '• Ask Google for permission to read Fresh Facts emails\n\n' +
      'Use the same Google account that receives Giuseppe’s Fresh Facts email.\n\n' +
      'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    const result = connectFreshFactsForOwner_();
    updateStartHereStatus_(result.ss, {
      setupDone: true,
      folderUrl: result.folderUrl,
      triggerOn: hasDailyTrigger_(),
    });
    ui.alert(
      'Connected ✔',
      'Setup complete.\n\n' +
        'PDF folder:\n' +
        result.folderUrl +
        '\n\nNext: click 🥑 Fresh Facts → 2. Turn on daily auto-import',
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert(
      'Setup needs permissions',
      'Google may show an Allow screen — click Allow, then run Connect again.\n\n' +
        'If this keeps failing, email Max with this message:\n\n' +
        String(err && err.message ? err.message : err),
      ui.ButtonSet.OK
    );
  }
}

/**
 * Step 2 — install ~7am daily trigger.
 */
function menuTurnOnDailyImport() {
  const ui = SpreadsheetApp.getUi();
  try {
    ensureConfiguredOrThrow_();
    installDailyTrigger();
    PropertiesService.getScriptProperties().setProperty(FF_PROP_TRIGGER_ON, 'true');
    updateStartHereStatus_(SpreadsheetApp.getActiveSpreadsheet(), {
      setupDone: true,
      triggerOn: true,
    });
    ui.alert(
      'Daily import on ✔',
      'Fresh Facts will import automatically around 7:00 AM Pacific each day.\n\n' +
        'You can also use 🥑 Fresh Facts → Import now anytime.',
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert(
      'Turn on failed',
      'Run “1. Connect (one-time setup)” first, then try again.\n\n' +
        String(err && err.message ? err.message : err),
      ui.ButtonSet.OK
    );
  }
}

function menuTurnOffDailyImport() {
  const ui = SpreadsheetApp.getUi();
  uninstallDailyTrigger();
  PropertiesService.getScriptProperties().setProperty(FF_PROP_TRIGGER_ON, 'false');
  updateStartHereStatus_(SpreadsheetApp.getActiveSpreadsheet(), {
    setupDone: isSetupDone_(),
    triggerOn: false,
  });
  ui.alert('Daily import off', 'Automatic daily import has been turned off.', ui.ButtonSet.OK);
}

function menuImportNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    ensureConfiguredOrThrow_();
    ui.alert('Importing…', 'Click OK, then wait 15–60 seconds. A second message will appear when finished.', ui.ButtonSet.OK);
    const result = importFreshFactsToday();
    updateStartHereStatus_(SpreadsheetApp.getActiveSpreadsheet(), {
      setupDone: true,
      triggerOn: hasDailyTrigger_(),
      lastImport: new Date(),
      lastResult: result,
    });
    ui.alert(
      'Import finished',
      'Imported: ' +
        result.imported +
        '\nSkipped (already have): ' +
        result.skipped +
        '\nErrors: ' +
        result.errors +
        '\n\nCheck the fresh_facts tab and fresh_facts_import_log if something looks off.',
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert(
      'Import failed',
      'Run “1. Connect” first if you haven’t.\n\n' +
        String(err && err.message ? err.message : err),
      ui.ButtonSet.OK
    );
  }
}

function menuBackfill() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Backfill last 90 days?',
    'This looks through older Fresh Facts emails and imports any missing reports.\n\n' +
      'It can take a few minutes. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    ensureConfiguredOrThrow_();
    const result = importFreshFactsBackfill();
    ui.alert(
      'Backfill finished',
      'Imported: ' + result.imported + '\nSkipped: ' + result.skipped,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('Backfill failed', String(err && err.message ? err.message : err), ui.ButtonSet.OK);
  }
}

function menuChangeSender() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const current = props.getProperty(FF_PROP_SENDER) || 'from:' + FF_DEFAULT_SENDER;
  const response = ui.prompt(
    'Email sender',
    'Gmail search for who sends Fresh Facts.\n\n' +
      'Examples:\n' +
      '  from:Giuseppe Bonfiglio\n' +
      '  from:giuseppe@indexfresh.com\n\n' +
      'Current:\n' +
      current,
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  let value = String(response.getResponseText() || '').trim();
  if (!value) {
    ui.alert('No change', 'Sender left blank — keeping current setting.', ui.ButtonSet.OK);
    return;
  }
  if (value.indexOf('from:') !== 0) value = 'from:' + value;
  props.setProperty(FF_PROP_SENDER, value);
  updateStartHereStatus_(SpreadsheetApp.getActiveSpreadsheet(), {
    setupDone: isSetupDone_(),
    triggerOn: hasDailyTrigger_(),
  });
  ui.alert('Sender updated', 'Now searching: ' + value, ui.ButtonSet.OK);
}

function menuHelp() {
  const ui = SpreadsheetApp.getUi();
  const status = getStatusText_();
  ui.alert(
    'Fresh Facts — help',
    status +
      '\n\n————————\n' +
      'How to use\n' +
      '1. Connect (one-time)\n' +
      '2. Turn on daily auto-import\n' +
      '3. Optional: Import now / backfill\n\n' +
      'Data tabs: fresh_facts, fresh_facts_prices, fresh_facts_packed\n' +
      'Problems? Check fresh_facts_import_log or text Max.',
    ui.ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// Setup (menu + advanced)
// ---------------------------------------------------------------------------

/**
 * Owner connect — uses THIS spreadsheet (bound script). No IDs to paste.
 */
function connectFreshFactsForOwner_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this from the Fresh Facts spreadsheet (Extensions menu not required).');

  // Touch services so Google shows Allow screens in one pass.
  DriveApp.getRootFolder();
  GmailApp.getInboxThreads(0, 1);
  getOrCreateLabel_(FF_LABEL_IMPORTED);

  const folder = ensurePdfFolder_(ss);
  const result = setupFreshFactsPipeline({
    spreadsheetId: ss.getId(),
    folderId: folder.getId(),
  });

  PropertiesService.getScriptProperties().setProperty(FF_PROP_SETUP_DONE, 'true');
  ensureStartHereSheet_(ss);

  return {
    ss: ss,
    spreadsheetId: result.spreadsheetId,
    folderId: result.folderId,
    folderUrl: folder.getUrl(),
  };
}

/**
 * Advanced / Max-only: paste IDs if not using the bound-sheet menu flow.
 */
function setupFreshFactsOnce() {
  setupFreshFactsPipeline({
    spreadsheetId: 'PASTE_MASTER_SHEET_ID',
    folderId: 'PASTE_FOLDER_ID',
  });
}

function setupFreshFactsPipeline(opts) {
  opts = opts || {};
  if (!opts.spreadsheetId) throw new Error('spreadsheetId required');

  const props = {
    [FF_PROP_SPREADSHEET]: String(opts.spreadsheetId),
  };
  if (opts.folderId) props[FF_PROP_FOLDER] = String(opts.folderId);
  if (opts.senderQuery) props[FF_PROP_SENDER] = String(opts.senderQuery);
  PropertiesService.getScriptProperties().setProperties(props);

  const ss = SpreadsheetApp.openById(opts.spreadsheetId);
  ensureStartHereSheet_(ss);
  ensureSheetWithHeaders_(ss, FF_SHEET_SUMMARY, FF_SUMMARY_HEADERS);
  ensureSheetWithHeaders_(ss, FF_SHEET_PRICES, FF_PRICE_HEADERS);
  ensureSheetWithHeaders_(ss, FF_SHEET_PACKED, FF_PACKED_HEADERS);
  ensureSheetWithHeaders_(ss, FF_SHEET_LOG, FF_LOG_HEADERS);

  if (!opts.folderId) {
    const folder = DriveApp.createFolder('Fresh Facts PDFs — ' + ss.getName());
    PropertiesService.getScriptProperties().setProperty(FF_PROP_FOLDER, folder.getId());
    Logger.log('Created Drive folder: ' + folder.getUrl());
  }

  getOrCreateLabel_(FF_LABEL_IMPORTED);
  PropertiesService.getScriptProperties().setProperty(FF_PROP_SETUP_DONE, 'true');

  Logger.log('Fresh Facts pipeline ready: ' + ss.getUrl());
  return {
    spreadsheetId: opts.spreadsheetId,
    folderId: PropertiesService.getScriptProperties().getProperty(FF_PROP_FOLDER),
  };
}

/**
 * Install daily trigger (~7am, project timezone = America/Los_Angeles).
 */
function installDailyTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'importFreshFactsToday';
  });
  existing.forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('importFreshFactsToday')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  PropertiesService.getScriptProperties().setProperty(FF_PROP_TRIGGER_ON, 'true');
  Logger.log('Installed daily trigger: importFreshFactsToday at ~7am.');
}

function uninstallDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      return t.getHandlerFunction() === 'importFreshFactsToday';
    })
    .forEach(function (t) {
      ScriptApp.deleteTrigger(t);
    });
  PropertiesService.getScriptProperties().setProperty(FF_PROP_TRIGGER_ON, 'false');
  Logger.log('Removed importFreshFactsToday triggers.');
}

// ---------------------------------------------------------------------------
// Main import
// ---------------------------------------------------------------------------

/**
 * Look for unread (or recent) Fresh Facts emails and import any new PDFs.
 */
function importFreshFactsToday() {
  const cfg = getConfig_();
  const query = buildGmailQuery_(cfg.senderQuery, /* daysLookback */ 5);
  const threads = GmailApp.search(query, 0, 20);
  Logger.log('Gmail query: ' + query + ' → ' + threads.length + ' thread(s)');

  if (!threads.length) {
    appendImportLog_(cfg.ss, {
      status: 'no_mail',
      detail: 'No matching Fresh Facts emails. Query: ' + query,
    });
    return { imported: 0, skipped: 0, errors: 0 };
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  threads.forEach(function (thread) {
    const messages = thread.getMessages();
    messages.forEach(function (msg) {
      try {
        const result = importOneMessage_(msg, cfg);
        if (result.status === 'imported') imported++;
        else if (result.status === 'skipped') skipped++;
        else if (result.status === 'error') errors++;
      } catch (err) {
        errors++;
        appendImportLog_(cfg.ss, {
          status: 'error',
          subject: msg.getSubject(),
          message_id: msg.getId(),
          detail: String(err && err.message ? err.message : err),
        });
        Logger.log('Error importing message: ' + err);
      }
    });
  });

  Logger.log(
    'Done. imported=' + imported + ' skipped=' + skipped + ' errors=' + errors
  );
  return { imported: imported, skipped: skipped, errors: errors };
}

/**
 * Backfill: search farther back (default 90 days) and import any missing reports.
 */
function importFreshFactsBackfill() {
  const cfg = getConfig_();
  const query = buildGmailQuery_(cfg.senderQuery, /* daysLookback */ 90);
  const threads = GmailApp.search(query, 0, 100);
  Logger.log('Backfill query: ' + query + ' → ' + threads.length + ' thread(s)');

  let imported = 0;
  let skipped = 0;
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      const result = importOneMessage_(msg, cfg);
      if (result.status === 'imported') imported++;
      else if (result.status === 'skipped') skipped++;
    });
  });
  Logger.log('Backfill done. imported=' + imported + ' skipped=' + skipped);
  return { imported: imported, skipped: skipped };
}

/**
 * Test parser against pasted PDF text (no Gmail). Paste sample text into the
 * argument or use the built-in July 24 sample.
 */
function testParseFreshFactsSample() {
  const text = FF_SAMPLE_TEXT_JUL_24;
  const parsed = parseFreshFactsText_(text, {
    subject: 'Fresh Facts 07-24-26',
    fallbackDate: new Date(2026, 6, 24),
  });
  Logger.log(JSON.stringify(parsed, null, 2));
  return parsed;
}

// ---------------------------------------------------------------------------
// Per-message import
// ---------------------------------------------------------------------------

function importOneMessage_(msg, cfg) {
  const subject = String(msg.getSubject() || '');
  const messageId = msg.getId();

  if (!isFreshFactsSubject_(subject)) {
    return { status: 'ignored', reason: 'subject' };
  }

  if (alreadyImportedMessage_(cfg.ss, messageId)) {
    appendImportLog_(cfg.ss, {
      status: 'skipped',
      subject: subject,
      message_id: messageId,
      detail: 'message_id already in fresh_facts',
    });
    return { status: 'skipped', reason: 'duplicate_message' };
  }

  const pdf = findFreshFactsPdfAttachment_(msg);
  if (!pdf) {
    appendImportLog_(cfg.ss, {
      status: 'error',
      subject: subject,
      message_id: messageId,
      detail: 'No Fresh Facts PDF attachment found',
    });
    return { status: 'error', reason: 'no_pdf' };
  }

  const reportDateFromSubject = parseReportDateFromSubject_(subject);
  const saved = savePdfToDrive_(pdf.blob, pdf.name, cfg.folderId);

  let text = '';
  try {
    text = extractPdfText_(saved.blob, cfg.folderId);
  } catch (ocrErr) {
    appendImportLog_(cfg.ss, {
      status: 'error',
      subject: subject,
      message_id: messageId,
      pdf_name: pdf.name,
      detail: 'PDF text extract failed: ' + ocrErr,
    });
    // Keep the PDF in Drive even if parse fails
    return { status: 'error', reason: 'ocr', pdf_file_id: saved.fileId };
  }

  const parsed = parseFreshFactsText_(text, {
    subject: subject,
    fallbackDate: reportDateFromSubject || msg.getDate(),
  });

  if (!parsed.report_date) {
    appendImportLog_(cfg.ss, {
      status: 'error',
      subject: subject,
      message_id: messageId,
      pdf_name: pdf.name,
      detail: 'Could not parse report_date from PDF/subject',
    });
    return { status: 'error', reason: 'no_date' };
  }

  if (alreadyImportedReportDate_(cfg.ss, parsed.report_date)) {
    // Prefer keeping first import; still mark email imported
    labelAndMarkRead_(msg);
    appendImportLog_(cfg.ss, {
      status: 'skipped',
      subject: subject,
      message_id: messageId,
      pdf_name: pdf.name,
      report_date: formatDateIso_(parsed.report_date),
      detail: 'report_date already in fresh_facts (PDF saved: ' + saved.fileId + ')',
    });
    return { status: 'skipped', reason: 'duplicate_date', pdf_file_id: saved.fileId };
  }

  writeParsedToSheets_(cfg.ss, parsed, {
    subject: subject,
    message_id: messageId,
    pdf_file_id: saved.fileId,
    pdf_url: saved.url,
    pdf_name: pdf.name,
  });

  labelAndMarkRead_(msg);

  appendImportLog_(cfg.ss, {
    status: 'imported',
    subject: subject,
    message_id: messageId,
    pdf_name: pdf.name,
    report_date: formatDateIso_(parsed.report_date),
    detail:
      'prices=' +
      (parsed.prices || []).length +
      ' packed=' +
      (parsed.packed || []).length +
      ' confidence=' +
      parsed.extraction_confidence,
  });

  return {
    status: 'imported',
    report_date: parsed.report_date,
    pdf_file_id: saved.fileId,
  };
}

function findFreshFactsPdfAttachment_(msg) {
  const attachments = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
  let fallback = null;
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const name = String(att.getName() || '');
    const mime = String(att.getContentType() || '');
    const isPdf =
      /\.pdf$/i.test(name) || mime === MimeType.PDF || mime === 'application/pdf';
    if (!isPdf) continue;
    if (/fresh\s*facts/i.test(name)) {
      return { name: name, blob: att.copyBlob().setName(name) };
    }
    if (!fallback) fallback = { name: name, blob: att.copyBlob().setName(name) };
  }
  return fallback;
}

function savePdfToDrive_(blob, name, folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const safeName = name || 'Fresh_Facts_' + Date.now() + '.pdf';
  const file = folder.createFile(blob.copyBlob().setName(safeName));
  return {
    fileId: file.getId(),
    url: file.getUrl(),
    blob: file.getBlob(),
  };
}

function extractPdfText_(blob, folderId) {
  // Native-text PDFs convert cleanly; scanned pages still work via OCR flag.
  const mime = blob.getContentType() || 'application/pdf';
  const metadata = {
    title: 'ocr_fresh_facts_' + Date.now(),
    mimeType: mime,
    parents: [{ id: folderId }],
  };
  const boundary = 'ff_ocr_' + Date.now();
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelimiter = '\r\n--' + boundary + '--';
  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' +
    mime +
    '\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    Utilities.base64Encode(blob.getBytes()) +
    closeDelimiter;

  const url =
    'https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&ocr=true&convert=true&ocrLanguage=en';
  const options = {
    method: 'post',
    contentType: 'multipart/related; boundary=' + boundary,
    payload: multipartBody,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };

  let response = null;
  const backoffMs = [0, 2500, 6000];
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt] > 0) Utilities.sleep(backoffMs[attempt]);
    response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() < 300) break;
    const body = response.getContentText();
    if (!(response.getResponseCode() === 403 && /rate limit/i.test(body))) break;
  }

  if (!response || response.getResponseCode() >= 300) {
    throw new Error(
      'Drive OCR failed (' +
        (response ? response.getResponseCode() : 0) +
        '): ' +
        (response ? response.getContentText() : 'no response')
    );
  }

  const created = JSON.parse(response.getContentText());
  const docId = created.id;
  const text = DocumentApp.openById(docId).getBody().getText();
  DriveApp.getFileById(docId).setTrashed(true);
  return text || '';
}

function labelAndMarkRead_(msg) {
  const label = getOrCreateLabel_(FF_LABEL_IMPORTED);
  msg.getThread().addLabel(label);
  msg.markRead();
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse OCR / extracted text from a Fresh Facts PDF.
 * @param {string} text
 * @param {{subject?: string, fallbackDate?: Date}} opts
 */
function parseFreshFactsText_(text, opts) {
  opts = opts || {};
  const normalized = String(text || '').replace(/\r/g, '');
  const reportDate =
    parseReportDateFromBody_(normalized) ||
    parseReportDateFromSubject_(opts.subject || '') ||
    (opts.fallbackDate ? toDateOnly_(opts.fallbackDate) : null);

  const prices = parsePriceTable_(normalized);
  const caInv = parseCaliforniaInventory_(normalized);
  const countryInv = parseCountryInventory_(normalized);
  const harvest = parseHarvestForecast_(normalized);
  const packed = parsePackedInventory_(normalized);
  const commentary = parseMarketCommentary_(normalized);

  let confidence = 'high';
  if (!reportDate || prices.length < 3) confidence = 'low';
  else if (!caInv.ca_inv_total_lbs || !commentary) confidence = 'medium';

  return {
    report_date: reportDate,
    market_commentary: commentary,
    extraction_confidence: confidence,
    prices: prices,
    packed: packed,
    ca_inv_total_lbs: caInv.ca_inv_total_lbs,
    ca_inv_others_lbs: caInv.ca_inv_others_lbs,
    ca_inv_hass_lbs: caInv.ca_inv_hass_lbs,
    ca_bins_hass: caInv.ca_bins_hass,
    ca_bins_org: caInv.ca_bins_org,
    ca_bins_others: caInv.ca_bins_others,
    ca_bins_total: caInv.ca_bins_total,
    inv_ca_lbs: countryInv.inv_ca_lbs,
    inv_mexico_lbs: countryInv.inv_mexico_lbs,
    inv_peru_lbs: countryInv.inv_peru_lbs,
    inv_colombia_lbs: countryInv.inv_colombia_lbs,
    inv_chile_lbs: countryInv.inv_chile_lbs,
    inv_dominican_lbs: countryInv.inv_dominican_lbs,
    inv_worldwide_lbs: countryInv.inv_worldwide_lbs,
    harvest_this_week_total_lbs: harvest.this_week_total,
    harvest_next_week_total_lbs: harvest.next_week_total,
    packed_inv_today_total: packedTotal_(packed, 'packed_today'),
    packed_shipped_yesterday: packedTotal_(packed, 'shipped_yesterday'),
    notes: '',
  };
}

function parsePriceTable_(text) {
  const rows = [];
  // e.g. 32 $1.18 - $1.22 $1.36 - $1.40 $1.16 - $1.20
  // Lamb column sometimes ends with "1/0" (no quote)
  const re =
    /^(\d{2})\s+\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)(?:\s+\$?([\d.]+)\s*[-–]\s*\$?([\d.]+))?(?:\s+(?:\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)|1\/0))?/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const size = Number(m[1]);
    pushPrice_(rows, size, 'Hass', m[2], m[3]);
    if (m[4] != null) pushPrice_(rows, size, 'Organic Hass', m[4], m[5]);
    if (m[6] != null) pushPrice_(rows, size, 'Lamb Hass', m[6], m[7]);
  }
  return rows;
}

function pushPrice_(rows, size, variety, lowStr, highStr) {
  const low = toNumber_(lowStr);
  const high = toNumber_(highStr);
  if (low == null || high == null) return;
  rows.push({
    size: size,
    variety: variety,
    price_low: low,
    price_high: high,
    price_mid: Math.round(((low + high) / 2) * 1000) / 1000,
  });
}

function parseCaliforniaInventory_(text) {
  // Today 23-Jul 16,323,388 2,767,907 13,555,481 1,162 95 345 1,602
  const m = text.match(
    /Today\s+\d{1,2}-[A-Za-z]{3}\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i
  );
  if (!m) {
    return {
      ca_inv_total_lbs: null,
      ca_inv_others_lbs: null,
      ca_inv_hass_lbs: null,
      ca_bins_hass: null,
      ca_bins_org: null,
      ca_bins_others: null,
      ca_bins_total: null,
    };
  }
  return {
    ca_inv_total_lbs: toNumber_(m[1]),
    ca_inv_others_lbs: toNumber_(m[2]),
    ca_inv_hass_lbs: toNumber_(m[3]),
    ca_bins_hass: toNumber_(m[4]),
    ca_bins_org: toNumber_(m[5]),
    ca_bins_others: toNumber_(m[6]),
    ca_bins_total: toNumber_(m[7]),
  };
}

function parseCountryInventory_(text) {
  // First "Today ..." after a Calif./Mexico header — worldwide inventory by country
  // Today 13,555,481 29,155,043 21,964,079 478,850 0 408,062 65,561,515
  const block = text.match(
    /Calif\.?\s+Mexico\s+Peru[\s\S]{0,80}?Today\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i
  );
  if (!block) {
    // Fallback: Today line with 7 big numbers and no day-of-month token (23-Jul)
    const re =
      /Today\s+(?!\d{1,2}-[A-Za-z]{3})([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/gi;
    let found = null;
    let m;
    while ((m = re.exec(text)) !== null) found = m;
    if (!found) return emptyCountryInv_();
    return {
      inv_ca_lbs: toNumber_(found[1]),
      inv_mexico_lbs: toNumber_(found[2]),
      inv_peru_lbs: toNumber_(found[3]),
      inv_colombia_lbs: toNumber_(found[4]),
      inv_chile_lbs: toNumber_(found[5]),
      inv_dominican_lbs: toNumber_(found[6]),
      inv_worldwide_lbs: toNumber_(found[7]),
    };
  }
  return {
    inv_ca_lbs: toNumber_(block[1]),
    inv_mexico_lbs: toNumber_(block[2]),
    inv_peru_lbs: toNumber_(block[3]),
    inv_colombia_lbs: toNumber_(block[4]),
    inv_chile_lbs: toNumber_(block[5]),
    inv_dominican_lbs: toNumber_(block[6]),
    inv_worldwide_lbs: toNumber_(block[7]),
  };
}

function emptyCountryInv_() {
  return {
    inv_ca_lbs: null,
    inv_mexico_lbs: null,
    inv_peru_lbs: null,
    inv_colombia_lbs: null,
    inv_chile_lbs: null,
    inv_dominican_lbs: null,
    inv_worldwide_lbs: null,
  };
}

function parseHarvestForecast_(text) {
  // This week / Next week lines under Hass Harvest and Arrivals
  const thisWeek = text.match(/This week\s+([\d,]+(?:\s+[\d,]+){5,7})/i);
  const nextWeek = text.match(/Next week\s+([\d,]+(?:\s+[\d,]+){5,7})/i);
  return {
    this_week_total: lastNumberInList_(thisWeek && thisWeek[1]),
    next_week_total: lastNumberInList_(nextWeek && nextWeek[1]),
  };
}

function lastNumberInList_(listStr) {
  if (!listStr) return null;
  const nums = String(listStr).match(/[\d,]+/g);
  if (!nums || !nums.length) return null;
  return toNumber_(nums[nums.length - 1]);
}

function parsePackedInventory_(text) {
  const rows = [];
  // 32 6,623 6,297 4,637 2,416 38% 1.9
  const re =
    /^(28|32|36|40|48|60|70|84|94|#2'?s?|Sub-?Total|Total)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%?\s+([\d.]+)\s*$/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    const sizeLabel = normalizePackedSize_(m[1]);
    rows.push({
      size: sizeLabel,
      packed_last_week: toNumber_(m[2]),
      packed_yesterday: toNumber_(m[3]),
      packed_today: toNumber_(m[4]),
      shipped_yesterday: toNumber_(m[5]),
      pct_inventory_shipped: toNumber_(m[6]),
      days_on_hand: toNumber_(m[7]),
    });
  }
  return rows;
}

function normalizePackedSize_(raw) {
  const s = String(raw || '').trim();
  if (/^#?2/i.test(s)) return '#2s';
  if (/sub/i.test(s)) return 'Sub-Total';
  if (/total/i.test(s)) return 'Total';
  return s;
}

function packedTotal_(packed, field) {
  if (!packed || !packed.length) return null;
  for (let i = 0; i < packed.length; i++) {
    if (String(packed[i].size).toLowerCase() === 'total') return packed[i][field];
  }
  return null;
}

function parseMarketCommentary_(text) {
  // Prefer text after "Market Commentary" / date; fall back to paragraph before contacts.
  let chunk = '';
  const afterHeader = text.match(
    /Market Commentary[\s\S]{0,40}?(?:[A-Za-z]{3}\s+\d{1,2},\s+\d{4})?\s*([\s\S]+?)(?:Packinghouse|This Fresh Facts report|California Packed Inventory)/i
  );
  if (afterHeader) chunk = afterHeader[1];

  if (!chunk || chunk.trim().length < 40) {
    const beforeContacts = text.match(
      /((?:Large fruit|Lighter harvest|Celebrate|Fresh Facts)[\s\S]{20,600}?)(?:Packinghouse|\u201c|“|This Fresh Facts report)/i
    );
    if (beforeContacts) chunk = beforeContacts[1];
  }

  return cleanCommentary_(chunk);
}

function cleanCommentary_(raw) {
  if (!raw) return '';
  let t = String(raw)
    .replace(/Fresh Facts/gi, ' ')
    .replace(/Market Commentary/gi, ' ')
    .replace(/[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/g, ' ')
    .replace(/California Packed Inventory[\s\S]*/i, ' ')
    .replace(/Total Hass Inventory[\s\S]*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop leading title scraps
  t = t.replace(/^(Jul|Jun|Jan|Feb|Mar|Apr|May|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s*/i, '');
  return t.slice(0, 2000);
}

function parseReportDateFromBody_(text) {
  // "Jul 24, 2026"
  const m = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s+(\d{4})\b/i
  );
  if (!m) return null;
  const months = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const mi = months[m[1].slice(0, 3).toLowerCase()];
  if (mi == null) return null;
  return new Date(Number(m[3]), mi, Number(m[2]));
}

function parseReportDateFromSubject_(subject) {
  // Fresh Facts 07-24-26  or Fresh Facts 7-1-26
  const m = String(subject || '').match(
    /Fresh\s*Facts\s+(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/i
  );
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  return new Date(year, month, day);
}

function isFreshFactsSubject_(subject) {
  return /Fresh\s*Facts/i.test(String(subject || ''));
}

// ---------------------------------------------------------------------------
// Sheet writers
// ---------------------------------------------------------------------------

function writeParsedToSheets_(ss, parsed, meta) {
  const now = new Date();
  const reportDate = parsed.report_date;
  const pdfId = meta.pdf_file_id || '';

  const summarySheet = ss.getSheetByName(FF_SHEET_SUMMARY);
  summarySheet.appendRow([
    now,
    reportDate,
    meta.subject || '',
    meta.message_id || '',
    parsed.market_commentary || '',
    parsed.ca_inv_total_lbs,
    parsed.ca_inv_others_lbs,
    parsed.ca_inv_hass_lbs,
    parsed.ca_bins_hass,
    parsed.ca_bins_org,
    parsed.ca_bins_others,
    parsed.ca_bins_total,
    parsed.inv_ca_lbs,
    parsed.inv_mexico_lbs,
    parsed.inv_peru_lbs,
    parsed.inv_colombia_lbs,
    parsed.inv_chile_lbs,
    parsed.inv_dominican_lbs,
    parsed.inv_worldwide_lbs,
    parsed.harvest_this_week_total_lbs,
    parsed.harvest_next_week_total_lbs,
    parsed.packed_inv_today_total,
    parsed.packed_shipped_yesterday,
    pdfId,
    meta.pdf_url || '',
    meta.pdf_name || '',
    parsed.extraction_confidence || '',
    parsed.notes || '',
  ]);

  const priceSheet = ss.getSheetByName(FF_SHEET_PRICES);
  (parsed.prices || []).forEach(function (p) {
    priceSheet.appendRow([
      now,
      reportDate,
      p.size,
      p.variety,
      p.price_low,
      p.price_high,
      p.price_mid,
      pdfId,
    ]);
  });

  const packedSheet = ss.getSheetByName(FF_SHEET_PACKED);
  (parsed.packed || []).forEach(function (r) {
    packedSheet.appendRow([
      now,
      reportDate,
      r.size,
      r.packed_last_week,
      r.packed_yesterday,
      r.packed_today,
      r.shipped_yesterday,
      r.pct_inventory_shipped,
      r.days_on_hand,
      pdfId,
    ]);
  });
}

function alreadyImportedMessage_(ss, messageId) {
  if (!messageId) return false;
  const sheet = ss.getSheetByName(FF_SHEET_SUMMARY);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const col = FF_SUMMARY_HEADERS.indexOf('message_id') + 1;
  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(messageId)) return true;
  }
  return false;
}

function alreadyImportedReportDate_(ss, reportDate) {
  if (!reportDate) return false;
  const sheet = ss.getSheetByName(FF_SHEET_SUMMARY);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const col = FF_SUMMARY_HEADERS.indexOf('report_date') + 1;
  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  const target = formatDateIso_(reportDate);
  for (let i = 0; i < values.length; i++) {
    const cell = values[i][0];
    if (!cell) continue;
    const iso = cell instanceof Date ? formatDateIso_(cell) : String(cell).slice(0, 10);
    if (iso === target) return true;
  }
  return false;
}

function appendImportLog_(ss, row) {
  const sheet = ss.getSheetByName(FF_SHEET_LOG);
  if (!sheet) return;
  sheet.appendRow([
    new Date(),
    row.status || '',
    row.subject || '',
    row.message_id || '',
    row.pdf_name || '',
    row.report_date || '',
    row.detail || '',
  ]);
}

// ---------------------------------------------------------------------------
// Config / helpers
// ---------------------------------------------------------------------------

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(FF_PROP_SPREADSHEET);
  let folderId = props.getProperty(FF_PROP_FOLDER);

  // Bound-sheet fallback: use the open spreadsheet after Make-a-copy
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheetId && active) {
    spreadsheetId = active.getId();
    props.setProperty(FF_PROP_SPREADSHEET, spreadsheetId);
  }
  if (!spreadsheetId) {
    throw new Error('Not connected yet. Use menu: 🥑 Fresh Facts → 1. Connect (one-time setup).');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  if (!folderId) {
    const folder = ensurePdfFolder_(ss);
    folderId = folder.getId();
    props.setProperty(FF_PROP_FOLDER, folderId);
  }

  return {
    spreadsheetId: spreadsheetId,
    folderId: folderId,
    senderQuery: props.getProperty(FF_PROP_SENDER) || 'from:' + FF_DEFAULT_SENDER,
    ss: ss,
  };
}

function ensureConfiguredOrThrow_() {
  if (!isSetupDone_()) {
    // Soft recover if properties were lost after Make a copy
    connectFreshFactsForOwner_();
  }
  getConfig_();
}

function isSetupDone_() {
  return PropertiesService.getScriptProperties().getProperty(FF_PROP_SETUP_DONE) === 'true';
}

function hasDailyTrigger_() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'importFreshFactsToday';
  });
}

function ensurePdfFolder_(ss) {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty(FF_PROP_FOLDER);
  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (err) {
      // Folder deleted or inaccessible — create a new one
    }
  }

  const folderName = 'Fresh Facts PDFs — ' + ss.getName();
  // Prefer placing next to the spreadsheet when possible
  const file = DriveApp.getFileById(ss.getId());
  const parents = file.getParents();
  let folder;
  if (parents.hasNext()) {
    const parent = parents.next();
    const matches = parent.getFoldersByName(folderName);
    folder = matches.hasNext() ? matches.next() : parent.createFolder(folderName);
  } else {
    folder = DriveApp.createFolder(folderName);
  }
  props.setProperty(FF_PROP_FOLDER, folder.getId());
  return folder;
}

function ensureStartHereSheet_(ss) {
  let sheet = ss.getSheetByName(FF_SHEET_START);
  if (!sheet) {
    sheet = ss.insertSheet(FF_SHEET_START, 0);
  }

  const rows = [
    ['Summerland — Fresh Facts (Index Fresh market report)', ''],
    ['', ''],
    ['STATUS', ''],
    ['Connected', 'Not yet — use menu below'],
    ['Daily auto-import', 'Off'],
    ['Email sender search', 'from:' + FF_DEFAULT_SENDER],
    ['PDF folder', ''],
    ['Last import', ''],
    ['Last import result', ''],
    ['', ''],
    ['WHAT TO DO (3 clicks)', ''],
    ['1', 'Menu bar → 🥑 Fresh Facts → 1. Connect (one-time setup)'],
    ['2', 'Click Allow on any Google permission screens'],
    ['3', 'Menu → 🥑 Fresh Facts → 2. Turn on daily auto-import'],
    ['', ''],
    ['OPTIONAL', ''],
    ['Import now', 'Pull today’s / recent Fresh Facts email immediately'],
    ['Import last 90 days', 'Backfill older reports already in your Gmail'],
    ['Change email sender', 'Only if Connect finds no mail from Giuseppe'],
    ['', ''],
    ['WHERE THE DATA GOES', ''],
    ['fresh_facts', 'One row per day — inventory, commentary, PDF link'],
    ['fresh_facts_prices', 'Hass / Organic / Lamb prices by size'],
    ['fresh_facts_packed', 'Packed inventory by carton size'],
    ['fresh_facts_import_log', 'Success / skip / error log'],
    ['', ''],
    ['NEED HELP?', 'Text or email Max — include a screenshot of this tab'],
  ];

  sheet.clear();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  sheet.getRange(3, 1).setFontWeight('bold').setBackground('#e8f0e8');
  sheet.getRange(11, 1).setFontWeight('bold').setBackground('#e8f0e8');
  sheet.getRange(16, 1).setFontWeight('bold').setBackground('#e8f0e8');
  sheet.getRange(21, 1).setFontWeight('bold').setBackground('#e8f0e8');
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 520);

  // Refresh live status fields if already configured
  updateStartHereStatus_(ss, {
    setupDone: isSetupDone_(),
    triggerOn: hasDailyTrigger_(),
  });

  return sheet;
}

function updateStartHereStatus_(ss, state) {
  state = state || {};
  const sheet = ss.getSheetByName(FF_SHEET_START) || ensureStartHereSheet_(ss);
  const props = PropertiesService.getScriptProperties();
  const sender = props.getProperty(FF_PROP_SENDER) || 'from:' + FF_DEFAULT_SENDER;

  let folderUrl = '';
  const folderId = props.getProperty(FF_PROP_FOLDER);
  if (folderId) {
    try {
      folderUrl = DriveApp.getFolderById(folderId).getUrl();
    } catch (err) {
      folderUrl = '(folder missing — run Connect again)';
    }
  }
  if (state.folderUrl) folderUrl = state.folderUrl;

  sheet.getRange(4, 2).setValue(state.setupDone ? 'Yes ✔' : 'Not yet — use menu below');
  sheet.getRange(5, 2).setValue(state.triggerOn ? 'On ✔ (~7:00 AM Pacific)' : 'Off');
  sheet.getRange(6, 2).setValue(sender);
  sheet.getRange(7, 2).setValue(folderUrl || '');

  if (state.lastImport) {
    sheet.getRange(8, 2).setValue(state.lastImport);
  }
  if (state.lastResult) {
    sheet
      .getRange(9, 2)
      .setValue(
        'imported ' +
          state.lastResult.imported +
          ', skipped ' +
          state.lastResult.skipped +
          ', errors ' +
          state.lastResult.errors
      );
  }
}

function getStatusText_() {
  const props = PropertiesService.getScriptProperties();
  const lines = [
    'Connected: ' + (isSetupDone_() ? 'Yes' : 'No'),
    'Daily auto-import: ' + (hasDailyTrigger_() ? 'On' : 'Off'),
    'Sender: ' + (props.getProperty(FF_PROP_SENDER) || 'from:' + FF_DEFAULT_SENDER),
  ];
  const folderId = props.getProperty(FF_PROP_FOLDER);
  if (folderId) {
    try {
      lines.push('PDF folder: ' + DriveApp.getFolderById(folderId).getUrl());
    } catch (err) {
      lines.push('PDF folder: (missing)');
    }
  }
  return lines.join('\n');
}

function buildGmailQuery_(senderQuery, daysLookback) {
  const days = daysLookback || 5;
  // subject:"Fresh Facts" matches "Fresh Facts 07-24-26"
  return (
    (senderQuery || 'from:' + FF_DEFAULT_SENDER) +
    ' subject:"Fresh Facts" has:attachment filename:pdf newer_than:' +
    days +
    'd'
  );
}

function ensureSheetWithHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0e8');
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateLabel_(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}

function toNumber_(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').replace(/%/g, '').trim());
  return isNaN(n) ? null : n;
}

function toDateOnly_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateIso_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * Required scopes note for the manifest / first auth:
 * Gmail, Drive, Spreadsheets, Documents, external requests (Drive OCR upload).
 */
function authorizeFreshFactsScopes() {
  GmailApp.getInboxThreads(0, 1);
  DriveApp.getRootFolder();
  SpreadsheetApp.getActive();
  UrlFetchApp.fetch('https://www.googleapis.com/', { muteHttpExceptions: true });
  Logger.log('Authorization prompt complete (ignore fetch errors).');
}

// Sample body text from Fresh Facts 07-24-26.pdf (for testParseFreshFactsSample).
const FF_SAMPLE_TEXT_JUL_24 =
  'Size Hass Organic Hass Lamb Hass\n' +
  '32 $1.18 - $1.22 $1.36 - $1.40 $1.16 - $1.20\n' +
  '36 $1.18 - $1.22 $1.36 - $1.40 $1.16 - $1.20\n' +
  '40 $1.18 - $1.22 $1.44 - $1.48 $1.16 - $1.20\n' +
  '48 $1.22 - $1.26 $1.58 - $1.62 $1.16 - $1.20\n' +
  '60 $0.84 - $0.88 $1.44 - $1.48 1/0\n' +
  '70 $0.66 - $0.70 $1.24 - $1.28\n' +
  '84 $0.52 - $0.56 $0.96 - $1.00\n' +
  'Day Date Total CA Inv\n' +
  '(lbs.) Others Hass Hass Org. Has Others Total\n' +
  'Today 23-Jul 16,323,388 2,767,907 13,555,481 1,162 95 345 1,602\n' +
  'Yesterday 22-Jul 16,475,066 2,426,981 14,048,085 1,342 202 574 2,118\n' +
  'Last Week 16-Jul 18,216,578 1,383,171 16,833,407 1,628 192 387 2,207\n' +
  'Calif. Mexico Peru Colombia Chile Domincan Total\n' +
  'Today 13,555,481 29,155,043 21,964,079 478,850 0 408,062 65,561,515\n' +
  'Yesterday 14,048,085 31,405,498 21,992,836 534,575 0 0 67,980,994\n' +
  'Last Week 16,833,407 28,485,661 24,061,593 615,200 0 423,575 70,419,436\n' +
  'Calif. Mexico Peru Colombia Chile Dominican D.R. Total\n' +
  '2 wks. ago 12,479,680 36,300,271 13,152,854 809,605 0 0 0 62,742,410\n' +
  'Last week 11,291,501 37,647,108 13,701,236 1,465,310 0 0 0 64,105,155\n' +
  'This week 12,000,000 36,000,000 13,000,000 750,000 0 250,000 0 62,000,000\n' +
  'Next week 12,000,000 37,000,000 13,000,000 750,000 0 300,000 0 63,050,000\n' +
  'Size 16-Jul 22-Jul 23-Jul 22-Jul\n' +
  '28 19 0 0 0 0% 0.0\n' +
  '32 6,623 6,297 4,637 2,416 38% 1.9\n' +
  '36 23,511 15,765 16,931 1,321 8% 12.8\n' +
  '40 39,333 33,551 32,561 4,407 13% 7.4\n' +
  '48 193,233 123,469 112,339 25,588 21% 4.4\n' +
  '60 158,130 144,004 140,763 14,335 10% 9.8\n' +
  '70 90,090 82,418 80,655 8,794 11% 9.2\n' +
  '84 34,511 35,520 34,576 2,062 6% 16.8\n' +
  '94 10,356 8,444 8,124 314 4% 25.9\n' +
  'Sub-Total 555,806 449,469 430,586 59,237 13% 7.3\n' +
  "#2's 78,921 78,669 75,487 8,732 11% 8.6\n" +
  'Total 634,727 528,137 506,073 67,969 13% 7.4\n' +
  'Large fruit remains in high demand while plentiful supplies of small\n' +
  'fruit continues to put downward pressure on those sizes.\n' +
  'Fresh Facts\nMarket Commentary\nJul 24, 2026\n';
