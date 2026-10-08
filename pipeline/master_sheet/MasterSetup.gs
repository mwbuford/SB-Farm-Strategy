/**
 * Summerland Farm Operations — Master Sheet Setup (simplified)
 *
 * Run createMasterWorkbook() once from the Apps Script editor.
 * Creates: INDEX, blocks, the input logs, and the metrics tabs.
 *
 * Then:
 *   1. Link Google Forms 1–4 to the input log tabs
 *   2. Run bin_receipt_scanner setupPipeline({ spreadsheetId: '...' })
 *   3. Fill the blocks tab with ranch data
 */

const MASTER_SHEET_NAME = 'Summerland Farm Operations';

const TAB_SCHEMAS = {
  INDEX: [], // built manually in createIndexTab_()

  blocks: ['block_id', 'crop', 'acres', 'notes'],

  harvest_log: [
    'submitted_at',
    'date',
    'block_parcel',
    'bins',
    'bin_type',
    'crew_size',
    'notes',
    'submitter_email',
  ],

  labor_log: [
    // Linked Google Form (Form_Responses) — do not rename live headers
    'Timestamp', // A
    'Fecha', // B work date
    'Horas trabajadas (total)', // C
    'Cuantos trabajadores', // D
    'Trabajo realizado', // E activity
    'Block trabajó en', // F
    'nombres de los trabajadores', // G — used as metrics_labor.worker
    'Notas (opcional)', // H
  ],

  passionfruit_sales: [
    'submitted_at',
    'date',
    'channel',
    'quantity',
    'unit',
    'revenue',
    'notes',
    'submitter_email',
  ],

  // Summary only — full sales data stays in SB Farm exotics workbook
  exotics_sales_summary: [
    'year',
    'product',
    'total_lbs',
    'total_revenue',
    'avg_price_per_lb',
  ],

  field_notes: [
    'submitted_at',
    'date',
    'block_area',
    'category',
    'note',
    'photo_url',
    'submitter_email',
  ],

  // Owner Notes web app (consultant / agronomist / advisor knowledge)
  owner_notes: [
    'logged_at',
    'note_date',
    'title',
    'with_whom',
    'category',
    'note_body',
    'summary',
    'photo_file_id',
    'photo_url',
    'ocr_text',
    'doc_file_id',
    'doc_url',
    'bookmark_id',
    'bookmark_url',
    'author',
  ],

  bin_receipts: [
    'logged_at',
    'date_picked_up',
    'block_parcel',
    'variety',
    'full_bins',
    'partial_bins',
    'grower_name',
    'receipt_number',
    'pickup_time',
    'remarks',
    'image_file_id',
    'image_url',
    'extraction_confidence',
    'raw_json',
  ],

  bin_numbers: [
    'logged_at',
    'date_picked_up',
    'block_parcel',
    'variety',
    'bin_number',
    'receipt_number',
    'image_file_id',
  ],

  grower_statements: [
    'logged_at',
    'statement_date',
    'pool_number',
    'variety',
    'period_start',
    'period_end',
    'block_parcel',
    'index_block_id',
    'bins_received',
    'lbs_grade1',
    'lbs_grade2',
    'lbs_culls',
    'lbs_total',
    'gross_amount',
    'charges_total',
    'net_amount',
    'field_receipts',
    'pdf_file_id',
    'pdf_url',
    'extraction_confidence',
    'notes',
  ],

  grower_statement_receipts: [
    'logged_at',
    'pool_number',
    'period_start',
    'period_end',
    'block_parcel',
    'receipt_number',
    'statement_row_id',
    'pdf_file_id',
  ],

  metrics_block_returns: [
    'week_start',
    'block_parcel',
    'pool_number',
    'bins_received',
    'lbs_total',
    'gross_amount',
    'net_amount',
    'net_per_bin',
    'net_per_lb',
    'notes',
  ],

  metrics_pickups: [
    'week_start',
    'block_parcel',
    'variety',
    'pickup_count',
    'bin_count',
    'notes',
  ],

  metrics_avocado: [
    'week_start',
    'block_parcel',
    'harvest_bins',
    'pickup_bins',
    'delta',
    'flag',
  ],

  metrics_labor: [
    'week_start',
    'activity',
    'total_hours',
    'est_cost',
  ],

  metrics_passionfruit: [
    'month',
    'channel',
    'total_quantity',
    'total_revenue',
    'avg_price_per_unit',
  ],

  metrics_passionfruit_yearly: [
    'year',
    'total_lbs',
    'total_revenue',
    'avg_price_per_lb',
  ],

  // Populated by fresh_facts_scanner (Gmail → PDF → parse)
  fresh_facts: [
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
  ],

  fresh_facts_prices: [
    'logged_at',
    'report_date',
    'size',
    'variety',
    'price_low',
    'price_high',
    'price_mid',
    'pdf_file_id',
  ],

  fresh_facts_packed: [
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
  ],

  fresh_facts_import_log: [
    'logged_at',
    'status',
    'subject',
    'message_id',
    'pdf_name',
    'report_date',
    'detail',
  ],
};

