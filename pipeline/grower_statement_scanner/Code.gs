/**
 * Index Fresh Grower Statement — upload PDF/photo → OCR → parse → review → sheet
 * One PDF often has multiple pages = one statement per block.
 *
 * IMPORTANT: Deploy this in its OWN Apps Script project (not inside the bin-receipt
 * project). Both files declare doGet(); Apps Script globals collide across .gs files.
 *
 * Writes:
 *   grower_statements          — one row per block/page
 *   grower_statement_receipts  — one row per Field Receipt # (join to bin_receipts)
 */

const SHEET_STATEMENTS = 'grower_statements';
const SHEET_STATEMENT_RECEIPTS = 'grower_statement_receipts';

const STATEMENT_HEADERS = [
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
];

const STATEMENT_RECEIPT_HEADERS = [
  'logged_at',
  'pool_number',
  'period_start',
  'period_end',
  'block_parcel',
  'receipt_number',
  'statement_row_id',
  'pdf_file_id',
];

const GS_KNOWN_BLOCKS = [
  'Ardillas',
  'Codornices',
  'Colibri',
  'Tecolotes',
  'Venados',
  'Gato Montez',
  'Ranas',
  'El Puma',
  'Las Abejas',
  'Gavilanes',
  'Los Osos',
  'Caballos',
  'La Casa',
  'Cuervos',
];

const GS_BLOCK_ALIASES = {
  PUMA: 'El Puma',
  ELPUMA: 'El Puma',
  LOSOSOS: 'Los Osos',
  LOSOS: 'Los Osos',
  CODORNIZE: 'Codornices',
  CODORNICES: 'Codornices',
  GODORNICEZ: 'Codornices',
  GODORNICES: 'Codornices',
  GODORNIZE: 'Codornices',
  GODORNISS: 'Codornices',
  CODORNIZES: 'Codornices',
  LACASA: 'La Casa',
  RANAS: 'Ranas',
  COLIBRI: 'Colibri',
  TECOLOTE: 'Tecolotes',
  TECOLOTES: 'Tecolotes',
  VENADO: 'Venados',
  VENADOS: 'Venados',
  GATOMONTEZ: 'Gato Montez',
  LASAVEJAS: 'Las Abejas',
  LASABEJAS: 'Las Abejas',
  AVEJAS: 'Las Abejas',
  ABEJAS: 'Las Abejas',
  GAVILAN: 'Gavilanes',
  GAVILANES: 'Gavilanes',
  CABALLO: 'Caballos',
  CABALLOS: 'Caballos',
  CUERVO: 'Cuervos',
  CUERVOS: 'Cuervos',
  LOSCUERVO: 'Cuervos',
  LOSCUERVOS: 'Cuervos',
  ARDILLA: 'Ardillas',
  ARDILLAS: 'Ardillas',
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Upload')
    .setTitle('Grower Statement Upload')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function processStatementEntry(data, base64Data, mimeType) {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('UPLOAD_FOLDER_ID');
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not set. Run setupGrowerStatementPipeline() from the Apps Script editor.');
  }

  data = data || {};
  let sourceText = String(data.pasted_text || '').trim();
  let fileId = '';
  let fileUrl = '';
  let ocrWarning = '';

  if (base64Data) {
    if (!folderId) throw new Error('UPLOAD_FOLDER_ID not set. Run setupGrowerStatementPipeline() first.');
    const decoded = decodeBase64File_(base64Data, mimeType);
    const blob = Utilities.newBlob(
      decoded.bytes,
      decoded.mimeType,
      'grower_statement_' + Date.now() + decoded.ext
    );
    const file = DriveApp.getFolderById(folderId).createFile(blob);
    fileId = file.getId();
    fileUrl = file.getUrl();
  }

  if (!sourceText && base64Data) {
    try {
      const decoded = decodeBase64File_(base64Data, mimeType);
      if (decoded.mimeType.indexOf('heic') !== -1) {
        ocrWarning = 'HEIC not supported for OCR. Use PDF/JPG/PNG or paste text manually.';
      } else {
        const blob = Utilities.newBlob(
          decoded.bytes,
          decoded.mimeType,
          'ocr_statement_' + Date.now() + decoded.ext
        );
        sourceText = ocrFileToText_(blob, folderId);
      }
    } catch (err) {
      ocrWarning = 'OCR failed: ' + err;
    }
  }

  let statementsToSave = [];
  if (data.statements_json) {
    try {
      const reviewed = JSON.parse(data.statements_json);
      if (Array.isArray(reviewed)) {
        for (let i = 0; i < reviewed.length; i++) {
          statementsToSave.push(buildStatementFromReview_(reviewed[i]));
        }
      }
    } catch (e) {
      throw new Error('Invalid statements data from form.');
    }
  }

  if (!statementsToSave.length && sourceText) {
    const parsed = parseAllStatementsText_(sourceText, data.filename || '');
    for (let i = 0; i < parsed.length; i++) {
      statementsToSave.push(buildStatementFromReview_(parsed[i]));
    }
  }

  if (!statementsToSave.length) {
    throw new Error('No statements to save. Upload a PDF/photo or paste OCR text first.');
  }

  let totalRows = 0;
  const summaries = [];
  for (let i = 0; i < statementsToSave.length; i++) {
    const extracted = statementsToSave[i];
    if (!extracted.block_parcel) {
      throw new Error(
        'Statement ' +
          (i + 1) +
          ': pick a ranch block from the list (Ardillas, Caballos, …). Grower # GR… is not a block.'
      );
    }
    if (!extracted.period_start && !extracted.period_end) {
      throw new Error('Statement ' + (i + 1) + ': missing pool week dates. Edit and try again.');
    }
    if (extracted.net_amount == null && extracted.gross_amount == null) {
      throw new Error('Statement ' + (i + 1) + ': missing net or gross amount.');
    }

    const written = writeStatementData_(spreadsheetId, extracted, fileId, fileUrl);
    totalRows += written.rows;
    summaries.push({
      block: extracted.block_parcel,
      pool: extracted.pool_number,
      periodStart: extracted.period_start,
      periodEnd: extracted.period_end,
      bins: extracted.bins_received,
      net: extracted.net_amount,
      receiptCount: written.receiptCount,
    });
  }

  return {
    ok: true,
    statementCount: summaries.length,
    summaries: summaries,
    rowsWritten: totalRows,
    fileSaved: !!fileId,
    warning: ocrWarning || '',
  };
}

function previewStatementFromPastedText(text, filename) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return { text: '', warning: 'No text to parse.', statements: [], statementCount: 0 };
  }
  const statements = parseAllStatementsText_(normalized, filename || '');
  return {
    text: normalized,
    warning: '',
    statements: statements,
    statementCount: statements.length,
  };
}

function previewOcrFile(base64Data, mimeType, filename) {
  if (!base64Data) return { text: '', warning: 'No file selected.', statements: [] };

  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('UPLOAD_FOLDER_ID');
  if (!folderId) throw new Error('UPLOAD_FOLDER_ID not set. Run setupGrowerStatementPipeline() first.');

  const decoded = decodeBase64File_(base64Data, mimeType);
  if (decoded.mimeType.indexOf('heic') !== -1) {
    return {
      text: '',
      warning: 'HEIC is not supported. Upload PDF or JPG/PNG, or paste text manually.',
      statements: [],
    };
  }

  const blob = Utilities.newBlob(
    decoded.bytes,
    decoded.mimeType,
    'ocr_preview_' + Date.now() + decoded.ext
  );
  const text = ocrFileToText_(blob, folderId);
  const statements = parseAllStatementsText_(text, filename || '');

  return {
    text: text || '',
    warning: statements.length
      ? ''
      : 'OCR ran but no statements were detected. Paste/edit text and Re-parse.',
    statements: statements,
    statementCount: statements.length,
  };
}

/** Split multi-page OCR into one chunk per grower statement. */
function parseAllStatementsText_(text, filename) {
  const normalized = String(text || '').replace(/\r/g, '\n');
  const fileHints = hintsFromFilename_(filename);

  // Period / statement date often sit in the PDF header ABOVE the first
  // "GROWER STATEMENT" title — extract from the full doc so every page inherits them.
  const docPeriod = extractPeriodDates_(normalized);
  const docStmtDate = extractStatementDate_(normalized);
  if (!fileHints.period_start && docPeriod.start) fileHints.period_start = docPeriod.start;
  if (!fileHints.period_end && docPeriod.end) fileHints.period_end = docPeriod.end;

  const markers = [];
  const re = /GROWER\s+STATEMENT/gi;
  let m;
  while ((m = re.exec(normalized)) !== null) {
    markers.push(m.index);
  }

  if (!markers.length) {
    const single = parseStatementText_(normalized, fileHints);
    if (single && !single.statement_date) {
      single.statement_date = docStmtDate || single.period_end || single.period_start || null;
    }
    return single && (single.block_parcel || single.net_amount != null || single.bins_received)
      ? [single]
      : [];
  }

  // Preamble (logo / dates / grower #) shared across pages
  const preamble = normalized.slice(0, markers[0]);

  const statements = [];
  let lastPool = fileHints.pool_number;
  let lastPeriod = { start: fileHints.period_start, end: fileHints.period_end };
  let lastStmtDate = docStmtDate || lastPeriod.end || lastPeriod.start || null;

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i];
    const end = i + 1 < markers.length ? markers[i + 1] : normalized.length;
    // Include shared header so dates above the title still parse per page
    const chunk = (preamble ? preamble + '\n' : '') + normalized.slice(start, end);
    const parsed = parseStatementText_(chunk, fileHints);
    if (parsed) {
      if (parsed.pool_number != null) lastPool = parsed.pool_number;
      else if (lastPool != null) parsed.pool_number = lastPool;
      if (parsed.period_start) lastPeriod.start = parsed.period_start;
      else if (lastPeriod.start) parsed.period_start = lastPeriod.start;
      if (parsed.period_end) lastPeriod.end = parsed.period_end;
      else if (lastPeriod.end) parsed.period_end = lastPeriod.end;
      if (parsed.statement_date) lastStmtDate = parsed.statement_date;
      else if (lastStmtDate) parsed.statement_date = lastStmtDate;
      else parsed.statement_date = parsed.period_end || parsed.period_start || null;
      if (parsed.block_parcel || parsed.net_amount != null || parsed.bins_received) {
        statements.push(parsed);
      }
    }
  }
  return statements;
}

