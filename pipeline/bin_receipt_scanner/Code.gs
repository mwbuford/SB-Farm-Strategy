/**
 * Index Fresh Bin Receipt — upload photo → OCR → parse → review → sheet
 * Supports multiple receipts in one photo.
 */

const SHEET_RECEIPTS = 'bin_receipts';
const SHEET_BINS = 'bin_numbers';

const RECEIPT_HEADERS = [
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
];

const BIN_HEADERS = [
  'logged_at',
  'date_picked_up',
  'block_parcel',
  'variety',
  'bin_number',
  'receipt_number',
  'image_file_id',
];

/** Canonical ranch block names — OCR is fuzzy-matched to these. */
const KNOWN_BLOCKS = [
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

const BLOCK_ALIASES = {
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
  BREAZIC: 'Codornices',
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
  GAVILAN: 'Gavilanes',
  GAVILANES: 'Gavilanes',
  CABALLO: 'Caballos',
  CABALLOS: 'Caballos',
  CUERVO: 'Cuervos',
  CUERVOS: 'Cuervos',
  ARDILLA: 'Ardillas',
  ARDILLAS: 'Ardillas',
};

const BLOCK_JUNK_RE =
  /remarks|reg\.?\s*pick|organic|variety|full\s*bins|partial|grower|bin\s*receipt|office\s*use|gap\s*certified|one\s*\(\s*1\s*\)/i;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Upload')
    .setTitle('Bin Receipt Upload')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function processReceiptEntry(data, base64Data, mimeType) {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('UPLOAD_FOLDER_ID');
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not set. Run setupPipeline() from the Apps Script editor.');
  }

  data = data || {};
  let sourceText = String(data.pasted_text || '').trim();
  let fileId = '';
  let imageUrl = '';
  let ocrWarning = '';

  if (base64Data) {
    if (!folderId) throw new Error('UPLOAD_FOLDER_ID not set. Run setupPipeline() first.');
    const bytes = decodeBase64Image_(base64Data);
    const blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', 'bin_receipt_' + Date.now() + '.jpg');
    const file = DriveApp.getFolderById(folderId).createFile(blob);
    fileId = file.getId();
    imageUrl = file.getUrl();
  }

  if (!sourceText && base64Data) {
    const imageMime = (mimeType || '').toLowerCase();
    if (imageMime.indexOf('image/heic') !== -1) {
      ocrWarning = 'HEIC not supported for OCR. Use JPG/PNG or paste text manually.';
    } else {
      try {
        const bytes = decodeBase64Image_(base64Data);
        const blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', 'ocr_' + Date.now() + '.jpg');
        sourceText = ocrImageToText_(blob, folderId);
      } catch (err) {
        ocrWarning = 'OCR failed: ' + err;
      }
    }
  }

  let receiptsToSave = [];
  if (data.receipts_json) {
    try {
      const reviewed = JSON.parse(data.receipts_json);
      if (Array.isArray(reviewed)) {
        for (let i = 0; i < reviewed.length; i++) {
          receiptsToSave.push(buildExtractedFromReview_(reviewed[i], sourceText));
        }
      }
    } catch (e) {
      throw new Error('Invalid receipts data from form.');
    }
  }

  if (!receiptsToSave.length) {
    receiptsToSave.push(buildExtractedFromReview_(data, sourceText));
  }

  let totalRows = 0;
  const summaries = [];
  for (let i = 0; i < receiptsToSave.length; i++) {
    const extracted = receiptsToSave[i];
    let warn = ocrWarning;

    const expectedBins = extracted.full_bins != null ? Math.round(Number(extracted.full_bins)) : null;
    const foundBins = extracted.bin_numbers.length;
    const hasPartial = extracted.partial_bins != null && Number(extracted.partial_bins) > 0;
    if (!hasPartial && expectedBins != null && !isNaN(expectedBins) && foundBins !== expectedBins) {
      warn = appendWarning_(
        warn,
        'Receipt ' +
          (extracted.receipt_number || i + 1) +
          ': found ' +
          foundBins +
          ' bin numbers but Full bins says ' +
          expectedBins +
          '.'
      );
    }

    if (!extracted.date_picked_up) {
      throw new Error('Receipt ' + (i + 1) + ': missing date. Edit and try again.');
    }
    if (!extracted.block_parcel) {
      throw new Error('Receipt ' + (i + 1) + ': missing block. Edit block name and try again.');
    }
    if (!extracted.bin_numbers.length && !extracted.full_bins) {
      throw new Error('Receipt ' + (i + 1) + ': missing bin numbers.');
    }

    totalRows += writeExtractedData_(spreadsheetId, extracted, fileId, imageUrl);
    summaries.push({
      block: extracted.block_parcel,
      date: extracted.date_picked_up,
      fullBins: extracted.full_bins,
      binCount: extracted.bin_numbers.length,
      receiptNumber: extracted.receipt_number || '',
    });
  }

  return {
    ok: true,
    receiptCount: summaries.length,
    summaries: summaries,
    date: summaries[0] ? summaries[0].date : '',
    block: summaries[0] ? summaries[0].block : '',
    fullBins: summaries[0] ? summaries[0].fullBins : '',
    binCount: summaries.reduce(function (sum, s) {
      return sum + s.binCount;
    }, 0),
    rowsWritten: totalRows,
    imageSaved: !!fileId,
    warning: ocrWarning || '',
  };
}