const BLOCKS_STARTER = [
  ['Ardillas', 'Hass avocado', '', 'Ranch block'],
  ['Codornices', 'Hass avocado', '', 'Also spelled godornicez on receipts'],
  ['Colibri', 'Hass avocado', '', ''],
  ['Tecolotes', 'Hass avocado', '', ''],
  ['Venados', 'Hass avocado', '', ''],
  ['Gato Montez', 'Hass avocado', '', ''],
  ['Ranas', 'Hass avocado', '', ''],
  ['El Puma', 'Hass avocado', '', 'Often written PUMA on receipts'],
  ['Las Abejas', 'Hass avocado', '', ''],
  ['Gavilanes', 'Hass avocado', '', ''],
  ['Los Osos', 'Hass avocado', '', ''],
  ['Caballos', 'Hass avocado', '', ''],
  ['La Casa', 'Hass avocado', '', ''],
  ['Cuervos', 'Hass avocado', '', ''],
  ['Citrus — North', 'Lemon', '', 'Declining stand'],
  ['Citrus — South', 'Lemon', '', 'Declining stand'],
  ['Passionfruit', 'Passionfruit', '', ''],
  ['Other', '', '', 'Non-field / general'],
];

/**
 * Main entry — creates workbook, folder, and all tabs.
 */
function createMasterWorkbook() {
  const folder = DriveApp.createFolder('Summerland Farm Operations');
  const ss = SpreadsheetApp.create(MASTER_SHEET_NAME);
  const file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  const indexSheet = ss.getSheets()[0];
  indexSheet.setName('INDEX');
  createIndexTab_(indexSheet);

  const tabOrder = [
    'blocks',
    'harvest_log',
    'labor_log',
    'passionfruit_sales',
    'exotics_sales_summary',
    'field_notes',
    'owner_notes',
    'bin_receipts',
    'bin_numbers',
    'grower_statements',
    'grower_statement_receipts',
    'fresh_facts',
    'fresh_facts_prices',
    'fresh_facts_packed',
    'fresh_facts_import_log',
    'metrics_pickups',
    'metrics_avocado',
    'metrics_block_returns',
    'metrics_labor',
    'metrics_passionfruit',
    'metrics_passionfruit_yearly',
  ];

  tabOrder.forEach(function (tabName) {
    const headers = TAB_SCHEMAS[tabName];
    const sheet = ss.insertSheet(tabName);
    writeHeaders_(sheet, headers);

    if (tabName === 'blocks') {
      sheet.getRange(2, 1, BLOCKS_STARTER.length, BLOCKS_STARTER[0].length).setValues(BLOCKS_STARTER);
    }
  });

  addMetricsFormulas_(ss);

  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: ss.getId(),
    UPLOAD_FOLDER_ID: folder.getId(),
  });

  Logger.log('Master workbook created.');
  Logger.log('Sheet URL: ' + ss.getUrl());
  Logger.log('Drive folder: ' + folder.getUrl());
  Logger.log('Spreadsheet ID: ' + ss.getId());
  Logger.log('Folder ID: ' + folder.getId());

  return { spreadsheetId: ss.getId(), folderId: folder.getId(), url: ss.getUrl() };
}

function writeHeaders_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0e8');
}