/**
 * Optional hints from filenames like:
 * "Jun 23, 2024 TO Jun 29, 2024 pool 35b.pdf"
 */
function hintsFromFilename_(filename) {
  const name = String(filename || '');
  const out = { pool_number: null, period_start: null, period_end: null, pool_suffix: null };

  const pool = name.match(/pool\s*(\d+)\s*([ab])?/i);
  if (pool) {
    out.pool_number = Number(pool[1]);
    if (pool[2]) out.pool_suffix = pool[2].toUpperCase();
  }

  const period = name.match(
    /([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*(?:TO|to|[-–])\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/
  );
  if (period) {
    out.period_start = parseEnglishDate_(period[1]);
    out.period_end = parseEnglishDate_(period[2]);
  }

  const slash = name.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:TO|to|[-–])\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/
  );
  if (slash) {
    out.period_start = out.period_start || parseSlashDate_(slash[1]);
    out.period_end = out.period_end || parseSlashDate_(slash[2]);
  }

  return out;
}

function parseStatementText_(text, fileHints) {
  fileHints = fileHints || {};
  const normalized = normalizeOcrText_(String(text || '').replace(/\r/g, '\n'));

  // "Pool 35 B HA" / "Pool 35 A Hass" / "Pool 37 Hass"
  let poolNumber =
    gsNumberOrNull_(gsMatchGroup_(normalized, /Pool\s+(\d+)\s*[AB]?\b/i)) ||
    gsNumberOrNull_(gsMatchGroup_(normalized, /Pool\s*#?\s*(\d+)/i)) ||
    fileHints.pool_number ||
    null;

  const variety = /\bLamb\s*Hass\b/i.test(normalized)
    ? 'Lamb Hass'
    : /\bHass\b/i.test(normalized) || /\bPool\s+\d+\s*[AB]?\s*HA\b/i.test(normalized)
      ? 'Hass'
      : 'Hass';

  const period = extractPeriodDates_(normalized);
  if (!period.start && fileHints.period_start) period.start = fileHints.period_start;
  if (!period.end && fileHints.period_end) period.end = fileHints.period_end;

  const statementDate = extractStatementDate_(normalized) || period.end || period.start;

  const binsReceived = extractBinsReceived_(normalized);

  const indexBlockId = extractIndexBlockId_(normalized);
  const blockParcel = extractStatementBlock_(normalized, indexBlockId);

  // Row-wise grade parse first; fall back to columnar OCR (2024 scanned PDFs)
  let lbsGrade1 = extractGradeLbs_(normalized, 1);
  let lbsGrade2 = extractGradeLbs_(normalized, 2);
  let lbsCulls = extractGradeLbs_(normalized, 'culls');

  const columnar = extractColumnarTotals_(normalized);
  if (lbsGrade1 == null && columnar.lbs_grade1 != null) lbsGrade1 = columnar.lbs_grade1;
  if (lbsGrade2 == null && columnar.lbs_grade2 != null) lbsGrade2 = columnar.lbs_grade2;
  if (lbsCulls == null && columnar.lbs_culls != null) lbsCulls = columnar.lbs_culls;

  const totalReturns = extractTotalReturns_(normalized);
  let lbsTotal = totalReturns.lbs;
  let grossAmount = totalReturns.amount;
  let avgRate = totalReturns.rate;

  if (lbsTotal == null && columnar.lbs_total != null) lbsTotal = columnar.lbs_total;
  if (grossAmount == null && columnar.gross_amount != null) grossAmount = columnar.gross_amount;

  if (lbsTotal == null && (lbsGrade1 != null || lbsGrade2 != null || lbsCulls != null)) {
    lbsTotal = gsRoundMoney_((lbsGrade1 || 0) + (lbsGrade2 || 0) + (lbsCulls || 0), 1);
  }

  // Culls should be small vs total — if OCR pulled Total Returns lbs into culls, discard
  if (lbsCulls != null && lbsTotal != null && lbsCulls > lbsTotal * 0.5) {
    lbsCulls = null;
  }
  if (lbsCulls != null && lbsGrade1 != null && lbsCulls > lbsGrade1) {
    lbsCulls = null;
  }

  lbsGrade2 = deriveGrade2Lbs_(lbsGrade2, lbsTotal, lbsGrade1, lbsCulls);

  if (grossAmount != null && grossAmount <= 100.5 && lbsTotal != null && lbsTotal > 500) {
    grossAmount = null;
  }
  if (grossAmount != null && lbsTotal != null && Math.abs(grossAmount - lbsTotal) < 0.05) {
    grossAmount = null;
  }
  // Reject tiny "gross" that is clearly a size-row amount (e.g. 118.68)
  if (grossAmount != null && lbsTotal != null && lbsTotal > 1000 && grossAmount < lbsTotal * 0.05) {
    grossAmount = null;
  }

  if (grossAmount == null) {
    const g1$ = extractGradeAmount_(normalized, 1);
    const g2$ = extractGradeAmount_(normalized, 2);
    if (g1$ != null || g2$ != null) {
      grossAmount = gsRoundMoney_((g1$ || 0) + (g2$ || 0), 2);
    }
  }
  if (grossAmount == null && columnar.gross_amount != null) {
    grossAmount = columnar.gross_amount;
  }

  let netAmount = extractNetAmount_(normalized);
  if (netAmount == null && columnar.net_amount != null) netAmount = columnar.net_amount;

  let chargesTotal = extractChargesTotal_(normalized, grossAmount, netAmount);

  if (netAmount == null && grossAmount != null && chargesTotal != null) {
    netAmount = gsRoundMoney_(grossAmount - chargesTotal, 2);
  }
  if (chargesTotal == null && grossAmount != null && netAmount != null && grossAmount >= netAmount) {
    chargesTotal = gsRoundMoney_(grossAmount - netAmount, 2);
  }

  if (avgRate == null && grossAmount != null && lbsTotal != null && lbsTotal > 0) {
    avgRate = gsRoundMoney_(grossAmount / lbsTotal, 4);
  }

  const fieldReceipts = extractFieldReceipts_(normalized);

  return {
    statement_date: statementDate,
    pool_number: poolNumber,
    variety: variety,
    period_start: period.start,
    period_end: period.end,
    block_parcel: blockParcel,
    index_block_id: indexBlockId,
    bins_received: binsReceived,
    lbs_grade1: lbsGrade1,
    lbs_grade2: lbsGrade2,
    lbs_culls: lbsCulls,
    lbs_total: lbsTotal,
    avg_rate: avgRate,
    gross_amount: grossAmount,
    charges_total: chargesTotal,
    net_amount: netAmount,
    field_receipts: fieldReceipts,
    field_receipts_text: fieldReceipts.join(' '),
  };
}

/**
 * Bins are usually a small count (e.g. 88.00). Never grab digits from block IDs
 * like GR1532 or 231532HA001 — the old loose regex did that.
 */
function extractBinsReceived_(text) {
  const normalized = String(text || '');

  // Direct on same line: Bins Received: 88.00
  let n = gsNumberOrNull_(gsMatchGroup_(normalized, /Bins\s*Received[:\s]+([\d,]+\.\d{2})/i));
  if (n != null && n > 0 && n < 500) return n;
  n = gsNumberOrNull_(gsMatchGroup_(normalized, /Bins\s*Received[:\s]+([\d,]+\.?\d*)/i));
  if (n != null && n > 0 && n < 500) return n;

  // Most reliable for Index Fresh OCR: number alone after the period line
  // "Jul 09, 2023 TO Jul 15, 2023\n88.00"
  const afterPeriod = normalized.match(
    /(?:TO|to|[-–])\s*[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}\s*\n\s*([\d,]+\.\d{2})\s*(?:\n|$)/
  );
  if (afterPeriod) {
    n = gsNumberOrNull_(afterPeriod[1]);
    if (n != null && n > 0 && n < 500) return n;
  }

  // After "Bins Received", prefer .XX counts; strip block/pool digits first
  const idx = normalized.search(/Bins\s*Received/i);
  if (idx >= 0) {
    let slice = normalized.slice(idx, idx + 500);
    slice = slice
      .replace(/GR\d+/gi, ' ')
      .replace(/\b\d{6}HA\d{3}\b/gi, ' ')
      .replace(/Block\s*I\.?D\.?[:\s]*[A-Z0-9]+/gi, ' ')
      .replace(/Pool\s*#?\s*\d+/gi, ' ')
      .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi, ' ');

    const decimals = slice.match(/[\d,]+\.\d{2}/g) || [];
    for (let i = 0; i < decimals.length; i++) {
      const v = gsNumberOrNull_(decimals[i]);
      if (v != null && v > 0 && v < 500) return v;
    }
  }

  return null;
}

/**
 * Fix common Index Fresh OCR garbling before field extraction.
 * e.g. "I ,065.7" → "1,065.7", "10,871  .22" → "10,871.22", "BLOCK 10:" → "BLOCK ID:"
 */
function normalizeOcrText_(text) {
  let s = String(text || '');
  // Normalize weird spaces / dashes from PDF OCR
  s = s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  s = s.replace(/[\u2010-\u2015\u2212]/g, '-'); // various dashes → hyphen
  // Letter I/l used as digit 1 before decimals/commas
  s = s.replace(/(^|[^\w])[Il]\s*,\s*(\d)/gm, '$11,$2');
  s = s.replace(/(^|[^\s\w])[Il]\s+\.(\d)/gm, '$11.$2');
  s = s.replace(/(^|[^\w])[Il](\d)/gm, '$11$2');
  // OCR digit confusion inside dates: "Jun 2l, 2026" / "Jun l5, 2026"
  s = s.replace(/\b([A-Za-z]{3,9}\.?)\s+(\d{0,2})[Il](\d?)\b/g, function (_, mon, a, b) {
    return mon + ' ' + (a || '') + '1' + (b || '');
  });
  s = s.replace(/\b([A-Za-z]{3,9}\.?)\s+[Il](\d{1,2})\b/g, '$1 1$2');
  // Spaces inside numbers: "10,871  .22" / "2 ,567.53" / "1 .3400"
  s = s.replace(/(\d)\s+,/g, '$1,');
  s = s.replace(/,\s+(\d)/g, ',$1');
  s = s.replace(/(\d)\s+\./g, '$1.');
  s = s.replace(/(\.\d{2})\s+(\d{2})\b/g, '$1'); // rare split cents
  // BLOCK 10: / BLOCK IO: misread of BLOCK ID:
  s = s.replace(/BLOCK\s*(?:10|IO|l0|lD)\s*:/gi, 'BLOCK ID:');
  // Smashed timestamp "Jul 26, 202410:46:21" → insert space before time
  s = s.replace(/(\d{4})(\d{2}:\d{2}:\d{2})/g, '$1 $2');
  // O/0 confusion in money endings: "22,040.lg" → "22,040.19"
  s = s.replace(/(\d),(\d{3})\.l[g9]\b/gi, '$1,$2.19');
  s = s.replace(/(\d)\.l(\d)/gi, '$1.1$2');
  return s;
}
function extractIndexBlockId_(text) {
  const normalized = String(text || '');

  let raw =
    gsMatchGroup_(normalized, /\b(\d{6}HA[0-9O]{3})\b/i) ||
    gsMatchGroup_(normalized, /Block\s*(?:ID|I\.?D\.?|10|IO|lD|l0)\s*[:\s]*([A-Z0-9 O]{8,14})/i) ||
    gsMatchGroup_(normalized, /BLOCK\s*(?:ID|10|IO)\s*[:\s]*([A-Z0-9 O]{8,14})/i);

  if (!raw) return null;

  let cleaned = String(raw).replace(/\s+/g, '').toUpperCase();
  cleaned = cleaned.replace(/O/g, '0');
  const m = cleaned.match(/(\d{6}HA\d{3})/);
  return m ? m[1] : cleaned;
}

/**
 * 2024 scanned statements OCR as column dumps:
 *   POUNDS\n6.2\n...\n18844.0\n...\n3478.0\n819.0\n23141.0
 *   AMOUNTS\n12.44\n...\n34354.77\n(charges)\n28823.72
 */
function extractColumnarTotals_(text) {
  const normalized = String(text || '');
  const out = {
    lbs_grade1: null,
    lbs_grade2: null,
    lbs_culls: null,
    lbs_total: null,
    gross_amount: null,
    net_amount: null,
    grade1_amount: null,
    grade2_amount: null,
  };

  // Take everything from POUNDS header until PERCENT/RATE/AMOUNTS (BLOCK may sit in between)
  const poundsBlock = gsMatchGroup_(
    normalized,
    /(?:^|\n)\s*POUNDS\s*\n([\s\S]*?)(?=(?:^|\n)\s*PERCENT|(?:^|\n)\s*RATE|(?:^|\n)\s*AMOUNTS)/i
  );
  if (poundsBlock) {
    const lbsSeq = [];
    const moneyInPounds = [];
    const re = /[\d,]+\.\d+/g;
    let m;
    while ((m = re.exec(poundsBlock)) !== null) {
      const n = gsMoneyOrNull_(m[0]);
      if (n == null) continue;
      const d = (m[0].split('.')[1] || '').length;
      if (d === 1) lbsSeq.push(n);
      if (d === 2 && n > 1000) moneyInPounds.push(n);
    }

    if (lbsSeq.length >= 12) {
      // Drop trailing HAB-net-pounds if present after grand total (e.g. 22322 after 23141)
      const totals = findGradeTotalsFromLbsSequence_(lbsSeq);
      if (totals) {
        out.lbs_grade1 = totals.g1;
        out.lbs_grade2 = totals.g2;
        out.lbs_culls = totals.culls;
        out.lbs_total = totals.total;
      }
    }
    if (moneyInPounds.length) {
      out.gross_amount = moneyInPounds[0];
    }
  }

  const amountsBlock = gsMatchGroup_(
    normalized,
    /(?:^|\n)\s*AMOUNTS\s*\n([\s\S]*?)(?=Field\s*Receipts|Page\s+\d+\s+of|\Z)/i
  );
  if (amountsBlock) {
    // Net = first large bare amount AFTER the last charge parenthesis
    const lastParen = amountsBlock.lastIndexOf('(');
    if (lastParen >= 0) {
      const afterCharges = amountsBlock.slice(lastParen);
      const afterNet = afterCharges.match(/\)\s*([\d,]+\.\d{2})/);
      if (afterNet) {
        const n = gsMoneyOrNull_(afterNet[1]);
        if (n != null && n > 500) out.net_amount = n;
      }
    }

    const money = [];
    const moneyRe = /[\d,]+\.\d{2}/g;
    let mm;
    while ((mm = moneyRe.exec(amountsBlock)) !== null) {
      const n = gsMoneyOrNull_(mm[0]);
      if (n != null) money.push(n);
    }
    const parens = {};
    const parenRe = /\(\s*([\d,]+\.\d{2})\s*\)/g;
    let pm;
    while ((pm = parenRe.exec(amountsBlock)) !== null) {
      parens[String(gsMoneyOrNull_(pm[1]))] = true;
    }

    // Gross = largest non-paren amount (Total Returns $)
    let max = null;
    for (let i = 0; i < money.length; i++) {
      if (money[i] > 1000 && !parens[String(money[i])]) {
        if (max == null || money[i] > max) max = money[i];
      }
    }
    if (max != null) {
      if (out.gross_amount == null || max > out.gross_amount) out.gross_amount = max;
    }

    // If net still missing, last large non-paren that isn't gross
    if (out.net_amount == null) {
      for (let i = money.length - 1; i >= 0; i--) {
        if (money[i] > 1000 && !parens[String(money[i])] && money[i] !== out.gross_amount) {
          out.net_amount = money[i];
          break;
        }
      }
    }
  }

  // Net often sits inside Field Receipts list on columnar OCR (35a style)
  if (out.net_amount == null || (out.gross_amount != null && out.net_amount > out.gross_amount)) {
    const receiptSection =
      gsMatchGroup_(normalized, /Field\s*Receipts?[:\s]*([\s\S]{0,500}?)(?:Page\s+\d|$)/i) || '';
    const receiptMoney = receiptSection.match(/[\d,]+\.\d{2}/g) || [];
    let best = null;
    for (let i = 0; i < receiptMoney.length; i++) {
      const n = gsMoneyOrNull_(receiptMoney[i]);
      if (n != null && n > 1000 && (best == null || n > best)) best = n;
    }
    if (best != null) {
      if (out.gross_amount == null || best < out.gross_amount) out.net_amount = best;
    }
  }

  return out;
}

function findGradeTotalsFromLbsSequence_(lbsSeq) {
  for (let n1 = 8; n1 <= 10; n1++) {
    if (lbsSeq.length < n1 + 2) continue;
    const sizes1 = lbsSeq.slice(0, n1);
    const t1 = lbsSeq[n1];
    if (Math.abs(sumArr_(sizes1) - t1) > Math.max(2, t1 * 0.02)) continue;

    for (let n2 = 8; n2 <= 10; n2++) {
      const start2 = n1 + 1;
      if (lbsSeq.length < start2 + n2 + 2) continue;
      const sizes2 = lbsSeq.slice(start2, start2 + n2);
      const t2 = lbsSeq[start2 + n2];
      if (Math.abs(sumArr_(sizes2) - t2) > Math.max(2, t2 * 0.02)) continue;

      let idx = start2 + n2 + 1;
      let culls = null;
      if (idx < lbsSeq.length) {
        culls = lbsSeq[idx];
        if (idx + 1 < lbsSeq.length && Math.abs(lbsSeq[idx + 1] - culls) < 0.15) idx++;
        idx++;
      }
      let total = idx < lbsSeq.length ? lbsSeq[idx] : null;
      const expected = t1 + t2 + (culls || 0);
      if (total != null && Math.abs(total - expected) > Math.max(3, expected * 0.03)) {
        total = lbsSeq[start2 + n2 + 1];
        culls = Math.max(0, gsRoundMoney_(total - t1 - t2, 1));
      }
      if (total == null) total = gsRoundMoney_(expected, 1);

      return { g1: t1, g2: t2, culls: culls, total: total };
    }
  }

  // Fallback when size rows are OCR-garbled: find g1+g2+culls=total among large values
  return findGradeTotalsBySumIdentity_(lbsSeq);
}

/**
 * When individual size rows are corrupted, recover totals from values where
 * grade1 + grade2 + culls ≈ total (in appearance order). Pick the closest fit.
 */
function findGradeTotalsBySumIdentity_(lbsSeq) {
  const idxs = [];
  for (let i = 0; i < lbsSeq.length; i++) {
    if (lbsSeq[i] >= 400) idxs.push(i);
  }
  let best = null;
  let bestErr = 999999;
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      for (let c = b + 1; c < idxs.length; c++) {
        for (let d = c + 1; d < idxs.length; d++) {
          const g1 = lbsSeq[idxs[a]];
          const g2 = lbsSeq[idxs[b]];
          const culls = lbsSeq[idxs[c]];
          const total = lbsSeq[idxs[d]];
          if (g1 < g2) continue;
          const err = Math.abs(g1 + g2 + culls - total);
          if (err < bestErr && err <= 5) {
            bestErr = err;
            best = { g1: g1, g2: g2, culls: culls, total: total };
          }
        }
      }
    }
  }
  if (best) return best;

  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      for (let d = b + 1; d < idxs.length; d++) {
        const g1 = lbsSeq[idxs[a]];
        const g2 = lbsSeq[idxs[b]];
        const total = lbsSeq[idxs[d]];
        if (g1 < g2) continue;
        const err = Math.abs(g1 + g2 - total);
        if (err <= 5) return { g1: g1, g2: g2, culls: 0, total: total };
      }
    }
  }
  return null;
}