function buildExtractedFromReview_(data, sourceText) {
  data = data || {};
  const blockOverride = cleanBlockValue_(data.block_parcel, false);
  const dateOverride = String(data.date_picked_up || '').trim();
  const varietyOverride = String(data.variety || '').trim();
  const fullBinsOverride =
    data.full_bins === '' || data.full_bins == null ? null : Number(data.full_bins);
  const partialBinsOverride =
    data.partial_bins === '' || data.partial_bins == null ? null : Number(data.partial_bins);
  const receiptOverride = String(data.receipt_number || '').trim();
  const growerOverride = String(data.grower_name || '').trim();
  const remarksOverride = String(data.remarks || '').trim();
  const effectiveFullBins =
    fullBinsOverride != null && !isNaN(fullBinsOverride) ? fullBinsOverride : data.full_bins;
  const binsOverride = reconcileBinList_(
    parseBinNumbers_(String(data.bin_numbers_text || ''), {}),
    effectiveFullBins
  );
  let finalBins = binsOverride.length ? binsOverride : data.bin_numbers || [];
  if (effectiveFullBins === 1) {
    finalBins = fixBinMergedWithFullCount_(finalBins);
  }

  const parsed = sourceText && !dateOverride && !blockOverride ? {} : {};

  const extracted = {
    date_picked_up: dateOverride || data.date_picked_up || null,
    block_parcel: blockOverride || fuzzyMatchBlock_(data.block_parcel) || null,
    variety: varietyOverride || data.variety || 'Hass',
    full_bins:
      fullBinsOverride != null && !isNaN(fullBinsOverride)
        ? fullBinsOverride
        : data.full_bins != null
          ? data.full_bins
          : partialBinsOverride > 0
            ? 0
            : finalBins.length || null,
    partial_bins:
      partialBinsOverride != null && !isNaN(partialBinsOverride)
        ? partialBinsOverride
        : data.partial_bins,
    grower_name: growerOverride || data.grower_name || null,
    receipt_number: receiptOverride || data.receipt_number || null,
    pickup_time: null,
    remarks: remarksOverride || data.remarks || null,
    bin_numbers: finalBins,
    confidence: sourceText ? 'ocr_reviewed' : 'manual',
    ocr_text: sourceText || null,
  };

  if (extracted.full_bins === 1 && extracted.bin_numbers.length > 1) {
    extracted.full_bins = extracted.bin_numbers.length;
  }

  return extracted;
}

function previewFromPastedText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return { text: '', warning: 'No text to parse.', receipts: [], parsed: {}, receiptCount: 0 };
  const receipts = parseAllReceiptsText_(normalized);
  return {
    text: normalized,
    warning: '',
    receipts: receipts,
    parsed: receipts[0] || {},
    receiptCount: receipts.length,
  };
}