function createIndexTab_(sheet) {
  sheet.clear();
  const rows = [
    ['Summerland Farm Operations — Data Pipeline', ''],
    ['', ''],
    ['FORM LINKS (paste URLs after creating forms)', ''],
    ['Form 1: Avocado Harvest Log', ''],
    ['Form 2: Worker Hours Log', ''],
    ['Form 3: Passionfruit Sales Log', ''],
    ['Form 4: Field Notes', ''],
    ['Form 5: Bin Receipt Photo Upload', ''],
    ['Form 6: Grower Statement PDF Upload', ''],
    ['Form 7: Owner Notes (Sarah)', ''],
    ['Fresh Facts email scanner', 'Auto — Gmail from Giuseppe Bonfiglio'],
    ['Exotic sales history (SB Farm exotics)', ''],
    ['SB Farm exotics — sheet ID (auto-sync)', ''],
    ['Owner Dashboard (Looker Studio)', ''],
    ['Photo archive folder', ''],
    ['', ''],
    ['ARMANDO — WHEN TO LOG', ''],
    ['Pick avocados same day', '→ Harvest Log'],
    ['Index Fresh picks up', '→ Photograph receipt → Bin Receipt Upload'],
    ['Index Fresh grower statement arrives', '→ Upload PDF → Grower Statement Upload'],
    ['Fresh Facts email (daily)', '→ Auto-imported to fresh_facts tabs'],
    ['Sell passionfruit', '→ Passionfruit Sales'],
    ['End of week', '→ Worker Hours'],
    ['Field issue (irrigation, pest, etc.)', '→ Field Notes'],
    ['Consultant / agronomist meeting (Sarah)', '→ Owner Notes'],
    ['', ''],
    ['Built:', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })],
  ];
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  sheet.getRange(3, 1).setFontWeight('bold');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).indexOf('ARMANDO') === 0) {
      sheet.getRange(i + 1, 1).setFontWeight('bold');
    }
  }
  sheet.setColumnWidth(1, 360);
  sheet.setColumnWidth(2, 400);
}

/**
 * Auto-updating metric formulas. Each rolls up its source log.
 * Uses US-locale array literals: comma = columns side-by-side, semicolon = stack rows.
 * Labels are blank so row-1 headers are not duplicated by QUERY.
 */