function sumArr_(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function extractPeriodDates_(text) {
  const raw = String(text || '');
  const rangeJoin = '(?:TO|to|To|t0|thru|through|until|[-–—]|\\s+to\\s+)';

  // English: "Jun 21, 2026 TO Jun 27, 2026" (ordinals ok: 21st)
  let m = raw.match(
    new RegExp(
      '([A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})\\s*' +
        rangeJoin +
        '\\s*([A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})',
      'i'
    )
  );
  if (m) {
    return { start: parseEnglishDate_(m[1]), end: parseEnglishDate_(m[2]) };
  }

  // Slash: "6/21/2026 - 6/27/2026" or "06-21-26 TO 06-27-26"
  m = raw.match(
    new RegExp(
      '(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})\\s*' + rangeJoin + '\\s*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})',
      'i'
    )
  );
  if (m) {
    return { start: parseSlashDate_(m[1]), end: parseSlashDate_(m[2]) };
  }

  // ISO: "2026-06-21 to 2026-06-27"
  m = raw.match(
    new RegExp(
      '(\\d{4}-\\d{2}-\\d{2})\\s*' + rangeJoin + '\\s*(\\d{4}-\\d{2}-\\d{2})',
      'i'
    )
  );
  if (m) {
    return { start: m[1], end: m[2] };
  }

  // Labeled: "Period Start: Jun 21, 2026" … "Period End: Jun 27, 2026"
  const startLabeled =
    gsMatchGroup_(raw, /(?:Period\s*Start|Start\s*Date|From|Dates?(?:\s+of\s+Delivery)?)\s*[:\s]+([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i) ||
    gsMatchGroup_(raw, /(?:Period\s*Start|Start\s*Date|From)\s*[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
    gsMatchGroup_(raw, /(?:Period\s*Start|Start\s*Date|From)\s*[:\s]+(\d{4}-\d{2}-\d{2})/i);
  const endLabeled =
    gsMatchGroup_(raw, /(?:Period\s*End|End\s*Date|Through|Until)\s*[:\s]+([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i) ||
    gsMatchGroup_(raw, /(?:Period\s*End|End\s*Date|Through|Until)\s*[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
    gsMatchGroup_(raw, /(?:Period\s*End|End\s*Date|Through|Until)\s*[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (startLabeled || endLabeled) {
    return {
      start: normalizeIsoDate_(startLabeled),
      end: normalizeIsoDate_(endLabeled),
    };
  }

  return { start: null, end: null };
}

function extractStatementDate_(text) {
  const raw = String(text || '');
  const m =
    gsMatchGroup_(raw, /(?:Statement\s*Date|Dated?|Date\s*Printed|Print(?:ed)?\s*Date)\s*[:\s]*([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i) ||
    gsMatchGroup_(raw, /(?:Statement\s*Date|Dated?|Date\s*Printed|Print(?:ed)?\s*Date)\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
    gsMatchGroup_(raw, /(?:Statement\s*Date|Dated?|Date\s*Printed|Print(?:ed)?\s*Date)\s*[:\s]*(\d{4}-\d{2}-\d{2})/i) ||
    gsMatchGroup_(raw, /\b([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})\b/);
  return m ? normalizeIsoDate_(m) : null;
}

function extractStatementBlock_(text, indexBlockId) {
  // Always scan the full OCR/raw text for a ranch name from the set list.
  // Grower codes (GR1532, SB FARM GR…) are never returned as the block.
  return gsFindRanchBlockInText_(text);
}

/**
 * Walk the entire statement text until a known ranch block name appears.
 * Strips GR#### / index IDs first so they cannot be mistaken for blocks.
 */
function gsFindRanchBlockInText_(text) {
  const normalized = String(text || '');
  if (!normalized.trim()) return null;

  const cleaned = normalized
    .replace(/\b(?:SB\s*FARM\s+)?GR\d+\b/gi, ' ')
    .replace(/\b\d{6}HA\d{3}\b/gi, ' ')
    .replace(/\bBLOCK\s*I\.?D\.?\b/gi, ' ');

  const compact = cleaned.toUpperCase().replace(/[^A-Z0-9]+/g, '');

  // Longest known name / alias first (Los Osos before Osos, etc.)
  const candidates = [];
  const seenKey = {};
  for (let i = 0; i < GS_KNOWN_BLOCKS.length; i++) {
    const name = GS_KNOWN_BLOCKS[i];
    const key = gsNormalizeBlockKey_(name);
    if (!key || seenKey[key]) continue;
    seenKey[key] = true;
    candidates.push({ key: key, name: name });
  }
  const aliasKeys = Object.keys(GS_BLOCK_ALIASES);
  for (let i = 0; i < aliasKeys.length; i++) {
    const key = aliasKeys[i];
    if (!key || seenKey[key]) continue;
    seenKey[key] = true;
    candidates.push({ key: key, name: GS_BLOCK_ALIASES[key] });
  }
  candidates.sort(function (a, b) {
    return b.key.length - a.key.length;
  });

  // 1) Compact OCR string (handles missing spaces: "LOSOSOS", "GATOMONTEZ")
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].key.length < 4) continue;
    if (compact.indexOf(candidates[i].key) >= 0) return candidates[i].name;
  }

  // 2) Spaced / OCR-split names in raw text ("El  Puma", "La-Casa", "Los Osos")
  for (let i = 0; i < GS_KNOWN_BLOCKS.length; i++) {
    const name = GS_KNOWN_BLOCKS[i];
    const parts = name.split(/\s+/);
    const pattern = parts
      .map(function (p) {
        return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('[\\s\\-_./]*');
    if (new RegExp('(?:^|[^A-Za-z])' + pattern + '(?:[^A-Za-z]|$)', 'i').test(cleaned)) {
      return name;
    }
  }

  // 3) Line-by-line fuzzy (OCR typos like Godornicez → Codornices)
  const lines = cleaned.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 4) continue;
    if (/^SB\s*FARM$/i.test(line)) continue;
    const matched = gsFuzzyMatchBlock_(line);
    if (matched) return matched;
  }

  // 4) Sliding tokens across the whole cleaned string
  const tokens = cleaned.match(/[A-Za-z][A-Za-z0-9' .-]{2,40}/g) || [];
  for (let i = 0; i < tokens.length; i++) {
    const matched = gsFuzzyMatchBlock_(tokens[i]);
    if (matched) return matched;
    if (i + 1 < tokens.length) {
      const two = gsFuzzyMatchBlock_(tokens[i] + ' ' + tokens[i + 1]);
      if (two) return two;
    }
  }

  return null;
}

/** @deprecated use gsFindRanchBlockInText_ */
function gsFuzzyMatchBlockFromText_(text) {
  return gsFindRanchBlockInText_(text);
}

/** If Grade #2 is missing: lbs_total − lbs_grade1 − lbs_culls. */
function deriveGrade2Lbs_(lbsGrade2, lbsTotal, lbsGrade1, lbsCulls) {
  if (lbsGrade2 != null && lbsGrade2 > 0) return lbsGrade2;
  if (lbsTotal == null || lbsGrade1 == null) return lbsGrade2;
  const culls = lbsCulls != null ? lbsCulls : 0;
  const derived = gsRoundMoney_(lbsTotal - lbsGrade1 - culls, 1);
  if (derived > 0) return derived;
  return lbsGrade2;
}

function extractGradeLbs_(text, gradeKey) {
  const section = extractGradeSection_(text, gradeKey);
  if (section) {
    const fromSection = extractPoundsFromGradeSection_(section, gradeKey);
    if (fromSection != null) return fromSection;
  }

  const bounds = gradeSectionBounds_(text, gradeKey);
  if (bounds) {
    const fromBounds = extractPoundsFromGradeSection_(
      String(text || '').slice(bounds.start, bounds.end),
      gradeKey
    );
    if (fromBounds != null) return fromBounds;
  }

  // Fallback when "Grade #2" header is missing/garbled in OCR:
  // summary totals between Grade #1 and Culls, largest → #1, second → #2
  if (gradeKey === 1 || gradeKey === 2) {
    const ranked = rankGradeSummaryTotals_(text);
    if (gradeKey === 1 && ranked.length >= 1) return ranked[0];
    if (gradeKey === 2 && ranked.length >= 2) return ranked[1];
  }
  return null;
}

/**
 * Collect summary-row pound totals from Grade #1 through Culls, largest first.
 */
function rankGradeSummaryTotals_(text) {
  const normalized = String(text || '');
  const startMatch = normalized.match(/Grade[\s\S]{0,80}(?:AMOUNTS?\s*)?[#:]?\s*1\b|AMOUNTS?\s*#\s*1\b/i);
  if (!startMatch) return [];
  const start = startMatch.index;
  const after = normalized.slice(start);
  const cullsAt = after.search(/\bCulls?\b|Total\s+Returns/i);
  const block = cullsAt >= 0 ? after.slice(0, cullsAt) : after.slice(0, 2500);

  const lines = block.split('\n');
  const found = [];
  const seen = {};
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || /Returns/i.test(line)) continue;
    if (/\bTota[l1]\b/i.test(line) && !/\d/.test(line) && i + 1 < lines.length) {
      line = line + ' ' + lines[i + 1].trim();
    }
    if (isSizeDetailLine_(line)) continue;
    if (!/\bTota[l1]\b/i.test(line) && !isSummaryStyleLine_(line)) continue;
    const lbs = linePoundCandidate_(line);
    if (lbs == null || lbs < 40) continue;
    const key = String(Math.round(lbs * 10));
    if (seen[key]) continue;
    seen[key] = true;
    found.push(lbs);
  }
  found.sort(function (a, b) {
    return b - a;
  });
  return found;
}

/**
 * Grade total = largest pound figure in the section that is NOT a size detail row.
 * Works even when OCR drops the word "Total".
 */
function extractPoundsFromGradeSection_(section, gradeKey) {
  if (!section) return null;

  const rawLines = String(section).split('\n');
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (!line) continue;
    if (/\bTota[l1]\b/i.test(line) && !/\d/.test(line) && i + 1 < rawLines.length) {
      line = line + ' ' + rawLines[i + 1].trim();
      i++;
    }
    lines.push(line);
  }

  let best = null;
  let bestFromSummary = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Returns/i.test(line)) continue;
    if (isSizeDetailLine_(line)) continue;

    const lbs = linePoundCandidate_(line);
    if (lbs == null) continue;

    const isSummary = /\bTota[l1]\b/i.test(line) || isSummaryStyleLine_(line);
    if (isSummary) {
      if (bestFromSummary == null || lbs > bestFromSummary) bestFromSummary = lbs;
    }
    if (best == null || lbs > best) best = lbs;
  }

  if (bestFromSummary != null) return bestFromSummary;
  if (best != null) return best;

  // Last resort: largest 1-decimal in section (grade #2 totals can be just above 100)
  const minLbs = gradeKey === 2 || gradeKey === 'culls' ? 40 : 100;
  const all = String(section).match(/[\d,]+\.\d/g) || [];
  let maxAll = null;
  for (let i = 0; i < all.length; i++) {
    const n = gsMoneyOrNull_(all[i]);
    if (n == null || n < minLbs) continue;
    if (maxAll == null || n > maxAll) maxAll = n;
  }
  return maxAll;
}

/** Size rows start with pack size codes — ignore these for grade totals. */
function isSizeDetailLine_(line) {
  const s = String(line || '').trim();
  if (/\bTota[l1]\b/i.test(s)) return false;
  if (/^(PW|28|32|36|40|48|60|70|84|96)\b/i.test(s)) return true;
  if (/^\d{2}\s+[\d,]+\.\d/.test(s)) return true;
  return false;
}

/** Summary rows usually have lbs + percent (+ rate/amount), not a leading size code. */
function isSummaryStyleLine_(line) {
  const tokens = String(line).match(/[\d,]+\.\d+/g) || [];
  if (tokens.length < 2) return false;
  let hasPct = false;
  let hasMoney = false;
  let hasLbs = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const n = gsMoneyOrNull_(t);
    if (n == null) continue;
    const d = (t.split('.')[1] || '').length;
    if (d === 1 && n > 40) hasLbs = true;
    if (d === 1 && n <= 100.05) hasPct = true;
    if (d === 2 && n > 20) hasMoney = true;
    // lbs sometimes OCR'd with 2 decimals (1287.20)
    if (d === 2 && n > 100 && i === 0) hasLbs = true;
  }
  return hasLbs && (hasPct || hasMoney || /\bTota[l1]\b/i.test(line));
}

function linePoundCandidate_(line) {
  const raw = String(line || '');
  const tokens = [];
  const tokenRe = /[\d,]+\.\d+/g;
  let m;
  while ((m = tokenRe.exec(raw)) !== null) {
    tokens.push(m[0]);
  }

  const oneDec = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const n = gsMoneyOrNull_(t);
    if (n == null) continue;
    const d = (t.split('.')[1] || '').length;
    if (d === 1 && n >= 10) oneDec.push(n);
  }
  if (oneDec.length) {
    let best = oneDec[0];
    for (let i = 1; i < oneDec.length; i++) {
      if (oneDec[i] > best) best = oneDec[i];
    }
    return best;
  }

  // All 2-decimal OCR: treat first large token as lbs, last as $ amount
  if (tokens.length >= 2) {
    const first = gsMoneyOrNull_(tokens[0]);
    const last = gsMoneyOrNull_(tokens[tokens.length - 1]);
    if (first != null && first >= 40 && last != null && last !== first) {
      const firstD = (tokens[0].split('.')[1] || '').length;
      if (firstD === 2 && first > 100) return first;
    }
  }

  if (/\bTota[l1]\b/i.test(raw)) {
    const ints = raw.replace(/^[\s\S]*?\bTota[l1]\b/i, '').match(/\b(\d{3,6})\b/g) || [];
    for (let i = 0; i < ints.length; i++) {
      const n = gsMoneyOrNull_(ints[i]);
      if (n != null && n >= 40) return n;
    }
  }
  return null;
}

function pickPoundsFromTotalLine_(line) {
  return linePoundCandidate_(line);
}

function pickPoundsFromSummaryLine_(line) {
  return linePoundCandidate_(line);
}

/** Start/end indices for a grade block. Allows "Grade" and "#2" on separate OCR lines. */
function gradeSectionBounds_(text, gradeKey) {
  const normalized = String(text || '');
  let startRe;
  let endRe;
  if (gradeKey === 1) {
    // OCR often: "GRADE SIZE POUNDS PERCENT RATE AMOUNTS #1"
    startRe = /Grade[\s\S]{0,80}(?:AMOUNTS?\s*)?[#:]?\s*1\b|AMOUNTS?\s*#\s*1\b/i;
    endRe = /(?:^|\n)\s*#\s*2\b|Grade[\s\S]{0,20}[#:]?\s*2\b|Culls?\b|Total\s+Returns/i;
  } else if (gradeKey === 2) {
    // Standalone "#2" line is common after Grade #1 totals
    startRe = /(?:^|\n)\s*#\s*2\b|Grade[\s\S]{0,20}#[\s:]*2\b|Grade\s*2\b|AMOUNTS?\s*#\s*2\b/i;
    endRe = /Culls?\b|Total\s+Returns/i;
  } else {
    startRe = /\bCulls?\b/i;
    // Stop before Total Returns — never let culls inherit total lbs
    endRe = /Total\s+Returns|CAC\s+(?:Percentage|Rate)|HAB\s+Rate|Charges\b/i;
  }

  const startMatch = normalized.match(startRe);
  if (!startMatch) return null;
  const start = startMatch.index;
  const after = normalized.slice(start + startMatch[0].length);
  const endMatch = after.match(endRe);
  const end = endMatch ? start + startMatch[0].length + endMatch.index : normalized.length;
  return { start: start, end: end };
}

function extractGradeAmount_(text, gradeKey) {
  const section = extractGradeSection_(text, gradeKey);
  if (!section) return null;
  const lines = section.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^Total\b/i.test(lines[i]) || /Returns/i.test(lines[i])) continue;
    const parsed = parseIndexFreshSummaryRow_(lines[i]);
    if (parsed.amount != null && parsed.amount > 50) return parsed.amount;
  }
  return gsMoneyOrNull_(gsMatchGroup_(section, /\$\s*([\d,]+\.\d{2})/));
}

/** Slice text for Grade #1, Grade #2, or Culls until the next section. */
function extractGradeSection_(text, gradeKey) {
  const bounds = gradeSectionBounds_(text, gradeKey);
  if (!bounds) return null;
  return String(text || '').slice(bounds.start, bounds.end);
}

/**
 * Index Fresh summary rows: lbs · percent · rate · amount
 * e.g. 79345.3  96.7%  1.1124  88266.36
 * Prefer 1-decimal tokens as pounds; 2-decimal large tokens as $.
 */
function parseIndexFreshSummaryRow_(line) {
  const raw = String(line || '');
  const dollarAmt = gsMoneyOrNull_(gsMatchGroup_(raw, /\$\s*([\d,]+\.\d{2})/));

  const tokens = [];
  const re = /[\d,]+\.\d+/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const n = gsMoneyOrNull_(m[0]);
    if (n == null) continue;
    tokens.push({ raw: m[0], n: n, decimals: (m[0].split('.')[1] || '').length });
  }

  let lbs = null;
  let percent = null;
  let rate = null;
  let amount = dollarAmt;

  // lbs = first 1-decimal number > 20 (Index Fresh pounds almost always X.Y)
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].decimals === 1 && tokens[i].n >= 20 && tokens[i].n !== 100) {
      lbs = tokens[i].n;
      break;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (lbs != null && t.n === lbs) continue;
    if (t.decimals === 1 && t.n >= 0 && t.n <= 100.05 && percent == null) {
      percent = t.n;
      continue;
    }
    if (t.n > 0.05 && t.n < 8 && rate == null && t.n !== percent) {
      rate = t.n;
      continue;
    }
    // $ amount: 2-decimal and larger than typical lbs confusion
    if (amount == null && t.decimals === 2 && t.n > 100 && t.n !== lbs) {
      amount = t.n;
    }
  }

  // Fallback if OCR lost the 1-decimal lbs style
  if (lbs == null) {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].n >= 20 && tokens[i].n !== 100) {
        lbs = tokens[i].n;
        break;
      }
    }
  }

  if (amount == null && tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    if (last.n > 100 && last.n !== lbs && last.n !== 100) amount = last.n;
  }

  // If lbs and amount got swapped (lbs has 2 decimals and is "money-like", amount has 1)
  if (lbs != null && amount != null && lbs > amount && String(lbs).indexOf('.') > 0) {
    // keep as-is unless amount looks like pounds (1 decimal) and lbs like money
  }

  return { lbs: lbs, percent: percent, rate: rate, amount: amount };
}

function extractTotalReturns_(text) {
  const normalized = String(text || '');
  const idx = normalized.search(/Total\s+Returns/i);
  if (idx < 0) return { lbs: null, rate: null, amount: null };

  // Prefer the same line / next few tokens after the label
  const afterLabel = normalized.slice(idx).replace(/^[\s\S]*?Total\s+Returns[:\s]*/i, '');
  const line = afterLabel.split('\n')[0];
  const block = (line + ' ' + afterLabel.split('\n').slice(1, 3).join(' ')).slice(0, 220);

  const parsed = parseIndexFreshSummaryRow_(block);
  let lbs = parsed.lbs;
  let rate = parsed.rate;
  let amount = parsed.amount;

  // Explicit: first 1-decimal after label is pounds (82,055.0)
  const firstOneDec = afterLabel.match(/([\d,]+\.\d)\b/);
  if (firstOneDec) {
    const n = gsMoneyOrNull_(firstOneDec[1]);
    if (n != null && n > 100) lbs = n;
  }

  // Explicit: first 2-decimal money after rate/percent is gross (89,330.40)
  if (amount == null || amount <= 100.5) {
    const twoDec = afterLabel.match(/([\d,]+\.\d{2})\b/g) || [];
    for (let i = 0; i < twoDec.length; i++) {
      const a = gsMoneyOrNull_(twoDec[i]);
      if (a != null && a > 100 && a !== lbs) {
        amount = a;
        break;
      }
    }
  }

  if (amount != null && amount <= 100.5) amount = null;
  if (rate != null && (rate < 0.05 || rate > 10)) rate = null;
  // Don't let money masquerade as lbs
  if (lbs != null && amount != null && Math.abs(lbs - amount) < 0.05) {
    amount = null;
  }

  return { lbs: lbs, rate: rate, amount: amount };
}

function extractNetAmount_(text) {
  const normalized = String(text || '');

  let net =
    gsMoneyOrNull_(gsMatchGroup_(normalized, /Net\s+Total[^\d$]{0,20}\$?\s*([\d,]+\.\d{2})/i)) ||
    gsMoneyOrNull_(gsMatchGroup_(normalized, /Final\s+Net[^\d$]{0,20}\$?\s*([\d,]+\.\d{2})/i)) ||
    gsMoneyOrNull_(gsMatchGroup_(normalized, /Net\s+Amount[^\d$]{0,20}\$?\s*([\d,]+\.\d{2})/i)) ||
    gsMoneyOrNull_(gsMatchGroup_(normalized, /Net\s+Totai[^\d$]{0,20}\$?\s*([\d,]+\.\d{2})/i));

  if (net != null && net > 50) return net;

  const m = normalized.match(/Net\s+Total\s*\n\s*\$?\s*([\d,]+\.?\d*)/i);
  if (m) {
    net = gsMoneyOrNull_(m[1]);
    if (net != null && net > 50) return net;
  }

  net = gsMoneyOrNull_(gsMatchGroup_(normalized, /Net\s+Total[^\d$]{0,20}\$?\s*([\d,]+\.?\d*)/i));
  if (net != null && net > 500) return net;

  // Index Fresh often prints bare net after Harvesting Advance, before Field Receipts:
  // "Harvesting Advance (15,400.00)\n70,577.13\nField Receipts:"
  const afterAdvance = normalized.match(
    /Harvesting\s+Advance\s*\(\s*[\d,]+\.\d{2}\s*\)\s*([\d,]+\.\d{2})/i
  );
  if (afterAdvance) {
    net = gsMoneyOrNull_(afterAdvance[1]);
    if (net != null && net > 100) return net;
  }

  const beforeReceipts = normalized.match(
    /([\d,]+\.\d{2})\s*(?:\n|\r)+\s*Field\s*Receipts/i
  );
  if (beforeReceipts) {
    net = gsMoneyOrNull_(beforeReceipts[1]);
    if (net != null && net > 100) return net;
  }

  const chargeIdx = normalized.search(/Harvesting\s+Advance|HAB\s+Rate|CAC\s+(?:Percentage|Rate)/i);
  if (chargeIdx >= 0) {
    const tail = normalized.slice(chargeIdx);
    const paren = {};
    const parenRe = /\(\s*\$?\s*([\d,]+\.\d{2})\s*\)/g;
    let pm;
    while ((pm = parenRe.exec(tail)) !== null) {
      paren[String(gsMoneyOrNull_(pm[1]))] = true;
    }
    // Prefer bare .xx line that isn't a parenthetical charge
    const bare = tail.match(/(?:^|\n)\s*([\d,]+\.\d{2})\s*(?:\n|$)/);
    if (bare) {
      const a = gsMoneyOrNull_(bare[1]);
      if (a != null && a > 100 && !paren[String(a)]) return a;
    }
    const moneyRe = /\$\s*([\d,]+\.\d{2})/g;
    let best = null;
    let mm;
    while ((mm = moneyRe.exec(tail)) !== null) {
      const a = gsMoneyOrNull_(mm[1]);
      if (a == null || a < 100) continue;
      if (paren[String(a)]) continue;
      if (best == null || a > best) best = a;
    }
    if (best != null) return best;
  }

  return null;
}

function extractChargesTotal_(text, gross, net) {
  const normalized = String(text || '');
  let sum = 0;
  let found = 0;

  const chargeBlockMatch = normalized.match(
    /(?:CAC|HAB|Harvesting\s+Advance|Charges)[\s\S]{0,900}?(?=Field\s*Receipts|Net\s+Total|Timestamp|Page\s+\d|$)/i
  );
  const chargeBlock = chargeBlockMatch ? chargeBlockMatch[0] : normalized;

  const parenRe = /\(\s*\$?\s*([\d,]+\.\d{2})\s*\)/g;
  let m;
  while ((m = parenRe.exec(chargeBlock)) !== null) {
    const amt = gsMoneyOrNull_(m[1]);
    if (amt == null || amt < 0.5) continue;
    sum += amt;
    found++;
  }

  if (!found) {
    const named = chargeBlock.match(
      /(?:CAC|HAB(?!\s+Refund)|Harvesting\s+Advance)[^\n]{0,80}?([\d,]+\.\d{2})/gi
    );
    if (named) {
      for (let i = 0; i < named.length; i++) {
        if (/Refund/i.test(named[i])) continue;
        const amt = gsMoneyOrNull_(gsMatchGroup_(named[i], /([\d,]+\.\d{2})\s*$/));
        if (amt != null && amt >= 1) {
          sum += amt;
          found++;
        }
      }
    }
  }

  const refund = gsMoneyOrNull_(
    gsMatchGroup_(normalized, /HAB\s+Refund[^\d$]{0,40}\$?\s*([\d,]+\.\d{2})/i)
  );
  if (refund != null) sum = Math.max(0, sum - refund);

  if (found > 0) return gsRoundMoney_(sum, 2);

  if (gross != null && net != null && gross > net) {
    return gsRoundMoney_(gross - net, 2);
  }
  return null;
}

function extractFieldReceipts_(text) {
  const section =
    gsMatchGroup_(text, /Field\s*Receipts?[:\s]*([\s\S]{0,400}?)(?:Timestamp|Page\s+\d|GROWER\s+STATEMENT|$)/i) ||
    gsMatchGroup_(text, /Field\s*Receipts?[:\s]*([^\n]+(?:\n[^\n]+){0,8})/i) ||
    '';

  // Drop timestamp lines so "Jul 26, 202410:46:21" doesn't yield receipt 202410
  const cleaned = String(section).replace(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\d{0,2}:?\d{0,2}:?\d{0,2}/gi,
    ' '
  );

  const nums = cleaned.match(/\b\d{5,6}\b/g) || [];
  const out = [];
  const seen = {};
  for (let i = 0; i < nums.length; i++) {
    let padded = nums[i];
    if (padded.length === 5) padded = '0' + padded;
    if (seen[padded]) continue;
    if (/^20\d{2}$/.test(padded)) continue; // year
    if (/^20\d{4}$/.test(padded)) continue; // YYYYMM from smashed timestamp
    if (/^42941$/.test(padded)) continue;
    seen[padded] = true;
    out.push(padded);
  }
  return out;
}

function buildStatementFromReview_(data) {
  data = data || {};
  // Ranch name only — never keep grower codes (GR1532) as block_parcel
  const block = resolveRanchBlock_(data.block_parcel || data.block);

  const fieldReceipts = parseFieldReceiptList_(
    data.field_receipts_text != null
      ? data.field_receipts_text
      : Array.isArray(data.field_receipts)
        ? data.field_receipts.join(' ')
        : data.field_receipts
  );

  const bins = gsNumOrNull_(data.bins_received);
  const lbsTotal = gsNumOrNull_(data.lbs_total);
  const lbsGrade1 = gsNumOrNull_(data.lbs_grade1);
  let lbsGrade2 = gsNumOrNull_(data.lbs_grade2);
  const lbsCulls = gsNumOrNull_(data.lbs_culls);
  lbsGrade2 = deriveGrade2Lbs_(lbsGrade2, lbsTotal, lbsGrade1, lbsCulls);
  const gross = gsNumOrNull_(data.gross_amount);
  const net = gsNumOrNull_(data.net_amount);
  let charges = gsNumOrNull_(data.charges_total);
  if (charges == null && gross != null && net != null && gross >= net) {
    charges = gsRoundMoney_(gross - net, 2);
  }

  return {
    statement_date: normalizeIsoDate_(data.statement_date) || data.statement_date || null,
    pool_number: gsNumOrNull_(data.pool_number),
    variety: String(data.variety || 'Hass').trim() || 'Hass',
    period_start: normalizeIsoDate_(data.period_start) || data.period_start || null,
    period_end: normalizeIsoDate_(data.period_end) || data.period_end || null,
    block_parcel: block,
    index_block_id: String(data.index_block_id || '').trim() || null,
    bins_received: bins,
    lbs_grade1: lbsGrade1,
    lbs_grade2: lbsGrade2,
    lbs_culls: lbsCulls,
    lbs_total: lbsTotal,
    gross_amount: gross,
    charges_total: charges,
    net_amount: net,
    field_receipts: fieldReceipts,
    notes: String(data.notes || '').trim() || null,
    confidence: 'ocr_reviewed',
  };
}

/**
 * Map free text / OCR to a ranch block name from GS_KNOWN_BLOCKS.
 * Rejects Index Fresh grower codes (GR1532, SB FARM GR…).
 */
function resolveRanchBlock_(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/\bGR\d+/i.test(s) || /^SB\s*FARM\b/i.test(s)) return null;
  if (/^\d{6}HA\d{3}$/i.test(s.replace(/\s+/g, ''))) return null;
  for (let i = 0; i < GS_KNOWN_BLOCKS.length; i++) {
    if (GS_KNOWN_BLOCKS[i].toLowerCase() === s.toLowerCase()) return GS_KNOWN_BLOCKS[i];
  }
  return gsFuzzyMatchBlock_(s);
}

