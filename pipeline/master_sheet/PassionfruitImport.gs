/**
 * Exotic sales summaries — live connection to SB Farm exotics workbook.
 *
 * Full transaction data stays in the exotics sheet. This script reads every
 * year tab (2022, 2023, 2024… — auto-detected) and writes summaries only to
 * exotics_sales_summary on the operations sheet.
 *
 * ONE-TIME SETUP:
 *   1. Paste the exotics spreadsheet ID into INDEX → "SB Farm exotics — sheet ID"
 *   2. Run connectExoticSalesFromIndex()  OR  menu: Summerland Ops → Connect exotics sheet
 *   3. Run installExoticSalesSyncTrigger() for daily auto-sync (optional but recommended)
 *
 * After setup, summaries refresh daily and when you open the operations sheet.
 * Adding a new tab named "2026" in the exotics sheet is picked up automatically.
 */

const ES_PROP_SOURCE_ID = 'EXOTIC_SALES_SOURCE_SPREADSHEET_ID';
const ES_PROP_LAST_SYNC = 'ES_LAST_SYNC_MS';
const ES_SUMMARY_TAB = 'exotics_sales_summary';
const ES_INDEX_ID_LABEL = 'SB Farm exotics — sheet ID';

const ES_SUMMARY_HEADERS = ['year', 'product', 'total_lbs', 'total_revenue', 'avg_price_per_lb'];

const ES_SKIP_ROW_RE = /sales by|total cash|deposits to|unaccounted|benchmark|running total|seasonally|estimate|checksum|weeks paid|amt /i;

const ES_SYNC_THROTTLE_MS = 3600000; // 1 hour between onOpen syncs

// --- Menu + onOpen ---

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Summerland Ops')
    .addItem('Sync exotic sales summaries now', 'syncExoticSalesSummaries')
    .addItem('Connect exotics sheet (read ID from INDEX)', 'connectExoticSalesFromIndex')
    .addItem('Install daily auto-sync trigger', 'installExoticSalesSyncTrigger')
    .addToUi();
  if (typeof buildDashboardMenu_ === 'function') {
    buildDashboardMenu_();
  }
  maybeAutoSyncExoticSales_();
}

// --- Setup ---

/**
 * Reads spreadsheet ID from INDEX tab, saves it, runs first sync.
 */
function connectExoticSalesFromIndex() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceId = getExoticSalesSourceId_(ss);
  if (!sourceId) {
    throw new Error(
      'Paste the SB Farm exotics spreadsheet ID in INDEX → "' + ES_INDEX_ID_LABEL + '" (column B), then run again.'
    );
  }
  PropertiesService.getScriptProperties().setProperties({
    [ES_PROP_SOURCE_ID]: sourceId,
    SPREADSHEET_ID: ss.getId(),
  });
  const result = syncExoticSalesSummaries();
  Logger.log('Connected and synced. Year tabs: ' + result.yearTabs.join(', '));
  return result;
}

function setupExoticSalesSource(opts) {
  opts = opts || {};
  const sourceId = opts.spreadsheetId || getExoticSalesSourceId_();
  if (!sourceId) throw new Error('Pass spreadsheetId or set INDEX → sheet ID first.');

  SpreadsheetApp.openById(sourceId); // validate access
  PropertiesService.getScriptProperties().setProperty(ES_PROP_SOURCE_ID, sourceId);
  writeExoticSourceIdToIndex_(sourceId);

  const result = syncExoticSalesSummaries();
  Logger.log('Source configured. Year tabs: ' + result.yearTabs.join(', '));
  return result;
}

/** @deprecated */
function setupPassionfruitSource(opts) {
  return setupExoticSalesSource(opts);
}

// --- Sync ---