function addMetricsFormulas_(ss) {
  // --- metrics_pickups: from bin_receipts (1 row = 1 pickup) ---
  // week_start | block_parcel | variety | pickup_count | bin_count
  // Commas = side-by-side columns (US locale). Semicolons stack vertically and break Col2+.
  const pickups = ss.getSheetByName('metrics_pickups');
  pickups.getRange('A2').clearNote();
  pickups.getRange('A2').setFormula(
    '=IF(COUNTA(bin_receipts!A:A)<=1,"",' +
      'QUERY({' +
      'ARRAYFORMULA(IF(bin_receipts!B2:B="","",INT(IFERROR(N(bin_receipts!B2:B),DATEVALUE(bin_receipts!B2:B))-WEEKDAY(IFERROR(N(bin_receipts!B2:B),DATEVALUE(bin_receipts!B2:B)),2)+1))),' +
      'bin_receipts!C2:C,' +
      'bin_receipts!D2:D,' +
      'ARRAYFORMULA(IF(bin_receipts!B2:B="","",1)),' +
      'ARRAYFORMULA(IF(bin_receipts!B2:B="","",N(bin_receipts!E2:E)))' +
      '},"select Col1, Col2, Col3, sum(Col4), sum(Col5) ' +
      'where Col1 is not null group by Col1, Col2, Col3 ' +
      'label sum(Col4) \'\', sum(Col5) \'\'",0))'
  );
  pickups.getRange('A:A').setNumberFormat('M/d/yyyy');
  pickups.getRange('A2').setNote(
    'From bin_receipts (not bin_numbers): pickup_count = # of receipt rows; bin_count = sum of full_bins. Week = Monday of date_picked_up.'
  );

  // --- metrics_avocado: harvest_log bins vs bin_receipts full_bins by week+block ---
  // week_start | block_parcel | harvest_bins | pickup_bins | delta | flag
  const avocado = ss.getSheetByName('metrics_avocado');
  avocado.getRange('A2').clearNote();
  avocado.getRange('A2').setFormula(
    '=IF(AND(COUNTA(harvest_log!A:A)<=1,COUNTA(bin_receipts!A:A)<=1),"",' +
      'QUERY({' +
      'ARRAYFORMULA(IF(harvest_log!B2:B="","",INT(harvest_log!B2:B-WEEKDAY(harvest_log!B2:B,2)+1))),' +
      'harvest_log!C2:C,' +
      'ARRAYFORMULA(IF(harvest_log!B2:B="","",N(harvest_log!D2:D))),' +
      'ARRAYFORMULA(IF(harvest_log!B2:B="","",0));' +
      'ARRAYFORMULA(IF(bin_receipts!B2:B="","",INT(bin_receipts!B2:B-WEEKDAY(bin_receipts!B2:B,2)+1))),' +
      'bin_receipts!C2:C,' +
      'ARRAYFORMULA(IF(bin_receipts!B2:B="","",0)),' +
      'ARRAYFORMULA(IF(bin_receipts!B2:B="","",N(bin_receipts!E2:E)))' +
      '},"select Col1, Col2, sum(Col3), sum(Col4), sum(Col3)-sum(Col4) ' +
      'where Col1 is not null and Col2 is not null group by Col1, Col2 ' +
      'label sum(Col3) \'\', sum(Col4) \'\', sum(Col3)-sum(Col4) \'\'",0))'
  );
  avocado.getRange('F2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IF(ABS(E2:E)>1,"CHECK","")))'
  );
  avocado.getRange('A2').setNote(
    'harvest_bins from harvest_log; pickup_bins from bin_receipts.full_bins; delta = harvest − pickup; flag CHECK if |delta| > 1.'
  );

  // --- metrics_labor: from Form_Responses labor_log (crew totals) ---
  // A Timestamp | B Fecha | C Horas total | D # workers | E Trabajo | F Block | ...
  // metrics columns: week_start | activity | total_hours | est_cost
  // Rate in I1 ($27). Format column A as Date.
  const labor = ss.getSheetByName('metrics_labor');
  labor.getRange('A2').clearNote();
  labor.getRange('H1').setValue('hourly_rate_$').setFontWeight('bold').setBackground('#e8f0e8');
  labor.getRange('I1').setValue(27).setNumberFormat('$#,##0.00');
  labor.getRange('A2').setFormula(
    '=IF(COUNTA(labor_log!A:A)<=1,"",' +
      'QUERY({' +
      'ARRAYFORMULA(IF(labor_log!B2:B="","",INT(labor_log!B2:B-WEEKDAY(labor_log!B2:B,2)+1))),' +
      'labor_log!E2:E,' +
      'ARRAYFORMULA(IF(labor_log!B2:B="","",N(labor_log!C2:C))),' +
      'ARRAYFORMULA(IF(labor_log!B2:B="","",N(labor_log!C2:C)*$I$1))' +
      '},"select Col1, Col2, sum(Col3), sum(Col4) ' +
      'where Col1 is not null group by Col1, Col2 ' +
      'label sum(Col3) \'\', sum(Col4) \'\'",0))'
  );
  labor.getRange('A:A').setNumberFormat('M/d/yyyy');
  labor.getRange('A2').setNote(
    'week_start = Monday of Fecha; activity = Trabajo realizado; cost = hours × I1 ($27). No worker column.'
  );

  // --- metrics_passionfruit: from passionfruit_sales ---
  // month | channel | total_quantity | total_revenue | avg_price_per_unit (weighted)
  const passion = ss.getSheetByName('metrics_passionfruit');
  passion.getRange('A2').clearNote();
  passion.getRange('A2').setFormula(
    '=IF(COUNTA(passionfruit_sales!A:A)<=1,"",' +
      'QUERY({' +
      'ARRAYFORMULA(IF(passionfruit_sales!B2:B="","",TEXT(passionfruit_sales!B2:B,"yyyy-mm"))),' +
      'passionfruit_sales!C2:C,' +
      'ARRAYFORMULA(IF(passionfruit_sales!B2:B="","",N(passionfruit_sales!D2:D))),' +
      'ARRAYFORMULA(IF(passionfruit_sales!B2:B="","",N(passionfruit_sales!F2:F)))' +
      '},"select Col1, Col2, sum(Col3), sum(Col4) ' +
      'where Col1 is not null group by Col1, Col2 ' +
      'label sum(Col3) \'\', sum(Col4) \'\'",0))'
  );
  passion.getRange('E2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IF(N(C2:C)=0,"",N(D2:D)/N(C2:C))))'
  );
  passion.getRange('A2').setNote(
    'From passionfruit_sales: avg_price_per_unit = total_revenue / total_quantity (weighted), not average of row prices.'
  );

  // --- exotics_sales_summary: filled by syncExoticSalesSummaries() from SB Farm exotics ---
  const exoticsSummary = ss.getSheetByName('exotics_sales_summary');
  if (exoticsSummary) {
    exoticsSummary.getRange('A1').setNote(
      'Auto-synced from SB Farm exotics (INDEX → sheet ID). Full transaction data stays in source sheet. ' +
        'New year tabs (2026, 2027…) are picked up automatically. Products match the Fruit dropdown ' +
        '(Red Passion, Yellow Passion, Mix Passion, Chiles, Lemons, …). ' +
        'Menu: Summerland Ops → Sync exotic sales summaries.'
    );
  }

  // --- metrics_passionfruit_yearly: passionfruit summary + Form 3 current sales ---
  const passionYearly = ss.getSheetByName('metrics_passionfruit_yearly');
  passionYearly.getRange('A2').clearNote();
  passionYearly.getRange('A2').setFormula(
    '=IF(AND(COUNTA(exotics_sales_summary!A:A)<=1,COUNTA(passionfruit_sales!A:A)<=1),"",' +
      'QUERY({' +
      'ARRAYFORMULA(IF((exotics_sales_summary!A2:A="")+(IFERROR(REGEXMATCH(exotics_sales_summary!B2:B,"(?i)passion"),FALSE)=FALSE),"",exotics_sales_summary!A2:A)),' +
      'ARRAYFORMULA(IF((exotics_sales_summary!A2:A="")+(IFERROR(REGEXMATCH(exotics_sales_summary!B2:B,"(?i)passion"),FALSE)=FALSE),"",N(exotics_sales_summary!C2:C))),' +
      'ARRAYFORMULA(IF((exotics_sales_summary!A2:A="")+(IFERROR(REGEXMATCH(exotics_sales_summary!B2:B,"(?i)passion"),FALSE)=FALSE),"",N(exotics_sales_summary!D2:D)));' +
      'ARRAYFORMULA(IF(passionfruit_sales!B2:B="","",YEAR(passionfruit_sales!B2:B))),' +
      'ARRAYFORMULA(IF(passionfruit_sales!B2:B="","",N(passionfruit_sales!D2:D))),' +
      'ARRAYFORMULA(IF(passionfruit_sales!B2:B="","",N(passionfruit_sales!F2:F)))' +
      '},"select Col1, sum(Col2), sum(Col3) ' +
      'where Col1 is not null group by Col1 order by Col1 ' +
      'label sum(Col2) \'\', sum(Col3) \'\'",0))'
  );
  passionYearly.getRange('D2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IF(N(B2:B)=0,"",N(C2:C)/N(B2:B))))'
  );
  passionYearly.getRange('A2').setNote(
    'Passionfruit only: exotics_sales_summary (historical) + passionfruit_sales (Form 3). ' +
      'For all products use exotics_sales_summary directly.'
  );

  // --- metrics_block_returns: from grower_statements ---
  // week_start | block | pool | bins | lbs | gross | net | net_per_bin | net_per_lb
  const blockReturns = ss.getSheetByName('metrics_block_returns');
  blockReturns.getRange('A2').clearNote();
  blockReturns.getRange('A2').setFormula(
    '=IF(COUNTA(grower_statements!A:A)<=1,"",' +
      'QUERY({' +
      'ARRAYFORMULA(IF(grower_statements!E2:E="","",INT(grower_statements!E2:E-WEEKDAY(grower_statements!E2:E,2)+1))),' +
      'grower_statements!G2:G,' +
      'grower_statements!C2:C,' +
      'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!I2:I))),' +
      'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!M2:M))),' +
      'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!N2:N))),' +
      'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!P2:P)))' +
      '},"select Col1, Col2, Col3, sum(Col4), sum(Col5), sum(Col6), sum(Col7) ' +
      'where Col1 is not null group by Col1, Col2, Col3 ' +
      'label sum(Col4) \'\', sum(Col5) \'\', sum(Col6) \'\', sum(Col7) \'\'",0))'
  );
  blockReturns.getRange('H2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IF(N(D2:D)=0,"",N(G2:G)/N(D2:D))))'
  );
  blockReturns.getRange('I2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",IF(N(E2:E)=0,"",N(G2:G)/N(E2:E))))'
  );
  blockReturns.getRange('A2').setNote(
    'From grower_statements: week_start = Monday of period_start. ' +
      'net_per_bin = net/bins; net_per_lb = net/lbs (weighted). ' +
      'Receipt join to bin_receipts is via grower_statement_receipts (for reconciliation views / dashboard).'
  );
}