/** Exposed to the upload form for the block dropdown. */
function getKnownBlocks() {
  return GS_KNOWN_BLOCKS.slice();
}

function parseFieldReceiptList_(raw) {
  const parts = String(raw || '').split(/[^0-9]+/);
  const out = [];
  const seen = {};
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i].trim();
    if (!/^\d{5,6}$/.test(p)) continue;
    if (p.length === 5) p = '0' + p;
    if (seen[p]) continue;
    seen[p] = true;
    out.push(p);
  }
  return out;
}

function writeStatementData_(spreadsheetId, extracted, fileId, fileUrl) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  gsEnsureSheet_(ss, SHEET_STATEMENTS, STATEMENT_HEADERS);
  gsEnsureSheet_(ss, SHEET_STATEMENT_RECEIPTS, STATEMENT_RECEIPT_HEADERS);

  const stmtSheet = ss.getSheetByName(SHEET_STATEMENTS);
  const now = new Date();
  const row = [
    now,
    gsSheetDate_(extracted.statement_date),
    extracted.pool_number,
    extracted.variety,
    gsSheetDate_(extracted.period_start),
    gsSheetDate_(extracted.period_end),
    extracted.block_parcel,
    extracted.index_block_id,
    extracted.bins_received,
    extracted.lbs_grade1,
    extracted.lbs_grade2,
    extracted.lbs_culls,
    extracted.lbs_total,
    extracted.gross_amount,
    extracted.charges_total,
    extracted.net_amount,
    (extracted.field_receipts || []).join(' '),
    fileId || '',
    fileUrl || '',
    extracted.confidence || 'ocr_reviewed',
    extracted.notes || '',
  ];
  stmtSheet.appendRow(row);
  const statementRowId = stmtSheet.getLastRow();

  const receiptSheet = ss.getSheetByName(SHEET_STATEMENT_RECEIPTS);
  const receipts = extracted.field_receipts || [];
  for (let i = 0; i < receipts.length; i++) {
    receiptSheet.appendRow([
      now,
      extracted.pool_number,
      gsSheetDate_(extracted.period_start),
      gsSheetDate_(extracted.period_end),
      extracted.block_parcel,
      receipts[i],
      statementRowId,
      fileId || '',
    ]);
  }

  return { rows: 1 + receipts.length, receiptCount: receipts.length };
}

