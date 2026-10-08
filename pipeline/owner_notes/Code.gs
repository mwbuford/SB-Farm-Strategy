/**
 * Owner Notes Repository — Sarah’s consultant / agronomist / advisor notes.
 *
 * Form → appends to one chronological Google Doc + logs a searchable summary
 * row on the master sheet. Optional photo of paper notes is OCR’d and embedded.
 *
 * SETUP: see SETUP.md — separate Apps Script project (own doGet).
 */

const ON_SHEET = 'owner_notes';
const ON_HEADERS = [
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
];

const ON_CATEGORIES = ['Consulting', 'Agronomy', 'Advisor', 'Operations', 'Other'];

const ON_PROP_SHEET = 'SPREADSHEET_ID';
const ON_PROP_FOLDER = 'UPLOAD_FOLDER_ID';
const ON_PROP_DOC = 'OWNER_NOTES_DOC_ID';

// ─── Web app ─────────────────────────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Notes')
    .setTitle('Owner Notes — Summerland')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getFormMeta() {
  return {
    categories: ON_CATEGORIES,
    today: Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Los_Angeles', 'yyyy-MM-dd'),
    docUrl: getOwnerDocUrl_(),
  };
}

/**
 * Save a note. payload:
 *   noteDate, title, withWhom, category, noteBody, author,
 *   photoBase64 (optional data URL), photoMime (optional), photoName (optional)
 */
function submitOwnerNote(payload) {
  payload = payload || {};
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(ON_PROP_SHEET);
  const folderId = props.getProperty(ON_PROP_FOLDER);
  const docId = props.getProperty(ON_PROP_DOC);
  if (!spreadsheetId || !folderId || !docId) {
    throw new Error('Not configured. Run setupOwnerNotesOnce() first (see SETUP.md).');
  }

  const noteDate = String(payload.noteDate || '').trim() || Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  const title = String(payload.title || '').trim() || 'Untitled note';
  const withWhom = String(payload.withWhom || '').trim();
  const category = String(payload.category || 'Other').trim() || 'Other';
  let noteBody = String(payload.noteBody || '').trim();
  const author = String(payload.author || 'Sarah').trim() || 'Sarah';

  if (!noteBody && !payload.photoBase64) {
    throw new Error('Add typed notes and/or a photo of your paper notes.');
  }

  const folder = DriveApp.getFolderById(folderId);
  let photoFileId = '';
  let photoUrl = '';
  let ocrText = '';
  let photoBlob = null;

  if (payload.photoBase64) {
    const mime = normalizeImageMime_(payload.photoMime || 'image/jpeg');
    if (/heic|heif/i.test(mime) || /\.heic$/i.test(payload.photoName || '')) {
      throw new Error('HEIC photos aren’t supported. Please use JPG or PNG (iPhone: Settings → Camera → Most Compatible).');
    }
    const bytes = decodeBase64Image_(payload.photoBase64);
    photoBlob = Utilities.newBlob(bytes, mime, sanitizeFileName_(payload.photoName || 'note-photo.jpg'));
    const photoFile = folder.createFile(photoBlob);
    photoFile.setName(noteDate + '_' + sanitizeFileName_(title).slice(0, 40) + '_' + photoFile.getName());
    photoFileId = photoFile.getId();
    photoUrl = photoFile.getUrl();

    try {
      ocrText = ocrImageToText_(photoBlob, folderId);
    } catch (err) {
      ocrText = '';
      Logger.log('Owner notes OCR skipped: ' + err);
    }

    // If Sarah only uploaded a photo, use OCR as the note body when empty
    if (!noteBody && ocrText) {
      noteBody = ocrText.trim();
    }
  }

  const summary = makeSummary_(title, withWhom, noteBody, ocrText);
  const docResult = appendNoteToDoc_({
    docId: docId,
    noteDate: noteDate,
    title: title,
    withWhom: withWhom,
    category: category,
    noteBody: noteBody,
    summary: summary,
    ocrText: ocrText,
    photoBlob: photoBlob,
    author: author,
  });

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ensureOwnerNotesSheet_(ss);
  const loggedAt = new Date();
  sheet.appendRow([
    loggedAt,
    noteDate,
    title,
    withWhom,
    category,
    noteBody,
    summary,
    photoFileId,
    photoUrl,
    ocrText,
    docId,
    docResult.docUrl,
    docResult.bookmarkId,
    docResult.bookmarkUrl,
    author,
  ]);

  return {
    ok: true,
    summary: summary,
    docUrl: docResult.docUrl,
    bookmarkUrl: docResult.bookmarkUrl,
    photoUrl: photoUrl,
    hasOcr: !!ocrText,
  };
}