/**
 * Add exotic sales historical + metrics tabs to an existing master workbook.
 */
function ensureExoticSalesTabs(spreadsheetId) {
  const id =
    spreadsheetId ||
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    SpreadsheetApp.getActiveSpreadsheet().getId();
  const ss = SpreadsheetApp.openById(id);

  const newTabs = ['exotics_sales_summary', 'metrics_passionfruit_yearly'];

  newTabs.forEach(function (tabName) {
    if (!ss.getSheetByName(tabName)) {
      const sheet = ss.insertSheet(tabName);
      writeHeaders_(sheet, TAB_SCHEMAS[tabName]);
    }
  });

  refreshMetricsFormulas(id);
  Logger.log('Exotic sales tabs ensured on ' + ss.getUrl());
  return ss.getUrl();
}

/** @deprecated use ensureExoticSalesTabs */
function ensurePassionfruitTabs(spreadsheetId) {
  return ensureExoticSalesTabs(spreadsheetId);
}

/**
 * Re-apply metrics formulas on an existing master workbook.
 * Run from the Apps Script editor after pasting an updated MasterSetup.gs,
 * or pass a spreadsheet ID. Falls back to Script Properties SPREADSHEET_ID,
 * then to the active spreadsheet.
 */
function refreshMetricsFormulas(spreadsheetId) {
  const id =
    spreadsheetId ||
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    SpreadsheetApp.getActiveSpreadsheet().getId();
  const ss = SpreadsheetApp.openById(id);

  const required = [
    'metrics_pickups',
    'metrics_avocado',
    'metrics_labor',
    'metrics_passionfruit',
    'metrics_passionfruit_yearly',
    'metrics_block_returns',
    'bin_receipts',
    'harvest_log',
    'labor_log',
    'passionfruit_sales',
    'exotics_sales_summary',
    'grower_statements',
  ];
  const missing = required.filter(function (name) {
    return !ss.getSheetByName(name);
  });
  if (missing.length) {
    throw new Error('Missing tabs: ' + missing.join(', '));
  }

  // Clear old spill + helper formula cells before rewriting
  [
    'metrics_pickups',
    'metrics_avocado',
    'metrics_labor',
    'metrics_passionfruit',
    'metrics_passionfruit_yearly',
    'metrics_block_returns',
  ].forEach(
    function (name) {
      const sh = ss.getSheetByName(name);
      const lastCol = Math.max(TAB_SCHEMAS[name].length, sh.getLastColumn(), 1);
      const lastRow = Math.max(sh.getLastRow(), 50); // enough room for prior spill
      sh.getRange(2, 1, lastRow, lastCol).clearContent();
      sh.getRange(2, 1, lastRow, lastCol).clearNote();
    }
  );

  addMetricsFormulas_(ss);
  Logger.log('Metrics formulas refreshed on ' + ss.getUrl());
  return ss.getUrl();
}