function setupGrowerStatementPipeline(config) {
  config = config || {};
  const props = PropertiesService.getScriptProperties();
  let spreadsheet;
  if (config.spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create('Farm Operations — Grower Statements');
  }
  let folder;
  if (config.folderId) {
    folder = DriveApp.getFolderById(config.folderId);
  } else {
    folder = DriveApp.createFolder('Grower Statement PDFs');
  }
  gsEnsureSheet_(spreadsheet, SHEET_STATEMENTS, STATEMENT_HEADERS);
  gsEnsureSheet_(spreadsheet, SHEET_STATEMENT_RECEIPTS, STATEMENT_RECEIPT_HEADERS);
  props.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  Logger.log('Grower statement pipeline ready.');
  Logger.log('Spreadsheet ID: ' + spreadsheet.getId());
  Logger.log('Folder ID: ' + folder.getId());
}

function setupGrowerStatementOnce() {
  setupGrowerStatementPipeline({ spreadsheetId: 'PASTE_MASTER_SHEET_ID', folderId: 'PASTE_FOLDER_ID' });
}

function gsEnsureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0e8');
  }
}

function decodeBase64File_(base64Data, mimeType) {
  const raw = String(base64Data || '');
  let mime = mimeType || '';
  let ext = '.bin';
  const dataMatch = raw.match(/^data:([^;]+);base64,/);
  if (dataMatch) mime = dataMatch[1];
  mime = (mime || 'application/pdf').toLowerCase();

  if (mime.indexOf('pdf') !== -1) ext = '.pdf';
  else if (mime.indexOf('png') !== -1) ext = '.png';
  else if (mime.indexOf('jpeg') !== -1 || mime.indexOf('jpg') !== -1) ext = '.jpg';
  else if (mime.indexOf('heic') !== -1) ext = '.heic';
  else if (mime.indexOf('image/') === 0) ext = '.jpg';

  const cleaned = raw.replace(/^data:[^;]+;base64,/, '');
  return {
    bytes: Utilities.base64Decode(cleaned),
    mimeType: mime,
    ext: ext,
  };
}