function previewOcrText(base64Data, mimeType) {
  if (!base64Data) return { text: '', warning: 'No image selected.', receipts: [], parsed: {} };

  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('UPLOAD_FOLDER_ID');
  if (!folderId) throw new Error('UPLOAD_FOLDER_ID not set. Run setupPipeline() first.');

  const imageMime = (mimeType || '').toLowerCase();
  if (imageMime.indexOf('image/heic') !== -1) {
    return {
      text: '',
      warning: 'HEIC is not supported. Switch iPhone camera to Most Compatible (JPG) or paste text manually.',
      receipts: [],
      parsed: {},
    };
  }

  const bytes = decodeBase64Image_(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', 'ocr_preview_' + Date.now() + '.jpg');
  const text = ocrImageToText_(blob, folderId);
  const receipts = parseAllReceiptsText_(text);

  return {
    text: text || '',
    warning: '',
    receipts: receipts,
    parsed: receipts[0] || {},
    receiptCount: receipts.length,
  };
}

/** Split OCR text into one chunk per Bin Receipt # and parse each. */
function parseAllReceiptsText_(text) {
  const normalized = String(text || '').replace(/\r/g, '');
  const re = /Bin\s*Receipt\s*#\s*0*(\d{4,})/gi;
  const markers = [];
  let m;
  while ((m = re.exec(normalized)) !== null) {
    markers.push({ num: m[1], end: m.index + m[0].length, start: m.index });
  }

  if (!markers.length) {
    const single = parseReceiptText_(normalized);
    return single && (single.block_parcel || single.bin_numbers.length || single.full_bins) ? [single] : [];
  }

  const receipts = [];
  for (let i = 0; i < markers.length; i++) {
    let chunkStart = 0;
    if (i > 0) {
      const between = normalized.slice(markers[i - 1].end, markers[i].start);
      const datePos = between.lastIndexOf('Date Picked Up');
      chunkStart = datePos >= 0 ? markers[i - 1].end + datePos : markers[i - 1].end;
    } else {
      const beforeFirst = normalized.slice(0, markers[i].start);
      const datePos = beforeFirst.lastIndexOf('Date Picked Up');
      chunkStart = datePos >= 0 ? datePos : 0;
    }

    const chunk = normalized.slice(chunkStart, markers[i].end);
    const parsed = parseReceiptText_(chunk);
    if (parsed && (parsed.block_parcel || parsed.bin_numbers.length || parsed.full_bins || parsed.partial_bins)) {
      parsed.receipt_number = markers[i].num;
      receipts.push(parsed);
    }
  }

  return receipts;
}

function parseReceiptText_(text) {
  const normalized = String(text || '').replace(/\r/g, '');

  const receiptNumber =
    matchGroup_(normalized, /Bin\s*Receipt\s*#\s*0*([0-9]{4,})/i) ||
    matchGroup_(normalized, /Receipt\s*#\s*0*([0-9]{4,})/i);

  const blockParcel = extractBlockParcel_(normalized);

  const dateMatch = normalized.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  const datePickedUp = dateMatch ? normalizeDate_(dateMatch[1], dateMatch[2], dateMatch[3]) : null;

  const variety = /\bLamb\s*Hass\b/i.test(normalized)
    ? 'Lamb Hass'
    : /\bHass\b/i.test(normalized)
      ? 'Hass'
      : null;

  const growerName =
    matchGroup_(normalized, /Grower\s*Name[^\n]*\n\s*([^\n]+)/i) ||
    matchGroup_(normalized, /s\.?\s*b\.?\s*Farm/i) ? 'S.b. Farm' : null;

  const fullBins = extractFullBins_(normalized);
  const partialBins = extractPartialBins_(normalized);
  const layoutCounts = extractBinCountsFromLayout_(normalized);
  const resolvedPartialBins = layoutCounts.partialBins != null ? layoutCounts.partialBins : partialBins;
  let resolvedFullBinsFromLayout = layoutCounts.fullBins != null ? layoutCounts.fullBins : fullBins;

  const binSection =
    matchGroup_(normalized, /BIN\s*#[:\s]*([\s\S]*?)Office\s*use\s*only/i) ||
    matchGroup_(normalized, /BIN\s*#[:\s]*([\s\S]*?)The\s+Avocados/i) ||
    matchGroup_(normalized, /BIN\s*#[:\s]*([\s\S]*?)Bin\s*Receipt\s*#/i) ||
    matchGroup_(normalized, /BIN\s*#[:\s]*([\s\S]*)/i) ||
    '';

  const excluded = buildBinExclusions_(normalized, receiptNumber, resolvedFullBinsFromLayout, blockParcel, dateMatch);
  let binNumbers = parseBinNumbers_(binSection, excluded);
  if (resolvedFullBinsFromLayout != null && resolvedFullBinsFromLayout > 1) {
    binNumbers = recoverBinsToCount_(binSection, binNumbers, resolvedFullBinsFromLayout, excluded);
  }
  binNumbers = reconcileBinList_(binNumbers, resolvedFullBinsFromLayout);
  if (resolvedFullBinsFromLayout === 1 && binNumbers.length === 1) {
    binNumbers = fixBinMergedWithFullCount_(binNumbers);
  }

  let resolvedFullBins = resolvedFullBinsFromLayout;
  if (resolvedPartialBins != null && resolvedPartialBins > 0) {
    if (resolvedFullBins == null) resolvedFullBins = 0;
  } else if ((resolvedFullBins == null || resolvedFullBins <= 1) && binNumbers.length > 1) {
    resolvedFullBins = binNumbers.length;
  }
  if (resolvedFullBins != null && resolvedFullBins > 1 && binNumbers.length > resolvedFullBins) {
    binNumbers = binNumbers.slice(0, resolvedFullBins);
  }
  if (resolvedFullBins == null && binNumbers.length && resolvedPartialBins == null) {
    resolvedFullBins = binNumbers.length;
  }

  return {
    date_picked_up: datePickedUp,
    block_parcel: blockParcel,
    variety: variety,
    full_bins: resolvedFullBins,
    partial_bins: resolvedPartialBins,
    grower_name: growerName,
    receipt_number: receiptNumber || null,
    remarks: /\bReg\.?\s*Pick\b/i.test(normalized) ? 'Reg. Pick' : null,
    bin_numbers: binNumbers,
  };
}

function extractFullBins_(text) {
  const normalized = String(text || '');
  const hasOneBinDisclaimer = /one\s*\(\s*1\s*\)\s*bin\s*receipt/i.test(normalized);

  const candidates = [];

  function addCandidate(raw, weight) {
    const n = numberOrNull_(raw);
    if (n == null || n < 1 || n > 200) return;
    if (n === 1 && hasOneBinDisclaimer) return;
    candidates.push({ n: n, weight: weight });
  }

  let m =
    matchGroup_(normalized, /Full\s*Bins\s*Partial[^\n]*\n\s*(\d{1,3})\s*(?:\n|$)/i) ||
    matchGroup_(normalized, /Full\s*Bins[^\n]*\n\s*(\d{1,3})\s*(?:\n|$)/i);
  if (m) addCandidate(m, 100);

  m = matchGroup_(normalized, /Full\s*Bins\s*Partial[^\n]*\n+(\d{1,3})\s*\n\s*BIN/i);
  if (m) addCandidate(m, 98);

  m = matchGroup_(normalized, /Full\s*Bins[^\n]*\b(\d{2,3})\b/i);
  if (m) addCandidate(m, 90);

  m = matchGroup_(normalized, /Partial\s*\([^)]+\)\s*\n?\s*(\d{1,3})\s*\n\s*BIN/i);
  if (m) addCandidate(m, 95);

  m = matchGroup_(normalized, /\n\s*(\d{2,3})\s*\n\s*BIN\s*#/i);
  if (m) addCandidate(m, 85);

  const lines = normalized.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/Full\s*Bins/i.test(lines[i])) {
      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (/^\d{1,3}$/.test(next)) addCandidate(next, 80);
      }
      const inline = lines[i].match(/\b(\d{2,3})\b/);
      if (inline) addCandidate(inline[1], 70);
    }
    if (/^\s*\d{2,3}\s*$/.test(lines[i]) && i + 1 < lines.length && /BIN\s*#/i.test(lines[i + 1])) {
      addCandidate(lines[i].trim(), 88);
    }
  }

  if (!candidates.length) return null;
  candidates.sort(function (a, b) {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return b.n - a.n;
  });
  return candidates[0].n;
}

function extractPartialBins_(text) {
  const layout = extractBinCountsFromLayout_(text);
  if (layout.partialBins != null) return layout.partialBins;

  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^Partial\s*\(/i.test(line)) continue;
    if (/^(3\/4|1\/2|1\/4)$/.test(line)) {
      if (line === '3/4') return 0.75;
      if (line === '1/2') return 0.5;
      if (line === '1/4') return 0.25;
    }
  }
  return null;
}

/**
 * Index Fresh forms use side-by-side Full Bins / Partial columns.
 * OCR often stacks headers then values on separate lines (e.g. Hass then 3/4).
 */
function extractBinCountsFromLayout_(text) {
  const normalized = String(text || '');
  const hasOneBinDisclaimer = /one\s*\(\s*1\s*\)\s*bin\s*receipt/i.test(normalized);
  const partialHeader = normalized.match(/Partial\s*\([^)]+\)/i);
  if (!partialHeader) return { fullBins: null, partialBins: null };

  const startIdx = partialHeader.index + partialHeader[0].length;
  const binMatch = normalized.slice(startIdx).search(/BIN\s*#/i);
  const section = binMatch >= 0 ? normalized.slice(startIdx, startIdx + binMatch) : normalized.slice(startIdx);
  const lines = section.split('\n');

  let fullBins = null;
  let partialBins = null;
  const skipRe =
    /^(variety|hass|lamb\s*hass|truck|driver|receiver|p\.?\s*h\.?|cmf|index\s*fresh|office|ver\/ranchero|grower)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || skipRe.test(line)) continue;
    if (/^partial\s*\(/i.test(line)) continue;
    if (/^full\s*bins/i.test(line)) continue;
    if (/one\s*\(\s*1\s*\)/i.test(line)) continue;
    if (/un recibo/i.test(line)) continue;

    if (/^(3\/4|1\/2|1\/4)$/.test(line)) {
      partialBins = line === '3/4' ? 0.75 : line === '1/2' ? 0.5 : 0.25;
      continue;
    }

    if (/^\d{1,3}$/.test(line)) {
      const n = Number(line);
      if (n >= 1 && n <= 200 && !(n === 1 && hasOneBinDisclaimer)) {
        fullBins = n;
      }
    }
  }

  return { fullBins: fullBins, partialBins: partialBins };
}

function fixBinMergedWithFullCount_(bins) {
  if (!bins || bins.length !== 1) return bins;
  const b = String(bins[0] || '');
  if (b.length === 5 && b.charAt(0) === '1' && /^1[0-9]{4}$/.test(b)) {
    const trimmed = b.slice(1);
    if (/^[0-9]{4}$/.test(trimmed)) return [trimmed];
  }
  return bins;
}

function buildBinExclusions_(normalized, receiptNumber, fullBins, blockParcel, dateMatch) {
  const excluded = {};
  if (receiptNumber) excluded[receiptNumber] = true;
  if (fullBins != null) excluded[String(fullBins)] = true;
  excluded['42941'] = true;
  excluded['18184'] = true;
  excluded['92316'] = true;
  if (dateMatch) {
    excluded[String(Number(dateMatch[1]))] = true;
    excluded[String(Number(dateMatch[2]))] = true;
  }
  return excluded;
}

function extractBlockParcel_(text) {
  const normalized = String(text || '').replace(/\r/g, '');
  const blkPos = normalized.search(/Blk\/?\s*Parcel\s*#/i);
  if (blkPos < 0) return fuzzyMatchBlockFromText_(normalized);

  const afterBlk = normalized.slice(blkPos);
  const lines = afterBlk.split('\n');
  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    if (!line || BLOCK_JUNK_RE.test(line)) continue;
    if (/one\s*\(\s*1\s*\)/i.test(line)) continue;
    if (/un recibo/i.test(line)) continue;
    const matched = fuzzyMatchBlock_(line);
    if (matched) return matched;
  }

  let lineValue = matchGroup_(normalized, /Blk\/?\s*Parcel\s*#?\s*[:\-]?\s*([^\n]+)/i);
  if (lineValue) {
    const matched = fuzzyMatchBlock_(lineValue);
    if (matched) return matched;
  }

  return fuzzyMatchBlockFromText_(normalized);
}

function fuzzyMatchBlockFromText_(text) {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const matched = fuzzyMatchBlock_(lines[i]);
    if (matched) return matched;
  }
  return null;
}

function fuzzyMatchBlock_(raw) {
  const key = normalizeBlockKey_(raw);
  if (!key || key.length < 3) return null;
  if (BLOCK_JUNK_RE.test(raw)) return null;

  if (BLOCK_ALIASES[key]) return BLOCK_ALIASES[key];

  let best = null;
  let bestScore = 999;
  for (let i = 0; i < KNOWN_BLOCKS.length; i++) {
    const candidate = KNOWN_BLOCKS[i];
    const score = levenshtein_(key, normalizeBlockKey_(candidate));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  const threshold = Math.max(2, Math.floor(key.length * 0.35));
  if (best && bestScore <= threshold) return best;
  return null;
}

function normalizeBlockKey_(s) {
  return String(s || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function levenshtein_(a, b) {
  a = String(a || '');
  b = String(b || '');
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function cleanBlockValue_(value, fromOcr) {
  const matched = fuzzyMatchBlock_(value);
  if (matched) return matched;

  let cleaned = String(value || '')
    .replace(/[^A-Za-z0-9 \-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (BLOCK_JUNK_RE.test(cleaned)) return null;

  const lMatch = cleaned.match(/\bL\d{1,2}\s*\d{3,5}\b/i);
  if (lMatch) return lMatch[0].replace(/\s+/g, ' ').toUpperCase();

  if (/^[A-Za-z][A-Za-z0-9 \-]{1,35}$/.test(cleaned)) {
    return toTitleCase_(cleaned);
  }
  return fromOcr ? null : cleaned;
}

function toTitleCase_(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function parseBinNumbers_(text, excludedMap) {
  let normalized = normalizeBinOcrText_(String(text || ''));
  normalized = normalized.replace(/(\d)\.(\d)/g, '$1$2');
  normalized = normalized.replace(/(\d)\./g, '$1');

  const rawParts = normalized.split(/[^0-9]+/);
  const parts = [];
  for (let i = 0; i < rawParts.length; i++) {
    const token = rawParts[i].trim();
    if (!token) continue;
    const expanded = splitLongBinToken_(token);
    for (let j = 0; j < expanded.length; j++) parts.push(expanded[j]);
  }

  const out = [];
  const seen = {};
  const excluded = excludedMap || {};
  for (let i = 0; i < parts.length; i++) {
    const p = fixBinOcrDigit_(parts[i].trim());
    if (!p) continue;
    if (!/^[0-9]{4,6}$/.test(p)) continue;
    if (excluded[p]) continue;
    if (seen[p]) continue;
    seen[p] = true;
    out.push(p);
  }
  return out;
}

function fixBinOcrDigit_(bin) {
  let b = String(bin || '');
  if (b.length === 6 && b.charAt(0) === '5' && b.charAt(1) === '6' && b.charAt(2) === '7') {
    b = '50' + b.slice(3);
  }
  if (b.length === 5 && b.slice(0, 2) === '56' && b.charAt(2) === '7') {
    b = '50' + b.slice(2);
  }
  if (b.length === 6 && b.slice(0, 4) === '5037' && b.charAt(5) === '1') {
    b = b.slice(0, 5);
  }
  if (b.length === 5 && b === '50411') return b;
  return b;
}

/**
 * When Full Bins is known (e.g. 15), greedily split merged OCR digit runs to reach that count.
 */
function recoverBinsToCount_(binSection, currentBins, expectedCount, excluded) {
  const seen = {};
  const out = [];
  for (let i = 0; i < currentBins.length; i++) {
    const b = currentBins[i];
    if (!seen[b]) {
      seen[b] = true;
      out.push(b);
    }
  }
  if (out.length >= expectedCount) return out.slice(0, expectedCount);

  let digits = normalizeBinOcrText_(binSection);
  digits = digits.replace(/(\d)\.(\d)/g, '$1$2');
  digits = digits.replace(/[^0-9]/g, '');

  const greedy = greedySplitDigits_(digits, expectedCount);
  for (let i = 0; i < greedy.length; i++) {
    const fixed = fixBinOcrDigit_(greedy[i]);
    if (!/^[0-9]{4,6}$/.test(fixed)) continue;
    if (excluded && excluded[fixed]) continue;
    if (!seen[fixed]) {
      seen[fixed] = true;
      out.push(fixed);
    }
  }
  return out.length ? out : currentBins;
}

function greedySplitDigits_(digits, targetCount) {
  digits = String(digits || '').replace(/\D/g, '');
  if (!digits.length || !targetCount) return [];

  const memo = {};

  function solve(pos, remaining) {
    const key = pos + ',' + remaining;
    if (memo[key] !== undefined) return memo[key];
    if (remaining === 0) return pos === digits.length ? [] : null;
    if (remaining < 0 || pos >= digits.length) return null;

    const charsLeft = digits.length - pos;
    const minLen = Math.max(4, charsLeft - (remaining - 1) * 5);
    const maxLen = Math.min(5, charsLeft - (remaining - 1) * 4);
    const tryLens = [];
    for (let len = maxLen; len >= minLen; len--) {
      if (len >= 4 && len <= 5) tryLens.push(len);
    }
    if (!tryLens.length) {
      if (remaining === 1 && charsLeft >= 4 && charsLeft <= 6) tryLens.push(charsLeft);
      else {
        memo[key] = null;
        return null;
      }
    }

    for (let t = 0; t < tryLens.length; t++) {
      const len = tryLens[t];
      const slice = digits.slice(pos, pos + len);
      const fixed = fixBinOcrDigit_(slice);
      if (!/^[0-9]{4,6}$/.test(fixed)) continue;
      const rest = solve(pos + len, remaining - 1);
      if (rest !== null) {
        const out = [fixed].concat(rest);
        memo[key] = out;
        return out;
      }
    }

    memo[key] = null;
    return null;
  }

  const dpResult = solve(0, targetCount);
  if (dpResult && dpResult.length === targetCount) return dpResult;

  const out = [];
  let pos = 0;
  while (pos < digits.length && out.length < targetCount) {
    const remaining = targetCount - out.length;
    const charsLeft = digits.length - pos;
    let len = remaining === 1 ? charsLeft : charsLeft - (remaining - 1) * 4 >= 5 ? 5 : 4;
    len = Math.min(Math.max(len, 4), 5, charsLeft);
    const slice = digits.slice(pos, pos + len);
    const fixed = fixBinOcrDigit_(slice);
    if (/^[0-9]{4,6}$/.test(fixed)) {
      out.push(fixed);
      pos += len;
    } else if (charsLeft >= 4) {
      const fallback = fixBinOcrDigit_(digits.slice(pos, pos + 4));
      if (/^[0-9]{4,6}$/.test(fallback)) {
        out.push(fallback);
        pos += 4;
      } else break;
    } else break;
  }
  return out;
}

/** Apply OCR fixes and optional splits to reach expected full-bin count. */
function reconcileBinList_(bins, expectedFull) {
  const out = [];
  const seen = {};
  const expected = expectedFull != null && !isNaN(Number(expectedFull)) ? Number(expectedFull) : null;

  for (let i = 0; i < bins.length; i++) {
    let b = fixBinOcrDigit_(bins[i]);
    const variants = [b];
    if (b.length === 6 && b.charAt(5) === '1') variants.push(b.slice(0, 5));
    if (b.length === 5 && b.slice(0, 2) === '56') variants.push('50' + b.slice(2));

    for (let v = 0; v < variants.length; v++) {
      const candidate = variants[v];
      if (!/^[0-9]{4,6}$/.test(candidate)) continue;
      if (seen[candidate]) continue;
      seen[candidate] = true;
      out.push(candidate);
      break;
    }
  }

  if (expected != null && expected > 1 && out.length < expected) {
    const expanded = expandMergedBinTokens_(bins, expected, seen);
    for (let i = 0; i < expanded.length; i++) {
      if (!seen[expanded[i]]) {
        seen[expanded[i]] = true;
        out.push(expanded[i]);
      }
    }
  }

  if (expected != null && expected > 0 && out.length > expected) {
    return out.slice(0, expected);
  }
  return out;
}

function expandMergedBinTokens_(bins, expected, seen) {
  const found = [];
  for (let i = 0; i < bins.length; i++) {
    const raw = String(bins[i] || '');
    if (!/^\d{7,}$/.test(raw)) continue;
    const parts = splitLongBinToken_(raw);
    for (let j = 0; j < parts.length; j++) {
      const fixed = fixBinOcrDigit_(parts[j]);
      if (/^[0-9]{4,6}$/.test(fixed) && !seen[fixed]) found.push(fixed);
    }
  }
  if (found.length + Object.keys(seen).length >= expected) return found;
  return found;
}

function normalizeBinOcrText_(text) {
  let s = String(text || '');
  s = s.replace(/\$/g, '5');
  s = s.replace(/[Oo]/g, '0');
  s = s.replace(/\bS(?=\d{3,6}\b)/g, '5');
  s = s.replace(/\bl(?=\d{3,6}\b)/g, '1');
  s = s.replace(/\bI(?=\d{3,6}\b)/g, '1');
  return s;
}

function splitLongBinToken_(token) {
  const t = String(token || '');
  if (!/^\d+$/.test(t)) return [];
  if (t.length <= 6) return [t];
  if (t.length === 7) return [t.slice(0, 4), t.slice(4, 7)];
  if (t.length === 8) return [t.slice(0, 4), t.slice(4, 8)];
  if (t.length === 9) return [t.slice(0, 4), t.slice(4, 9)];
  if (t.length === 10) return [t.slice(0, 5), t.slice(5, 10)];
  if (t.length === 11) return [t.slice(0, 5), t.slice(5, 11)];
  if (t.length === 12) return [t.slice(0, 4), t.slice(4, 8), t.slice(8, 12)];
  if (t.length === 13) return [t.slice(0, 4), t.slice(4, 8), t.slice(8, 13)];
  if (t.length === 14) return [t.slice(0, 5), t.slice(5, 9), t.slice(9, 14)];
  if (t.length === 15) return [t.slice(0, 5), t.slice(5, 10), t.slice(10, 15)];
  return [t];
}

function setupPipeline(config) {
  config = config || {};
  const props = PropertiesService.getScriptProperties();
  let spreadsheet;
  if (config.spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create('Farm Operations — Bin Receipts');
  }
  let folder;
  if (config.folderId) {
    folder = DriveApp.getFolderById(config.folderId);
  } else {
    folder = DriveApp.createFolder('Bin Receipt Photos');
  }
  ensureSheet_(spreadsheet, SHEET_RECEIPTS, RECEIPT_HEADERS);
  ensureSheet_(spreadsheet, SHEET_BINS, BIN_HEADERS);
  props.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
}

function setupOnce() {
  setupPipeline({ spreadsheetId: 'PASTE_MASTER_SHEET_ID', folderId: 'PASTE_FOLDER_ID' });
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
}

function decodeBase64Image_(base64Data) {
  const cleaned = String(base64Data).replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  return Utilities.base64Decode(cleaned);
}

function ocrImageToText_(blob, folderId) {
  const imageMime = blob.getContentType() || 'image/jpeg';
  const metadata = { title: 'ocr_receipt_' + Date.now(), mimeType: imageMime, parents: [{ id: folderId }] };
  const boundary = 'receipt_ocr_' + Date.now();
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelimiter = '\r\n--' + boundary + '--';
  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' +
    imageMime +
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
      throw new Error('Drive OCR rate limit hit. Wait 30-60 seconds and try again, or paste text manually.');
    }
    throw new Error('Drive OCR upload failed (' + code + '): ' + body);
  }

  const created = JSON.parse(response.getContentText());
  const docId = created.id;
  const text = DocumentApp.openById(docId).getBody().getText();
  DriveApp.getFileById(docId).setTrashed(true);
  return text || '';
}

function matchGroup_(text, regex) {
  const match = String(text || '').match(regex);
  return match && match[1] ? match[1].trim() : null;
}

function normalizeDate_(month, day, year) {
  let yyyy = Number(year);
  if (yyyy < 100) yyyy += 2000;
  if (yyyy < 2020) yyyy = 2026;
  const mm = String(Number(month)).padStart(2, '0');
  const dd = String(Number(day)).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function numberOrNull_(value) {
  if (value == null || value === '') return null;
  const num = Number(String(value).replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num;
}

function appendWarning_(base, extra) {
  const b = String(base || '').trim();
  const e = String(extra || '').trim();
  if (!b) return e;
  if (!e) return b;
  return b + ' ' + e;
}

function writeExtractedData_(spreadsheetId, data, fileId, imageUrl) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const receipts = ss.getSheetByName(SHEET_RECEIPTS);
  const bins = ss.getSheetByName(SHEET_BINS);
  const now = new Date();
  const binNumbers = Array.isArray(data.bin_numbers) ? data.bin_numbers : [];

  receipts.appendRow([
    now,
    data.date_picked_up || '',
    data.block_parcel || '',
    data.variety || '',
    data.full_bins != null ? data.full_bins : '',
    data.partial_bins != null ? data.partial_bins : '',
    data.grower_name || '',
    data.receipt_number || '',
    data.pickup_time || '',
    data.remarks || '',
    fileId || '',
    imageUrl || '',
    data.confidence || 'manual',
    JSON.stringify(data),
  ]);

  for (let i = 0; i < binNumbers.length; i++) {
    bins.appendRow([
      now,
      data.date_picked_up || '',
      data.block_parcel || '',
      data.variety || '',
      String(binNumbers[i]),
      data.receipt_number || '',
      fileId || '',
    ]);
  }

  return 1 + binNumbers.length;
}