function syncExoticSalesSummaries(opts) {
  opts = opts || {};
  let master;
  if (opts.spreadsheetId) {
    master = SpreadsheetApp.openById(opts.spreadsheetId);
  } else {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      master = active;
    } else {
      const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (!id) throw new Error('No active spreadsheet — open the operations sheet or set SPREADSHEET_ID.');
      master = SpreadsheetApp.openById(id);
    }
  }

  const sourceId = getExoticSalesSourceId_(master);
  if (!sourceId) {
    throw new Error('Connect the exotics sheet first (INDEX → sheet ID, then connectExoticSalesFromIndex).');
  }

  const source = SpreadsheetApp.openById(sourceId);
  const yearTabs = discoverYearTabs_(source);
  if (!yearTabs.length) {
    throw new Error('No year tabs found on exotics sheet. Name tabs like 2022, 2023, 2024…');
  }

  const target = ensureExoticSalesSummaryTab_(master);
  const totals = {};

  yearTabs.forEach(function (tabName) {
    const sheet = source.getSheetByName(tabName);
    if (sheet) aggregateSheet_(sheet, totals, parseInt(tabName, 10));
  });

  const out = Object.keys(totals)
    .sort(function (a, b) {
      const pa = a.split('|');
      const pb = b.split('|');
      const yc = parseInt(pa[0], 10) - parseInt(pb[0], 10);
      return yc !== 0 ? yc : pa[1].localeCompare(pb[1]);
    })
    .map(function (key) {
      const parts = key.split('|');
      const t = totals[key];
      const avg = t.lbs ? t.revenue / t.lbs : '';
      return [parseInt(parts[0], 10), parts[1], t.lbs, t.revenue, avg];
    });

  target.clearContents();
  writeHeaders_(target, ES_SUMMARY_HEADERS);
  if (out.length) {
    target.getRange(2, 1, out.length, ES_SUMMARY_HEADERS.length).setValues(out);
  }

  PropertiesService.getScriptProperties().setProperty(ES_PROP_LAST_SYNC, String(Date.now()));

  Logger.log(
    'Synced ' + out.length + ' summary rows from tabs: ' + yearTabs.join(', ')
  );

  try {
    refreshMetricsFormulas(master.getId());
  } catch (e) {
    Logger.log('Metrics refresh skipped: ' + e.message);
  }

  if (!opts.silent) {
    writeExoticSourceUrlToIndex_(master, source.getUrl(), yearTabs);
  }

  return { rowCount: out.length, yearTabs: yearTabs, masterUrl: master.getUrl() };
}

/** @deprecated */
function syncExoticSalesHistory() {
  return syncExoticSalesSummaries();
}

/** @deprecated */
function syncPassionfruitHistory() {
  return syncExoticSalesSummaries();
}

function maybeAutoSyncExoticSales_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss || !getExoticSalesSourceId_(ss)) return;

    const last = parseInt(
      PropertiesService.getScriptProperties().getProperty(ES_PROP_LAST_SYNC) || '0',
      10
    );
    if (Date.now() - last < ES_SYNC_THROTTLE_MS) return;

    syncExoticSalesSummaries({ silent: true });
  } catch (e) {
    Logger.log('Background sync skipped: ' + e.message);
  }
}

function installExoticSalesSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'syncExoticSalesSummaries' || fn === 'dailyExoticSalesSync_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('dailyExoticSalesSync_').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Daily auto-sync installed (6am). New year tabs are detected automatically.');
}

/** @deprecated */
function installPassionfruitSyncTrigger() {
  return installExoticSalesSyncTrigger();
}

function dailyExoticSalesSync_() {
  syncExoticSalesSummaries({ silent: true });
}

// --- Year tab discovery ---

/**
 * Finds all tabs named with a 4-digit year (2022, 2023, 2026…).
 * Adding a new "2026" tab in the exotics sheet requires no config change.
 */
function discoverYearTabs_(workbook) {
  return workbook
    .getSheets()
    .map(function (s) {
      return s.getName().trim();
    })
    .filter(function (name) {
      return /^(19|20)\d{2}$/.test(name);
    })
    .sort(function (a, b) {
      return parseInt(a, 10) - parseInt(b, 10);
    });
}

// --- INDEX helpers ---

function getExoticSalesSourceId_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  const fromProps = PropertiesService.getScriptProperties().getProperty(ES_PROP_SOURCE_ID);
  if (fromProps) return fromProps.trim();

  const index = ss.getSheetByName('INDEX');
  if (!index) return null;

  const lastRow = index.getLastRow();
  if (lastRow < 1) return null;

  const labels = index.getRange(1, 1, lastRow, 1).getValues();
  for (let i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).indexOf('sheet ID') >= 0) {
      const id = String(index.getRange(i + 1, 2).getValue() || '').trim();
      if (id && id.indexOf('PASTE') < 0) return id;
    }
  }
  return null;
}