function ocrFileToText_(blob, folderId) {
  const mime = blob.getContentType() || 'application/pdf';
  const metadata = {
    title: 'ocr_statement_' + Date.now(),
    mimeType: mime,
    parents: [{ id: folderId }],
  };
  const boundary = 'statement_ocr_' + Date.now();
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
  const backoffMs = [0, 2500, 6000, 12000];
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (backoffMs[attempt] > 0) Utilities.sleep(backoffMs[attempt]);
    response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code < 300) break;
    const body = response.getContentText();
    if (!(code === 403 && /userRateLimitExceeded|rate limit exceeded/i.test(body))) break;
  }

  if (!response || response.getResponseCode() >= 300) {
    const code = response ? response.getResponseCode() : 0;
    const body = response ? response.getContentText() : 'No response';
    if (code === 403 && /userRateLimitExceeded|rate limit exceeded/i.test(body)) {
      throw new Error('Drive OCR rate limit hit. Wait 30–60s and try again, or paste text manually.');
    }
    throw new Error('Drive OCR upload failed (' + code + '): ' + body);
  }

  const created = JSON.parse(response.getContentText());
  const docId = created.id;
  const text = DocumentApp.openById(docId).getBody().getText();
  DriveApp.getFileById(docId).setTrashed(true);
  return text || '';
}