/**
 * Optional: drop a few sample rows so you can visually confirm metrics spill.
 * Does NOT clear existing data — appends below the last row of each log.
 */
function seedMetricsSampleData() {
  const id =
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    SpreadsheetApp.getActiveSpreadsheet().getId();
  const ss = SpreadsheetApp.openById(id);
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  function append_(tab, rows) {
    const sh = ss.getSheetByName(tab);
    const start = Math.max(sh.getLastRow() + 1, 2);
    sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  }

  append_('harvest_log', [
    [now, monday, 'Ardillas', 8, 'field bin', 3, 'sample harvest', ''],
    [now, monday, 'Codornices', 5, 'field bin', 2, 'sample harvest', ''],
  ]);
  append_('bin_receipts', [
    [now, monday, 'Ardillas', 'Hass', 7, 0, 'Summerland', 'SAMPLE-001', '10:00', 'sample', '', '', 'manual', ''],
    [now, monday, 'Codornices', 'Hass', 5, 0, 'Summerland', 'SAMPLE-002', '11:00', 'sample', '', '', 'manual', ''],
  ]);
  append_('labor_log', [
    [now, monday, 32, 4, 'Poda', 'Ardillas', 'sample crew'],
    [now, monday, 24, 3, 'Control de malezas', 'Codornices', 'sample crew'],
  ]);
  append_('passionfruit_sales', [
    [now, monday, 'Farm stand', 12, 'lb', 60, 'sample', ''],
    [now, monday, 'Restaurant', 20, 'lb', 140, 'sample', ''],
  ]);
  append_('grower_statements', [
    [
      now,
      monday,
      'POOL-SAMPLE',
      'Hass',
      monday,
      monday,
      'Ardillas',
      'Ardillas',
      7,
      1000,
      200,
      50,
      1250,
      2500,
      200,
      2300,
      'SAMPLE-001',
      '',
      '',
      'manual',
      'sample',
    ],
  ]);

  refreshMetricsFormulas(id);
  Logger.log('Sample rows appended and metrics refreshed: ' + ss.getUrl());
  return ss.getUrl();
}