/**
 * List notes for the browse / retrieve UI (newest first).
 * Optional query filters title, summary, with_whom, category, note_body.
 */
function listOwnerNotes(query, limit) {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(ON_PROP_SHEET);
  if (!spreadsheetId) throw new Error('Not configured. Run setupOwnerNotesOnce() first.');

  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(ON_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { notes: [], docUrl: getOwnerDocUrl_() };
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = {};
  headers.forEach(function (h, i) {
    col[h] = i;
  });

  const q = String(query || '')
    .trim()
    .toLowerCase();
  const max = Math.min(Number(limit) || 100, 300);
  const notes = [];

  for (let r = values.length - 1; r >= 1 && notes.length < max; r--) {
    const row = values[r];
    const item = {
      loggedAt: formatTs_(row[col.logged_at]),
      noteDate: formatDateCell_(row[col.note_date]),
      title: String(row[col.title] || ''),
      withWhom: String(row[col.with_whom] || ''),
      category: String(row[col.category] || ''),
      summary: String(row[col.summary] || ''),
      bookmarkUrl: String(row[col.bookmark_url] || ''),
      docUrl: String(row[col.doc_url] || ''),
      photoUrl: String(row[col.photo_url] || ''),
      author: String(row[col.author] || ''),
    };

    if (q) {
      const hay = [item.title, item.withWhom, item.category, item.summary, item.noteDate, item.author]
        .join(' ')
        .toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }
    notes.push(item);
  }

  return { notes: notes, docUrl: getOwnerDocUrl_() };
}

// ─── Google Doc ──────────────────────────────────────────────────────

function appendNoteToDoc_(opts) {
  const doc = DocumentApp.openById(opts.docId);
  const body = doc.getBody();

  // Chronological: newest at top (after title), so Sarah sees latest first
  let insertAt = 1;
  if (body.getNumChildren() === 0) {
    body.appendParagraph('Summerland Farm — Owner Notes').setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('Consultant, agronomist, and advisor conversations — chronological.').setItalic(true);
    insertAt = body.getNumChildren();
  } else {
    // Find first content after title block — insert after a horizontal rule marker if present
    insertAt = 1;
    while (insertAt < body.getNumChildren()) {
      const child = body.getChild(insertAt);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        const t = child.asParagraph().getText();
        if (t.indexOf('Consultant, agronomist') === 0 || child.asParagraph().getHeading() === DocumentApp.ParagraphHeading.TITLE) {
          insertAt++;
          continue;
        }
      }
      break;
    }
  }

  const headingText = opts.noteDate + ' · ' + opts.title;
  const heading = body.insertParagraph(insertAt, headingText);
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  insertAt++;

  const bookmark = doc.addBookmark(doc.newPosition(heading, 0));
  const bookmarkId = bookmark.getId();
  const docUrl = doc.getUrl();
  const bookmarkUrl = docUrl.replace(/\/edit.*$/, '/edit#bookmark=' + bookmarkId);

  const metaBits = [];
  if (opts.withWhom) metaBits.push('With: ' + opts.withWhom);
  if (opts.category) metaBits.push('Category: ' + opts.category);
  if (opts.author) metaBits.push('Logged by: ' + opts.author);
  body.insertParagraph(insertAt++, metaBits.join('  ·  ')).setItalic(true);

  body.insertParagraph(insertAt++, 'Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.insertParagraph(insertAt++, opts.summary || '');

  body.insertParagraph(insertAt++, 'Notes').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.insertParagraph(insertAt++, opts.noteBody || '(photo only — see image / OCR below)');

  if (opts.photoBlob) {
    body.insertParagraph(insertAt++, 'Photo of notes').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    try {
      const img = body.insertImage(insertAt++, opts.photoBlob.copyBlob());
      const maxW = 480;
      if (img.getWidth() > maxW) {
        const scale = maxW / img.getWidth();
        img.setWidth(maxW);
        img.setHeight(Math.round(img.getHeight() * scale));
      }
    } catch (err) {
      body.insertParagraph(insertAt++, '[Photo saved to Drive but could not embed: ' + err + ']');
    }
  }

  if (opts.ocrText && String(opts.ocrText).trim()) {
    body.insertParagraph(insertAt++, 'Text from photo (OCR)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.insertParagraph(insertAt++, String(opts.ocrText).trim());
  }

  body.insertParagraph(insertAt++, '—').setForegroundColor('#9aab9e');
  doc.saveAndClose();

  return {
    docUrl: docUrl,
    bookmarkId: bookmarkId,
    bookmarkUrl: bookmarkUrl,
  };
}

function makeSummary_(title, withWhom, noteBody, ocrText) {
  const source = String(noteBody || ocrText || '').replace(/\s+/g, ' ').trim();
  let core = '';
  if (source) {
    core = firstSentences_(source, 300);
    if (!core) core = source.slice(0, 280) + (source.length > 280 ? '…' : '');
  } else {
    core = 'Photo note saved (no extractable text yet).';
  }
  const who = withWhom ? ' (' + withWhom + ')' : '';
  return title + who + ' — ' + core;
}

/** First 1–2 sentences, capped — no lookbehind (Apps Script safe). */
function firstSentences_(text, maxLen) {
  let out = '';
  let sentences = 0;
  for (let i = 0; i < text.length && sentences < 2 && out.length < maxLen; i++) {
    const ch = text.charAt(i);
    out += ch;
    if ((ch === '.' || ch === '!' || ch === '?') && (i === text.length - 1 || /\s/.test(text.charAt(i + 1)))) {
      sentences++;
    }
  }
  if (out.length >= maxLen && text.length > maxLen) out = out.replace(/\s+\S*$/, '') + '…';
  return out.trim();
}

// ─── Setup ───────────────────────────────────────────────────────────

/**
 * One-time setup. Edit IDs below, then run setupOwnerNotesOnce from the editor.
 */
function setupOwnerNotesOnce() {
  setupOwnerNotesPipeline({
    spreadsheetId: 'PASTE_MASTER_SHEET_ID',
    folderId: 'PASTE_FOLDER_ID', // Summerland Farm Operations folder (or a Notes subfolder)
  });
}

function setupOwnerNotesPipeline(config) {
  config = config || {};
  if (!config.spreadsheetId || config.spreadsheetId.indexOf('PASTE_') === 0) {
    throw new Error('Set spreadsheetId to your Summerland Farm Operations sheet ID.');
  }

  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(config.spreadsheetId);
  ensureOwnerNotesSheet_(ss);

  let folder;
  if (config.folderId && config.folderId.indexOf('PASTE_') !== 0) {
    folder = DriveApp.getFolderById(config.folderId);
  } else {
    folder = DriveApp.createFolder('Owner Note Photos');
  }

  // Subfolder for note photos
  let photoFolder = null;
  const kids = folder.getFoldersByName('Owner Note Photos');
  photoFolder = kids.hasNext() ? kids.next() : folder.createFolder('Owner Note Photos');

  // Master chronological Google Doc
  let docId = props.getProperty(ON_PROP_DOC);
  let doc;
  if (docId) {
    try {
      doc = DocumentApp.openById(docId);
    } catch (e) {
      doc = null;
    }
  }
  if (!doc) {
    doc = DocumentApp.create('Summerland Farm — Owner Notes');
    doc.getBody().clear();
    doc.getBody().appendParagraph('Summerland Farm — Owner Notes').setHeading(DocumentApp.ParagraphHeading.TITLE);
    doc
      .getBody()
      .appendParagraph('Consultant, agronomist, and advisor conversations — chronological.')
      .setItalic(true);
    doc.saveAndClose();
    docId = doc.getId();
    const docFile = DriveApp.getFileById(docId);
    folder.addFile(docFile);
    try {
      DriveApp.getRootFolder().removeFile(docFile);
    } catch (e) {
      // ignore if already only in folder
    }
  }

  props.setProperty(ON_PROP_SHEET, ss.getId());
  props.setProperty(ON_PROP_FOLDER, photoFolder.getId());
  props.setProperty(ON_PROP_DOC, docId);

  Logger.log('Owner Notes ready.');
  Logger.log('Sheet tab: ' + ON_SHEET);
  Logger.log('Doc: ' + DocumentApp.openById(docId).getUrl());
  Logger.log('Photo folder: ' + photoFolder.getUrl());
  return {
    spreadsheetId: ss.getId(),
    folderId: photoFolder.getId(),
    docId: docId,
    docUrl: DocumentApp.openById(docId).getUrl(),
  };
}

function ensureOwnerNotesSheet_(ss) {
  let sheet = ss.getSheetByName(ON_SHEET);
  if (!sheet) sheet = ss.insertSheet(ON_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ON_HEADERS.length).setValues([ON_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, ON_HEADERS.length).setFontWeight('bold').setBackground('#e8f0e8');
  } else {
    // Ensure header row matches if sheet was created empty elsewhere
    const existing = sheet.getRange(1, 1, 1, ON_HEADERS.length).getValues()[0];
    if (!existing[0]) {
      sheet.getRange(1, 1, 1, ON_HEADERS.length).setValues([ON_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, ON_HEADERS.length).setFontWeight('bold').setBackground('#e8f0e8');
    }
  }
  return sheet;
}

function getOwnerDocUrl_() {
  const docId = PropertiesService.getScriptProperties().getProperty(ON_PROP_DOC);
  if (!docId) return '';
  try {
    return DocumentApp.openById(docId).getUrl();
  } catch (e) {
    return '';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function decodeBase64Image_(base64Data) {
  const cleaned = String(base64Data).replace(/^data:[^;]+;base64,/, '');
  return Utilities.base64Decode(cleaned);
}

function normalizeImageMime_(mime) {
  const m = String(mime || 'image/jpeg').toLowerCase();
  if (m.indexOf('png') >= 0) return 'image/png';
  if (m.indexOf('webp') >= 0) return 'image/webp';
  if (m.indexOf('gif') >= 0) return 'image/gif';
  return 'image/jpeg';
}

function sanitizeFileName_(name) {
  return String(name || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80);
}

function formatTs_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, 'America/Los_Angeles', 'MMM d, yyyy h:mm a');
  }
  return String(v);
}

function formatDateCell_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, 'America/Los_Angeles', 'yyyy-MM-dd');
  }
  return String(v);
}

/**
 * Drive OCR (same approach as bin_receipt_scanner) — free, converts image → temp Doc → text.
 */
function ocrImageToText_(blob, folderId) {
  const imageMime = blob.getContentType() || 'image/jpeg';
  const metadata = {
    title: 'ocr_owner_note_' + Date.now(),
    mimeType: imageMime,
    parents: [{ id: folderId }],
  };
  const boundary = 'owner_note_ocr_' + Date.now();
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
      throw new Error('Drive OCR rate limit — try again in a minute, or type the notes.');
    }
    throw new Error('Drive OCR failed (' + code + '): ' + body);
  }

  const created = JSON.parse(response.getContentText());
  const tempDocId = created.id;
  const text = DocumentApp.openById(tempDocId).getBody().getText();
  DriveApp.getFileById(tempDocId).setTrashed(true);
  return text || '';
}