function gsFuzzyMatchBlock_(raw) {
  const key = gsNormalizeBlockKey_(raw);
  if (!key || key.length < 3) return null;
  if (/^GR\d+$/i.test(key) || /^SBFARMGR\d+$/i.test(key) || /^\d{6}HA\d{3}$/i.test(key)) {
    return null;
  }
  if (GS_BLOCK_ALIASES[key]) return GS_BLOCK_ALIASES[key];

  let best = null;
  let bestScore = 999;
  for (let i = 0; i < GS_KNOWN_BLOCKS.length; i++) {
    const candidate = GS_KNOWN_BLOCKS[i];
    const score = gsLevenshtein_(key, gsNormalizeBlockKey_(candidate));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  const threshold = Math.max(2, Math.floor(key.length * 0.35));
  if (best && bestScore <= threshold) return best;
  return null;
}

function gsNormalizeBlockKey_(s) {
  return String(s || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

/** Only returns a name from GS_KNOWN_BLOCKS (or null). */
function gsCleanBlockValue_(value, fromOcr) {
  return gsFuzzyMatchBlock_(value);
}

function gsToTitleCase_(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function gsLevenshtein_(a, b) {
  a = String(a || '');
  b = String(b || '');
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) dp[i] = [i];
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function gsMatchGroup_(text, regex) {
  const match = String(text || '').match(regex);
  return match && match[1] ? match[1].trim() : null;
}

function gsMoneyOrNull_(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

function gsNumberOrNull_(value) {
  return gsMoneyOrNull_(value);
}

function gsNumOrNull_(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function gsRoundMoney_(n, digits) {
  const d = digits == null ? 2 : digits;
  const f = Math.pow(10, d);
  return Math.round(Number(n) * f) / f;
}

function parseEnglishDate_(s) {
  // Parse month/day/year components directly — never use new Date('Jul 09, 2023')
  // which is UTC midnight and shifts back a day in America/Los_Angeles.
  const m = String(s || '')
    .replace(/\./g, '')
    .replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
    .match(/([A-Za-z]+)\s+([0-9Il]{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const months = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const month = months[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(String(m[2]).replace(/[Il]/g, '1'));
  const year = Number(m[3]);
  if (!day || !year || day > 31) return null;
  return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
}

function parseSlashDate_(s) {
  const m = String(s).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += 2000;
  const mm = ('0' + m[1]).slice(-2);
  const dd = ('0' + m[2]).slice(-2);
  return yyyy + '-' + mm + '-' + dd;
}

function normalizeIsoDate_(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/[A-Za-z]/.test(s)) return parseEnglishDate_(s);
  if (/[\/\-]/.test(s)) return parseSlashDate_(s);
  return null;
}

/** Keep dates as yyyy-mm-dd text (no time) — matches older grower_statements rows. */
function gsSheetDate_(value) {
  return normalizeIsoDate_(value) || '';
}

// ─── Drive inbox auto-process (drop PDF → OCR → sheet → move) ─────────

/**
 * Create Inbox / Processed / Needs review folders and save their IDs.
 * Run once from the editor after setupGrowerStatementPipeline().
 *
 * Drop grower-statement PDFs into Inbox; processGrowerStatementInbox()
 * (or the installable trigger) picks them up.
 */
function setupGrowerStatementInboxFolders(parentFolderId) {
  const props = PropertiesService.getScriptProperties();
  const parentId = parentFolderId || props.getProperty('UPLOAD_FOLDER_ID');
  if (!parentId) {
    throw new Error('Set UPLOAD_FOLDER_ID first (run setupGrowerStatementPipeline).');
  }
  const parent = DriveApp.getFolderById(parentId);

  const inbox = gsEnsureDriveSubfolder_(parent, 'Grower Statement Inbox');
  const processed = gsEnsureDriveSubfolder_(parent, 'Grower Statement Processed');
  const review = gsEnsureDriveSubfolder_(parent, 'Grower Statement Needs Review');
  const failed = gsEnsureDriveSubfolder_(parent, 'Grower Statement Failed');

  props.setProperty('GS_INBOX_FOLDER_ID', inbox.getId());
  props.setProperty('GS_PROCESSED_FOLDER_ID', processed.getId());
  props.setProperty('GS_REVIEW_FOLDER_ID', review.getId());
  props.setProperty('GS_FAILED_FOLDER_ID', failed.getId());

  Logger.log('Inbox: ' + inbox.getUrl());
  Logger.log('Processed: ' + processed.getUrl());
  Logger.log('Needs review: ' + review.getUrl());
  Logger.log('Failed: ' + failed.getUrl());
  return {
    inboxId: inbox.getId(),
    processedId: processed.getId(),
    reviewId: review.getId(),
    failedId: failed.getId(),
  };
}

function gsEnsureDriveSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

/** Install a 5-minute poll of the inbox folder. */
function installGrowerStatementInboxTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processGrowerStatementInbox') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('processGrowerStatementInbox').timeBased().everyMinutes(5).create();
  Logger.log('Inbox trigger installed (every 5 minutes).');
}

/**
 * Process every PDF/image in Grower Statement Inbox:
 *   OCR → parse → find ranch block in raw text → write sheet → move to Processed.
 * If block still missing after full-text scan → Needs Review (not written).
 * On hard error → Failed.
 */
function processGrowerStatementInbox() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  const inboxId = props.getProperty('GS_INBOX_FOLDER_ID');
  const processedId = props.getProperty('GS_PROCESSED_FOLDER_ID');
  const reviewId = props.getProperty('GS_REVIEW_FOLDER_ID');
  const failedId = props.getProperty('GS_FAILED_FOLDER_ID');

  if (!spreadsheetId) throw new Error('SPREADSHEET_ID not set.');
  if (!inboxId || !processedId || !reviewId || !failedId) {
    throw new Error('Run setupGrowerStatementInboxFolders() first.');
  }

  const inbox = DriveApp.getFolderById(inboxId);
  const processed = DriveApp.getFolderById(processedId);
  const review = DriveApp.getFolderById(reviewId);
  const failed = DriveApp.getFolderById(failedId);

  const files = inbox.getFiles();
  const results = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    const mime = String(file.getMimeType() || '').toLowerCase();
    const okType =
      mime.indexOf('pdf') !== -1 ||
      mime.indexOf('jpeg') !== -1 ||
      mime.indexOf('jpg') !== -1 ||
      mime.indexOf('png') !== -1 ||
      mime.indexOf('image/') === 0;

    if (!okType) {
      results.push({ file: name, status: 'skipped', reason: 'unsupported type ' + mime });
      continue;
    }

    try {
      const blob = file.getBlob().setName(name);
      const text = ocrFileToText_(blob, inboxId);
      const parsed = parseAllStatementsText_(text, name);

      if (!parsed.length) {
        file.moveTo(review);
        file.setDescription('No grower statement detected in OCR.\n\n' + String(text || '').slice(0, 1500));
        results.push({ file: name, status: 'review', reason: 'no statements in OCR' });
        continue;
      }

      const missingBlock = [];
      const toWrite = [];
      for (let i = 0; i < parsed.length; i++) {
        const built = buildStatementFromReview_(parsed[i]);
        // Re-scan full OCR in case review builder dropped the block
        if (!built.block_parcel) {
          built.block_parcel = gsFindRanchBlockInText_(text);
        }
        // Dates often live in the PDF header — backfill from full OCR if still blank
        if (!built.period_start || !built.period_end || !built.statement_date) {
          const docPeriod = extractPeriodDates_(text);
          const docStmt = extractStatementDate_(text);
          if (!built.period_start && docPeriod.start) built.period_start = docPeriod.start;
          if (!built.period_end && docPeriod.end) built.period_end = docPeriod.end;
          if (!built.statement_date) {
            built.statement_date = docStmt || built.period_end || built.period_start || null;
          }
        }
        if (!built.block_parcel) {
          missingBlock.push(i + 1);
        } else {
          toWrite.push(built);
        }
      }

      if (missingBlock.length) {
        file.moveTo(review);
        file.setDescription(
          'Could not find a ranch block name in OCR (GR#### is not a block). ' +
            'Statements needing block: ' +
            missingBlock.join(', ') +
            '.\nKnown blocks: ' +
            GS_KNOWN_BLOCKS.join(', ') +
            '\n\n' +
            String(text || '').slice(0, 2000)
        );
        results.push({
          file: name,
          status: 'review',
          reason: 'block not found in text',
          statements: parsed.length,
        });
        continue;
      }

      const summaries = [];
      for (let i = 0; i < toWrite.length; i++) {
        const written = writeStatementData_(spreadsheetId, toWrite[i], file.getId(), file.getUrl());
        summaries.push({
          block: toWrite[i].block_parcel,
          pool: toWrite[i].pool_number,
          net: toWrite[i].net_amount,
          receipts: written.receiptCount,
        });
      }

      file.moveTo(processed);
      file.setDescription('Auto-imported ' + summaries.length + ' statement(s): ' + JSON.stringify(summaries));
      results.push({ file: name, status: 'processed', statements: summaries.length, summaries: summaries });
    } catch (err) {
      try {
        file.moveTo(failed);
        file.setDescription('Auto-import failed: ' + String(err));
      } catch (moveErr) {
        // ignore move failure
      }
      results.push({ file: name, status: 'failed', reason: String(err) });
    }
  }

  Logger.log('Inbox run: ' + JSON.stringify(results));
  return { processed: results.length, results: results };
}