function writeExoticSourceIdToIndex_(sourceId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const index = ss.getSheetByName('INDEX');
  if (!index) return;

  const lastRow = index.getLastRow();
  const labels = index.getRange(1, 1, lastRow, 1).getValues();
  for (let i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).indexOf('sheet ID') >= 0) {
      index.getRange(i + 1, 2).setValue(sourceId);
      return;
    }
  }
}

function writeExoticSourceUrlToIndex_(ss, url, yearTabs) {
  const index = ss.getSheetByName('INDEX');
  if (!index) return;

  const lastRow = index.getLastRow();
  const labels = index.getRange(1, 1, lastRow, 1).getValues();
  for (let i = 0; i < labels.length; i++) {
    const label = String(labels[i][0]);
    if (label.indexOf('Exotic sales history') >= 0) {
      index.getRange(i + 1, 2).setValue(url + ' (tabs: ' + yearTabs.join(', ') + ')');
      return;
    }
  }
}

// --- Tab + aggregation ---

function ensureExoticSalesSummaryTab_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ES_SUMMARY_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(ES_SUMMARY_TAB);
    writeHeaders_(sheet, ES_SUMMARY_HEADERS);
  }
  return sheet;
}

function aggregateSheet_(sheet, totals, yearFromTab) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Read through last row; stop at the on-sheet "Sales by Fruit" summary block
  const values = sheet.getRange(2, 1, lastRow, 6).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const dateRaw = row[0];
    const fruit = String(row[2] || '').trim();
    const qtyRaw = row[4];
    const totalRaw = row[5];

    if (isSummaryRow_(dateRaw, fruit)) break;
    if (!fruit) continue;

    const classified = classifyExoticProduct_(fruit);
    if (!classified) continue;

    // Prefer the year tab name (2026) so new tabs roll up correctly even if a row date is odd
    let year = yearFromTab;
    if (!year) {
      if (!dateRaw) continue;
      const date = parseSheetDate_(dateRaw);
      if (!date) continue;
      year = date.getFullYear();
    }

    const quantity = parseNumber_(qtyRaw);
    const revenue = parseMoney_(totalRaw);
    if (quantity === null || revenue === null) continue;

    const key = year + '|' + classified.product;
    if (!totals[key]) totals[key] = { lbs: 0, revenue: 0 };
    totals[key].lbs += quantity;
    totals[key].revenue += revenue;
  }
}

/**
 * Keep dropdown fruit names (Red Passion, Yellow Passion, Mix Passion, Chiles, Lemons, …).
 * Avocados included so the dashboard can show every dropdown option; overall “exotics $”
 * on the dash excludes them.
 */
function classifyExoticProduct_(fruit) {
  const raw = String(fruit || '').trim();
  if (!raw) return null;
  const f = raw.toLowerCase().replace(/\s+/g, ' ');

  if (/red\s*passion/.test(f) || /^red$/.test(f)) return { product: 'Red Passion' };
  if (/yellow\s*passion/.test(f) || /^yellow$/.test(f)) return { product: 'Yellow Passion' };
  if (/mix\s*passion/.test(f)) return { product: 'Mix Passion' };
  if (/passion/.test(f)) return { product: 'Passionfruit' }; // legacy / generic label

  if (/avocado|^avos$/.test(f)) return { product: 'Avocados' };
  if (/chile/.test(f)) return { product: 'Chiles' };
  if (/lemon/.test(f)) return { product: 'Lemons' };
  if (/dragon/.test(f)) return { product: 'Dragonfruit' };
  if (/orange/.test(f)) return { product: 'Oranges' };
  if (/melon/.test(f)) return { product: 'Melon' };
  if (/^mix$/.test(f)) return { product: 'Mix' };
  return { product: raw.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) };
}

function isSummaryRow_(dateRaw, fruit) {
  const dateStr = String(dateRaw || '');
  const fruitStr = String(fruit || '');
  if (ES_SKIP_ROW_RE.test(dateStr) || ES_SKIP_ROW_RE.test(fruitStr)) return true;
  if (/^\d{4}\s+total/i.test(dateStr)) return true;
  return false;
}

function parseSheetDate_(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const d = new Date(String(val || '').trim());
  return isNaN(d.getTime()) ? null : d;
}

function parseMoney_(val) {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const n = parseFloat(String(val || '').replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

function parseNumber_(val) {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const n = parseFloat(String(val || '').replace(/,/g, ''));
  return isNaN(n) ? null : n;
}
