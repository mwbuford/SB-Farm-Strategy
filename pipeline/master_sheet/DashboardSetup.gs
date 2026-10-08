/**
 * Owner Dashboard for Sarah — avocado-first.
 *
 * SETUP:
 *   1. Paste into Apps Script on "Summerland Farm Operations".
 *   2. Run createOwnerDashboard() once.
 *   3. Reload → open DASHBOARD.
 *
 * Switch avocado years via menu: Summerland Dashboard → Avocado year.
 * Switch exotics fruit-chart year via: Summerland Dashboard → Exotics year.
 *
 * Re-run createOwnerDashboard() to rebuild layout/charts.
 */

const DASH_TAB = 'DASHBOARD';
/** Selected avocado browse year (hidden helper). */
const DASH_YEAR_CELL = 'Z1';
/** Selected exotics browse year (hidden helper). */
const DASH_EXOTICS_YEAR_CELL = 'Z3';
/** Row showing available avocado years (highlight = menu selection). */
const DASH_YEAR_BTN_ROW = 14;
const DASH_YEAR_BTN_START_COL = 2; // B
/** Exotics year pills. */
const DASH_EXOTICS_YEAR_BTN_ROW = 152;
const DASH_EXOTICS_YEAR_BTN_START_COL = 2; // B
/** Fresh Facts Hass market prices tab (paste from hass_organic_prices_for_sheet.csv). */
const MARKET_TAB = 'Market_Avo_FreshFacts';

/**
 * Main entry — builds the owner dashboard tab.
 */
function createOwnerDashboard() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
    );

  let dash = ss.getSheetByName(DASH_TAB);
  if (dash) ss.deleteSheet(dash);
  dash = ss.insertSheet(DASH_TAB, 0);

  dash.setHiddenGridlines(true);
  dash.setTabColor('#2d5a3d');

  dash.setColumnWidth(1, 24);
  for (let c = 2; c <= 9; c++) dash.setColumnWidth(c, 118);
  dash.setColumnWidth(10, 24);

  const years = getAvocadoYears_(ss);
  const thisYear = years.length ? years[years.length - 1] : new Date().getFullYear();
  const exoticYears = getExoticYears_(ss);
  const exoticThisYear = exoticYears.length ? exoticYears[exoticYears.length - 1] : thisYear;

  // Selected years default to latest available
  dash.getRange(DASH_YEAR_CELL).setValue(thisYear);
  dash.getRange(DASH_EXOTICS_YEAR_CELL).setValue(exoticThisYear);

  buildDashTitle_(dash);
  buildThisYearHero_(dash, ss, thisYear);
  buildOpsFinanceStrip_(dash, ss, thisYear);
  buildYearButtonRow_(dash, years, thisYear);
  buildSelectedYearPanel_(dash, ss);
  buildYoyComparison_(dash, ss);
  buildAvocadoChartsSection_(dash);
  buildBlockYearlySection_(dash, ss);
  buildLaborWeeklySection_(dash, ss);
  buildMarketPricesSection_(dash, ss);
  buildExoticsSection_(dash, ss, exoticYears, exoticThisYear);
  ensureDashHelperColumns_(dash);
  buildChartDataTables_(dash);
  insertDashboardCharts_(dash);
  buildDashFooter_(dash, ss);

  // Hide helper chart/source columns (K → end)
  dash.hideColumns(11, dash.getMaxColumns() - 10);

  installDashboardMenu_();

  dash.setActiveSelection('B2');
  SpreadsheetApp.flush();
  Logger.log('Dashboard created. This year=' + thisYear + ' years=' + years.join(','));
  return ss.getUrl();
}

/** Ensure columns through BB (54) exist for hidden chart / market / labor / exotics helpers. */
function ensureDashHelperColumns_(dash) {
  const need = 54; // BB
  const have = dash.getMaxColumns();
  if (have < need) {
    dash.insertColumnsAfter(have, need - have);
  }
}

// ─── Years ───────────────────────────────────────────────────────────

function getAvocadoYears_(ss) {
  const sheet = ss.getSheetByName('metrics_grower_yearly');
  if (!sheet) return [new Date().getFullYear()];
  const vals = sheet.getRange(2, 1, Math.max(sheet.getLastRow(), 2), 1).getValues();
  const years = [];
  const seen = {};
  for (let i = 0; i < vals.length; i++) {
    const y = Number(vals[i][0]);
    if (y > 2000 && y < 2100 && !seen[y]) {
      seen[y] = true;
      years.push(y);
    }
  }
  years.sort(function (a, b) {
    return a - b;
  });
  return years.length ? years : [new Date().getFullYear()];
}

/** Years present in exotics_sales_summary (auto-grows when new year tabs sync). */
function getExoticYears_(ss) {
  const sheet = ss.getSheetByName('exotics_sales_summary');
  if (!sheet) return [new Date().getFullYear()];
  const vals = sheet.getRange(2, 1, Math.max(sheet.getLastRow(), 2), 1).getValues();
  const years = [];
  const seen = {};
  for (let i = 0; i < vals.length; i++) {
    const y = Number(vals[i][0]);
    if (y > 2000 && y < 2100 && !seen[y]) {
      seen[y] = true;
      years.push(y);
    }
  }
  years.sort(function (a, b) {
    return a - b;
  });
  return years.length ? years : [new Date().getFullYear()];
}

/**
 * Set avocado browse year + restyle year highlight. Called from menu wrappers.
 */
function dashSetYear_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(DASH_TAB);
  if (!dash) return;
  const y = Number(year);
  if (!(y > 2000)) return;
  dash.getRange(DASH_YEAR_CELL).setValue(y);
  styleYearButtons_(dash, getAvocadoYears_(ss), y);
  try {
    SpreadsheetApp.getActive().toast('Avocado year → ' + y, 'Dashboard', 3);
  } catch (err) {
    // toast may fail under simple triggers — ignore
  }
}

/** Set exotics fruit-chart year. */
function dashSetExoticYear_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(DASH_TAB);
  if (!dash) return;
  const y = Number(year);
  if (!(y > 2000)) return;
  dash.getRange(DASH_EXOTICS_YEAR_CELL).setValue(y);
  styleExoticYearButtons_(dash, getExoticYears_(ss), y);
  try {
    SpreadsheetApp.getActive().toast('Exotics year → ' + y, 'Dashboard', 3);
  } catch (err) {
    // ignore
  }
}

/** Menu / button wrappers — one per plausible year. */
function dashYear_2021() {
  dashSetYear_(2021);
}
function dashYear_2022() {
  dashSetYear_(2022);
}
function dashYear_2023() {
  dashSetYear_(2023);
}
function dashYear_2024() {
  dashSetYear_(2024);
}
function dashYear_2025() {
  dashSetYear_(2025);
}
function dashYear_2026() {
  dashSetYear_(2026);
}
function dashYear_2027() {
  dashSetYear_(2027);
}
function dashYear_2028() {
  dashSetYear_(2028);
}
function dashJumpThisYear() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const years = getAvocadoYears_(ss);
  dashSetYear_(years[years.length - 1]);
}

function exoticYear_2021() {
  dashSetExoticYear_(2021);
}
function exoticYear_2022() {
  dashSetExoticYear_(2022);
}
function exoticYear_2023() {
  dashSetExoticYear_(2023);
}
function exoticYear_2024() {
  dashSetExoticYear_(2024);
}
function exoticYear_2025() {
  dashSetExoticYear_(2025);
}
function exoticYear_2026() {
  dashSetExoticYear_(2026);
}
function exoticYear_2027() {
  dashSetExoticYear_(2027);
}
function exoticYear_2028() {
  dashSetExoticYear_(2028);
}
function exoticJumpThisYear() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const years = getExoticYears_(ss);
  dashSetExoticYear_(years[years.length - 1]);
}

// ─── Title ───────────────────────────────────────────────────────────

function buildDashTitle_(dash) {
  dash.getRange('B2').setValue('SUMMERLAND FARM').setFontSize(22).setFontWeight('bold').setFontColor('#1a3d2b');
  dash.getRange('B3').setValue('Avocado — one-page executive summary').setFontSize(13).setFontColor('#5a6b5e');
  dash.getRange('B4')
    .setFormula('="Updated "&TEXT(NOW(),"MMM d, yyyy h:mm AM/PM")&"  ·  Menu: Summerland Dashboard → Avocado year"')
    .setFontSize(10)
    .setFontColor('#8a9a8e');
  dash.setRowHeight(2, 34);
  dash.setRowHeight(5, 12);
}

// ─── This-year hero (always current / max year — never changes on browse) ─

function buildThisYearHero_(dash, ss, thisYear) {
  dash.getRange('B6:I6').merge();
  dash
    .getRange('B6')
    .setValue('THIS YEAR  ·  ' + thisYear + '   ★')
    .setFontSize(12)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#2d5a3d')
    .setVerticalAlignment('middle');
  dash.setRowHeight(6, 28);

  const labels = [
    ['B7', 'REVENUE (NET)'],
    ['D7', 'LBS HARVESTED'],
    ['F7', 'AVG $/LB (GROSS)'],
    ['H7', 'BINS PICKED'],
  ];
  labels.forEach(function (x) {
    dash
      .getRange(x[0])
      .setValue(x[1])
      .setFontSize(9)
      .setFontWeight('bold')
      .setFontColor('#5a6b5e')
      .setBackground('#e8f0e8');
  });
  dash.getRange('C7').setBackground('#e8f0e8');
  dash.getRange('E7').setBackground('#e8f0e8');
  dash.getRange('G7').setBackground('#e8f0e8');
  dash.getRange('I7').setBackground('#e8f0e8');

  if (ss.getSheetByName('metrics_grower_yearly')) {
    // Locked to thisYear literal so browsing past years never moves the hero
    const y = thisYear;
    dash.getRange('B8').setFormula('=IFERROR(INDEX(metrics_grower_yearly!H:H,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")');
    dash.getRange('D8').setFormula('=IFERROR(INDEX(metrics_grower_yearly!E:E,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")');
    dash.getRange('F8').setFormula('=IFERROR(INDEX(metrics_grower_yearly!F:F,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")');
    dash.getRange('H8').setFormula('=IFERROR(INDEX(metrics_grower_yearly!I:I,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")');
    dash.getRange('B9').setFormula(
      '=IFERROR("Gross "&TEXT(INDEX(metrics_grower_yearly!G:G,MATCH(' +
        y +
        ',metrics_grower_yearly!A:A,0)),"$#,##0")' +
        '&"  ·  #1 "&TEXT(INDEX(metrics_grower_yearly!B:B,MATCH(' +
        y +
        ',metrics_grower_yearly!A:A,0)),"#,##0")&" lbs","")'
    );
  }

  dash.getRange('B8').setFontSize(26).setFontWeight('bold').setFontColor('#1a3d2b').setNumberFormat('$#,##0');
  dash.getRange('D8').setFontSize(26).setFontWeight('bold').setFontColor('#1a3d2b').setNumberFormat('#,##0');
  dash.getRange('F8').setFontSize(26).setFontWeight('bold').setFontColor('#1a3d2b').setNumberFormat('$0.00');
  dash.getRange('H8').setFontSize(26).setFontWeight('bold').setFontColor('#1a3d2b').setNumberFormat('#,##0');
  dash.getRange('B9:I9').setFontSize(10).setFontColor('#5a6b5e');
  dash.setRowHeight(8, 44);
  dash.setRowHeight(10, 10);

  dash.getRange('B6:I9').setBorder(true, true, true, true, false, false, '#2d5a3d', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/**
 * Operational + financial strip under the hero (this year).
 * Weekly harvest / bins · labor cost — block detail is yearly only (below).
 */
function buildOpsFinanceStrip_(dash, ss, thisYear) {
  dash.getRange('B10').setValue('THIS WEEK · BINS PICKED').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#eef2ef');
  dash.getRange('C10').setBackground('#eef2ef');
  dash.getRange('D10').setValue('THIS WEEK · HARVEST BINS').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#eef2ef');
  dash.getRange('E10').setBackground('#eef2ef');
  dash.getRange('F10').setValue('LABOR COST (YEAR)').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#eef2ef');
  dash.getRange('G10').setBackground('#eef2ef');
  dash.getRange('H10').setValue('GROSS REVENUE').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#eef2ef');
  dash.getRange('I10').setBackground('#eef2ef');

  if (ss.getSheetByName('metrics_pickups')) {
    dash.getRange('B11').setFormula(
      '=IFERROR(SUMIF(metrics_pickups!A2:A,MAX(metrics_pickups!A2:A),metrics_pickups!E2:E),"")'
    );
  }
  if (ss.getSheetByName('metrics_avocado')) {
    dash.getRange('D11').setFormula(
      '=IFERROR(SUMIF(metrics_avocado!A2:A,MAX(metrics_avocado!A2:A),metrics_avocado!C2:C),"")'
    );
  } else if (ss.getSheetByName('metrics_pickups')) {
    dash.getRange('D11').setFormula('=B11');
  }
  if (ss.getSheetByName('metrics_labor')) {
    dash.getRange('F11').setFormula(
      '=IFERROR(SUMPRODUCT((YEAR(metrics_labor!A2:A)=' + thisYear + ')*(metrics_labor!D2:D)),"")'
    );
  }
  if (ss.getSheetByName('metrics_grower_yearly')) {
    dash.getRange('H11').setFormula(
      '=IFERROR(INDEX(metrics_grower_yearly!G:G,MATCH(' + thisYear + ',metrics_grower_yearly!A:A,0)),"")'
    );
  }

  dash.getRange('B11').setFontSize(16).setFontWeight('bold').setNumberFormat('#,##0');
  dash.getRange('D11').setFontSize(16).setFontWeight('bold').setNumberFormat('#,##0.0');
  dash.getRange('F11').setFontSize(16).setFontWeight('bold').setNumberFormat('$#,##0');
  dash.getRange('H11').setFontSize(16).setFontWeight('bold').setNumberFormat('$#,##0');
  dash.setRowHeight(11, 30);
}

// ─── Year button row ─────────────────────────────────────────────────

function buildYearButtonRow_(dash, years, selectedYear) {
  dash.getRange('B12').setValue('PAST YEARS').setFontSize(10).setFontWeight('bold').setFontColor('#5a6b5e');
  dash.getRange('B13')
    .setValue('Switch year: menu Summerland Dashboard → Avocado year  ·  this-year card above stays put')
    .setFontSize(9)
    .setFontColor('#8a9a8e');

  dash.getRange('Z2').setValue(JSON.stringify(years));

  const startCol = DASH_YEAR_BTN_START_COL;
  for (let i = 0; i < years.length && i < 8; i++) {
    const col = startCol + i;
    dash.getRange(DASH_YEAR_BTN_ROW, col).setValue(years[i]);
    dash.setColumnWidth(col, Math.max(dash.getColumnWidth(col), 72));
  }
  if (years.length < 8) {
    dash.getRange(DASH_YEAR_BTN_ROW, startCol + years.length, DASH_YEAR_BTN_ROW, startCol + 7).clearContent();
  }

  styleYearButtons_(dash, years, selectedYear);

  dash.getRange('B15')
    .setValue('Green = this year · orange = year you’re viewing (from the menu)')
    .setFontSize(8)
    .setFontColor('#8a9a8e');
  dash.setRowHeight(DASH_YEAR_BTN_ROW, 36);
}

function styleYearButtons_(dash, years, selectedYear) {
  const thisYear = years.length ? years[years.length - 1] : selectedYear;
  const startCol = DASH_YEAR_BTN_START_COL;
  for (let i = 0; i < 8; i++) {
    const cell = dash.getRange(DASH_YEAR_BTN_ROW, startCol + i);
    const y = years[i];
    if (y == null) {
      cell.clearFormat().clearContent();
      continue;
    }
    cell
      .setValue(y)
      .setFontSize(y === thisYear ? 16 : 13)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setNumberFormat('0');

    if (y === selectedYear && y === thisYear) {
      cell.setBackground('#2d5a3d').setFontColor('#ffffff');
    } else if (y === selectedYear) {
      cell.setBackground('#c4783a').setFontColor('#ffffff'); // browsing a past year
    } else if (y === thisYear) {
      cell.setBackground('#b8d4be').setFontColor('#1a3d2b');
    } else {
      cell.setBackground('#eef2ef').setFontColor('#3d4f42');
    }
    cell.setBorder(true, true, true, true, false, false, '#9aab9e', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ─── Selected-year detail panel ──────────────────────────────────────

function buildSelectedYearPanel_(dash, ss) {
  dash.getRange('B17').setFormula('="Viewing "&' + DASH_YEAR_CELL).setFontSize(12).setFontWeight('bold').setFontColor('#1a3d2b');
  dash.getRange('D17').setFormula(
    '=IF(' +
      DASH_YEAR_CELL +
      '=MAX(metrics_grower_yearly!A:A),"← same as this year","year-over-year below")'
  ).setFontSize(9).setFontColor('#8a9a8e');

  // Viewing panel avg label
  const hdr = [
    ['B18', 'REVENUE (NET)'],
    ['D18', 'LBS'],
    ['F18', 'AVG $/LB (GROSS)'],
    ['H18', 'BINS'],
  ];
  hdr.forEach(function (x) {
    dash.getRange(x[0]).setValue(x[1]).setFontSize(9).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#f3ebe3');
  });
  dash.getRange('C18').setBackground('#f3ebe3');
  dash.getRange('E18').setBackground('#f3ebe3');
  dash.getRange('G18').setBackground('#f3ebe3');
  dash.getRange('I18').setBackground('#f3ebe3');

  if (ss.getSheetByName('metrics_grower_yearly')) {
    dash.getRange('B19').setFormula('=IFERROR(INDEX(metrics_grower_yearly!H:H,MATCH(' + DASH_YEAR_CELL + ',metrics_grower_yearly!A:A,0)),"")');
    dash.getRange('D19').setFormula('=IFERROR(INDEX(metrics_grower_yearly!E:E,MATCH(' + DASH_YEAR_CELL + ',metrics_grower_yearly!A:A,0)),"")');
    dash.getRange('F19').setFormula('=IFERROR(INDEX(metrics_grower_yearly!F:F,MATCH(' + DASH_YEAR_CELL + ',metrics_grower_yearly!A:A,0)),"")');
    dash.getRange('H19').setFormula('=IFERROR(INDEX(metrics_grower_yearly!I:I,MATCH(' + DASH_YEAR_CELL + ',metrics_grower_yearly!A:A,0)),"")');
  }

  dash.getRange('B19').setFontSize(18).setFontWeight('bold').setNumberFormat('$#,##0');
  dash.getRange('D19').setFontSize(18).setFontWeight('bold').setNumberFormat('#,##0');
  dash.getRange('F19').setFontSize(18).setFontWeight('bold').setNumberFormat('$0.00');
  dash.getRange('H19').setFontSize(18).setFontWeight('bold').setNumberFormat('#,##0');
  dash.setRowHeight(19, 34);
}

/** YoY comparison for the selected browse year vs prior. */
function buildYoyComparison_(dash, ss) {
  dash.getRange('B21').setValue('YEAR-OVER-YEAR').setFontSize(10).setFontWeight('bold').setFontColor('#1a3d2b');
  dash.getRange('B22:E22').setValues([['Metric', 'This view', 'Prior year', 'Δ']]);
  dash.getRange('B22:E22').setFontWeight('bold').setFontSize(9).setBackground('#e8f0e8').setFontColor('#5a6b5e');

  if (!ss.getSheetByName('metrics_grower_yearly')) return;

  const y = DASH_YEAR_CELL;
  // Net
  dash.getRange('B23').setValue('Revenue (net)');
  dash.getRange('C23').setFormula('=IFERROR(INDEX(metrics_grower_yearly!H:H,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")').setNumberFormat('$#,##0');
  dash.getRange('D23').setFormula('=IFERROR(INDEX(metrics_grower_yearly!H:H,MATCH(' + y + '-1,metrics_grower_yearly!A:A,0)),"")').setNumberFormat('$#,##0');
  dash.getRange('E23').setFormula('=IFERROR(C23-D23,"")').setNumberFormat('+$#,##0;-$#,##0');
  // Lbs
  dash.getRange('B24').setValue('Lbs harvested');
  dash.getRange('C24').setFormula('=IFERROR(INDEX(metrics_grower_yearly!E:E,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")').setNumberFormat('#,##0');
  dash.getRange('D24').setFormula('=IFERROR(INDEX(metrics_grower_yearly!E:E,MATCH(' + y + '-1,metrics_grower_yearly!A:A,0)),"")').setNumberFormat('#,##0');
  dash.getRange('E24').setFormula('=IFERROR(C24-D24,"")').setNumberFormat('+#,##0;-#,##0');
  // Bins
  dash.getRange('B25').setValue('Bins picked');
  dash.getRange('C25').setFormula('=IFERROR(INDEX(metrics_grower_yearly!I:I,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")').setNumberFormat('#,##0');
  dash.getRange('D25').setFormula('=IFERROR(INDEX(metrics_grower_yearly!I:I,MATCH(' + y + '-1,metrics_grower_yearly!A:A,0)),"")').setNumberFormat('#,##0');
  dash.getRange('E25').setFormula('=IFERROR(C25-D25,"")').setNumberFormat('+#,##0;-#,##0');
  // $/lb
  dash.getRange('B26').setValue('Avg $/lb (gross)');
  dash.getRange('C26').setFormula('=IFERROR(INDEX(metrics_grower_yearly!F:F,MATCH(' + y + ',metrics_grower_yearly!A:A,0)),"")').setNumberFormat('$0.00');
  dash.getRange('D26').setFormula('=IFERROR(INDEX(metrics_grower_yearly!F:F,MATCH(' + y + '-1,metrics_grower_yearly!A:A,0)),"")').setNumberFormat('$0.00');
  dash.getRange('E26').setFormula('=IFERROR(C26-D26,"")').setNumberFormat('+$0.00;-$0.00');

  // Labor YoY for selected year (financial KPI) — weekly detail below
  if (ss.getSheetByName('metrics_labor')) {
    dash.getRange('G21').setFormula('="LABOR · "&' + y).setFontSize(10).setFontWeight('bold').setFontColor('#1a3d2b');
    dash.getRange('G22').setValue('Cost').setFontSize(9).setFontWeight('bold').setBackground('#e8f0e8');
    dash.getRange('H22').setValue('Hours').setFontSize(9).setFontWeight('bold').setBackground('#e8f0e8');
    dash.getRange('G23').setFormula(
      '=IFERROR(SUMPRODUCT((YEAR(metrics_labor!A2:A)=' + y + ')*(metrics_labor!D2:D)),"")'
    ).setNumberFormat('$#,##0').setFontWeight('bold').setFontSize(14);
    dash.getRange('H23').setFormula(
      '=IFERROR(SUMPRODUCT((YEAR(metrics_labor!A2:A)=' + y + ')*(metrics_labor!C2:C)),"")'
    ).setNumberFormat('#,##0.0').setFontWeight('bold').setFontSize(14);
    dash.getRange('G24').setFormula(
      '=IFERROR("vs prior: "&TEXT(G23-SUMPRODUCT((YEAR(metrics_labor!A2:A)=' + y + '-1)*(metrics_labor!D2:D)),"+$#,##0;-$#,##0"),"")'
    ).setFontSize(9).setFontColor('#5a6b5e');
    dash.getRange('G25')
      .setValue('Weekly cost ↓')
      .setFontSize(8)
      .setFontColor('#8a9a8e');
  }
}

// ─── Avocado charts labels ───────────────────────────────────────────

function buildAvocadoChartsSection_(dash) {
  dash.getRange('B28').setValue('HISTORICAL TRENDS — NET $ BY YEAR').setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  dash.getRange('F28').setFormula('="GRADE MIX · "&' + DASH_YEAR_CELL).setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  dash.getRange('B43').setValue('WEEKLY HARVEST / BINS PICKED').setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  // Block chart sits beside the yearly table (row 58+), not beside weekly bins
  dash.getRange('F58').setFormula('="BLOCK PERFORMANCE (YEARLY) · "&' + DASH_YEAR_CELL).setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
}

/**
 * Yearly block production table (selected year only — no weekly block view).
 */
function buildBlockYearlySection_(dash, ss) {
  dash.getRange('B58').setValue('BLOCK PERFORMANCE — YEARLY ONLY').setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  dash.getRange('B59')
    .setValue('$/lb (gross) matches AVG $/LB above (gross ÷ lbs). Net $ is after charges. Drill-down: grower_statements.')
    .setFontSize(9)
    .setFontColor('#8a9a8e');

  dash.getRange('B60:F60').setValues([['Block', 'Bins', 'Lbs', 'Net $', '$/lb (gross)']]);
  dash.getRange('B60:F60').setFontWeight('bold').setFontSize(9).setBackground('#e8f0e8').setFontColor('#5a6b5e');

  // Spill yearly block rollup for selected year (from grower_statements)
  // $/lb = gross ÷ lbs in the same QUERY (avoids VLOOKUP #REF! on spilled helpers)
  if (ss.getSheetByName('grower_statements')) {
    dash.getRange('B61').setFormula(
      '=IFERROR(QUERY({' +
        'ARRAYFORMULA(IF(grower_statements!E2:E="","",YEAR(grower_statements!E2:E))),' +
        'grower_statements!G2:G,' +
        'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!I2:I))),' +
        'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!M2:M))),' +
        'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!P2:P))),' +
        'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!N2:N)))' +
        '},"select Col2, sum(Col3), sum(Col4), sum(Col5), sum(Col6)/sum(Col4) where Col1 = "&' +
        DASH_YEAR_CELL +
        '&" and Col2 is not null and Col4 is not null group by Col2 order by sum(Col5) desc ' +
        'label sum(Col3) \'\', sum(Col4) \'\', sum(Col5) \'\', sum(Col6)/sum(Col4) \'\'",0),"")'
    );
    dash.getRange('C61:C80').setNumberFormat('#,##0');
    dash.getRange('D61:D80').setNumberFormat('#,##0');
    dash.getRange('E61:E80').setNumberFormat('$#,##0');
    dash.getRange('F61:F80').setNumberFormat('$0.00');
  } else {
    dash.getRange('B61').setValue('(Add grower_statements to see yearly block performance)');
  }
}

/**
 * Total labor cost (and hours) by week for the selected avocado year.
 * Source: metrics_labor (week × activity rolled up to week).
 * Starts at row 90 so the block table (~14 rows from 61) has room above.
 */
function buildLaborWeeklySection_(dash, ss) {
  dash.getRange('B90').setFormula(
    '="LABOR COST BY WEEK · "&' + DASH_YEAR_CELL
  ).setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  dash.getRange('B91')
    .setValue('Total est. cost per week (all activities) · rate from metrics_labor!$I$1 · switch year via menu')
    .setFontSize(9)
    .setFontColor('#8a9a8e');

  dash.getRange('B92:D92').setValues([['Week', 'Labor $', 'Hours']]);
  dash.getRange('B92:D92').setFontWeight('bold').setFontSize(9).setBackground('#e8f0e8').setFontColor('#5a6b5e');

  if (ss.getSheetByName('metrics_labor')) {
    dash.getRange('B93').setFormula(
      '=IFERROR(QUERY(metrics_labor!A2:D,' +
        '"select A, sum(D), sum(C) where A is not null and year(A) = "&' +
        DASH_YEAR_CELL +
        '&" group by A order by A label sum(D) \'\', sum(C) \'\'",0),"")'
    );
    dash.getRange('B93:B120').setNumberFormat('M/d/yy');
    dash.getRange('C93:C120').setNumberFormat('$#,##0');
    dash.getRange('D93:D120').setNumberFormat('#,##0.0');
  } else {
    dash.getRange('B93').setValue('(Add metrics_labor to see weekly labor cost)');
  }

  dash.getRange('F90').setFormula(
    '="WEEKLY LABOR $ · "&' + DASH_YEAR_CELL
  ).setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
}

// ─── Exotics below ───────────────────────────────────────────────────

/**
 * Fresh Facts Hass mid-price market trend (from Market_Avo_FreshFacts).
 */
function buildMarketPricesSection_(dash, ss) {
  dash.getRange('B110:I110').merge();
  dash
    .getRange('B110')
    .setValue('MARKET — HASS $/LB (FRESH FACTS)')
    .setFontSize(12)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#3d5a80')
    .setVerticalAlignment('middle');
  dash.setRowHeight(110, 28);

  dash.getRange('B111')
    .setValue('hass_mid over time by size · source: Market_Avo_FreshFacts')
    .setFontSize(9)
    .setFontColor('#8a9a8e');

  dash.getRange('B112').setValue('LATEST · SIZE 48').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#e8eef4');
  dash.getRange('C112').setBackground('#e8eef4');
  dash.getRange('D112').setValue('LATEST · SIZE 60').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#e8eef4');
  dash.getRange('E112').setBackground('#e8eef4');
  dash.getRange('F112').setValue('LATEST · SIZE 70').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#e8eef4');
  dash.getRange('G112').setBackground('#e8eef4');
  dash.getRange('H112').setValue('REPORTS').setFontSize(8).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#e8eef4');
  dash.getRange('I112').setBackground('#e8eef4');

  if (ss.getSheetByName(MARKET_TAB)) {
    // Latest hass_mid for key sizes (max report_date)
    dash.getRange('B113').setFormula(
      '=IFERROR(INDEX(FILTER(' +
        MARKET_TAB +
        '!E2:E,' +
        MARKET_TAB +
        '!A2:A=MAX(' +
        MARKET_TAB +
        '!A2:A),' +
        MARKET_TAB +
        '!B2:B=48),1),"")'
    );
    dash.getRange('D113').setFormula(
      '=IFERROR(INDEX(FILTER(' +
        MARKET_TAB +
        '!E2:E,' +
        MARKET_TAB +
        '!A2:A=MAX(' +
        MARKET_TAB +
        '!A2:A),' +
        MARKET_TAB +
        '!B2:B=60),1),"")'
    );
    dash.getRange('F113').setFormula(
      '=IFERROR(INDEX(FILTER(' +
        MARKET_TAB +
        '!E2:E,' +
        MARKET_TAB +
        '!A2:A=MAX(' +
        MARKET_TAB +
        '!A2:A),' +
        MARKET_TAB +
        '!B2:B=70),1),"")'
    );
    dash.getRange('H113').setFormula(
      '=IFERROR(COUNTA(UNIQUE(FILTER(' + MARKET_TAB + '!A2:A,' + MARKET_TAB + '!A2:A<>""))),"")'
    );
  } else {
    dash.getRange('B113').setValue('(Add Market_Avo_FreshFacts tab)');
  }

  dash.getRange('B113').setFontSize(18).setFontWeight('bold').setNumberFormat('$0.00');
  dash.getRange('D113').setFontSize(18).setFontWeight('bold').setNumberFormat('$0.00');
  dash.getRange('F113').setFontSize(18).setFontWeight('bold').setNumberFormat('$0.00');
  dash.getRange('H113').setFontSize(18).setFontWeight('bold').setNumberFormat('#,##0');

  dash.getRange('B131').setValue('HASS MID $/LB OVER TIME').setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
}

function buildExoticsSection_(dash, ss, exoticYears, exoticSelectedYear) {
  exoticYears = exoticYears || getExoticYears_(ss);
  exoticSelectedYear =
    exoticSelectedYear || (exoticYears.length ? exoticYears[exoticYears.length - 1] : new Date().getFullYear());

  dash.getRange('B130:I130').merge();
  dash
    .getRange('B130')
    .setValue('EXOTICS & PASSIONFRUIT')
    .setFontSize(12)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#8b6914')
    .setVerticalAlignment('middle');
  dash.setRowHeight(130, 28);

  dash.getRange('B131').setValue('PASSIONFRUIT $ (all years)').setFontSize(9).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#f5f0e6');
  dash.getRange('C131').setBackground('#f5f0e6');
  dash.getRange('D131').setValue('EXOTICS TOTAL $').setFontSize(9).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#f5f0e6');
  dash.getRange('E131').setBackground('#f5f0e6');
  dash.getRange('F131').setValue('PASSIONFRUIT LBS').setFontSize(9).setFontWeight('bold').setFontColor('#5a6b5e').setBackground('#f5f0e6');
  dash.getRange('G131').setBackground('#f5f0e6');

  if (ss.getSheetByName('exotics_sales_summary')) {
    dash.getRange('B132').setFormula(
      '=IFERROR(SUM(FILTER(exotics_sales_summary!D2:D,REGEXMATCH(exotics_sales_summary!B2:B,"(?i)passion"))),"")'
    );
    dash.getRange('D132').setFormula(
      '=IFERROR(SUM(FILTER(exotics_sales_summary!D2:D,exotics_sales_summary!B2:B<>"",exotics_sales_summary!B2:B<>"Avocados")),"")'
    );
    dash.getRange('F132').setFormula(
      '=IFERROR(SUM(FILTER(exotics_sales_summary!C2:C,REGEXMATCH(exotics_sales_summary!B2:B,"(?i)passion"))),"")'
    );
  }
  dash.getRange('B132').setFontSize(18).setFontWeight('bold').setNumberFormat('$#,##0');
  dash.getRange('D132').setFontSize(18).setFontWeight('bold').setNumberFormat('$#,##0');
  dash.getRange('F132').setFontSize(18).setFontWeight('bold').setNumberFormat('#,##0');

  dash.getRange('B134').setValue('PASSIONFRUIT REVENUE BY YEAR').setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  dash.getRange('F134').setValue('EXOTICS BY PRODUCT (ALL YEARS)').setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');

  // Year-picker + fruit sales chart (replaces the long table)
  dash.getRange('B150').setFormula('="FRUIT SALES · "&' + DASH_EXOTICS_YEAR_CELL).setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  dash.getRange('B151')
    .setValue('Switch year: menu Summerland Dashboard → Exotics year  ·  chart updates to that year’s fruit $')
    .setFontSize(9)
    .setFontColor('#8a9a8e');

  dash.getRange('Z4').setValue(JSON.stringify(exoticYears));
  const startCol = DASH_EXOTICS_YEAR_BTN_START_COL;
  for (let i = 0; i < exoticYears.length && i < 8; i++) {
    dash.getRange(DASH_EXOTICS_YEAR_BTN_ROW, startCol + i).setValue(exoticYears[i]);
    dash.setColumnWidth(startCol + i, Math.max(dash.getColumnWidth(startCol + i), 72));
  }
  if (exoticYears.length < 8) {
    dash
      .getRange(
        DASH_EXOTICS_YEAR_BTN_ROW,
        startCol + exoticYears.length,
        DASH_EXOTICS_YEAR_BTN_ROW,
        startCol + 7
      )
      .clearContent();
  }
  styleExoticYearButtons_(dash, exoticYears, exoticSelectedYear);
  dash.setRowHeight(DASH_EXOTICS_YEAR_BTN_ROW, 36);

  // Total sales $ for the selected exotics year (below fruit chart)
  dash.getRange('B169').setFormula('="TOTAL SALES · "&' + DASH_EXOTICS_YEAR_CELL)
    .setFontSize(9)
    .setFontWeight('bold')
    .setFontColor('#5a6b5e')
    .setBackground('#f5f0e6');
  dash.getRange('C169').setBackground('#f5f0e6');
  if (ss.getSheetByName('exotics_sales_summary')) {
    dash.getRange('B170').setFormula(
      '=IFERROR(SUMIFS(exotics_sales_summary!D2:D,exotics_sales_summary!A2:A,' +
        DASH_EXOTICS_YEAR_CELL +
        ',exotics_sales_summary!B2:B,"<>Avocados"),"")'
    );
  }
  dash.getRange('B170').setFontSize(26).setFontWeight('bold').setFontColor('#1a3d2b').setNumberFormat('$#,##0');
  dash.setRowHeight(170, 40);
}

function styleExoticYearButtons_(dash, years, selectedYear) {
  const thisYear = years.length ? years[years.length - 1] : selectedYear;
  const startCol = DASH_EXOTICS_YEAR_BTN_START_COL;
  for (let i = 0; i < 8; i++) {
    const cell = dash.getRange(DASH_EXOTICS_YEAR_BTN_ROW, startCol + i);
    const y = years[i];
    if (y == null) {
      cell.clearFormat().clearContent();
      continue;
    }
    cell
      .setValue(y)
      .setFontSize(y === thisYear ? 16 : 13)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setNumberFormat('0');

    if (y === selectedYear && y === thisYear) {
      cell.setBackground('#8b6914').setFontColor('#ffffff');
    } else if (y === selectedYear) {
      cell.setBackground('#c4783a').setFontColor('#ffffff');
    } else if (y === thisYear) {
      cell.setBackground('#e8d5a8').setFontColor('#5a4010');
    } else {
      cell.setBackground('#f5f0e6').setFontColor('#5a4a30');
    }
    cell.setBorder(true, true, true, true, false, false, '#c4b89a', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ─── Chart source tables (hidden cols K+) ────────────────────────────

function buildChartDataTables_(dash) {
  dash.getRange('K1').setValue('chart_avocado_year');
  dash.getRange('K2:M2').setValues([['year', 'net_$', 'lbs']]);
  dash.getRange('K3').setFormula(
    '=IFERROR(QUERY(metrics_grower_yearly!A2:H,"select A, H, E where A is not null order by A",0),"")'
  );

  // Grade mix for SELECTED year
  dash.getRange('AA1').setValue('chart_grade_mix');
  dash.getRange('AA2:AB2').setValues([['grade', 'lbs']]);
  dash.getRange('AA3').setFormula(
    '=IFERROR({' +
      '{"Grade #1",INDEX(metrics_grower_yearly!B:B,MATCH(' +
      DASH_YEAR_CELL +
      ',metrics_grower_yearly!A:A,0))};' +
      '{"Grade #2",INDEX(metrics_grower_yearly!C:C,MATCH(' +
      DASH_YEAR_CELL +
      ',metrics_grower_yearly!A:A,0))};' +
      '{"Culls",INDEX(metrics_grower_yearly!D:D,MATCH(' +
      DASH_YEAR_CELL +
      ',metrics_grower_yearly!A:A,0))}' +
      '},"")'
  );

  // Lbs by year (for second avocado chart)
  dash.getRange('AC1').setValue('chart_avocado_lbs');
  dash.getRange('AC2:AD2').setValues([['year', 'lbs']]);
  dash.getRange('AC3').setFormula(
    '=IFERROR(QUERY(metrics_grower_yearly!A2:E,"select A, E where A is not null order by A",0),"")'
  );

  dash.getRange('O1').setValue('chart_passion_year');
  dash.getRange('O2:P2').setValues([['year', 'revenue']]);
  // Passion types: Red/Yellow/Mix/Passionfruit — REGEXMATCH filter then QUERY (matches() was blanking the chart)
  dash.getRange('O3').setFormula(
    '=IFERROR(QUERY({' +
      'ARRAYFORMULA(IF((exotics_sales_summary!A2:A="")+(IFERROR(REGEXMATCH(exotics_sales_summary!B2:B,"(?i)passion"),FALSE)=FALSE),"",exotics_sales_summary!A2:A)),' +
      'ARRAYFORMULA(IF((exotics_sales_summary!A2:A="")+(IFERROR(REGEXMATCH(exotics_sales_summary!B2:B,"(?i)passion"),FALSE)=FALSE),"",N(exotics_sales_summary!D2:D)))' +
      '},"select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) \'\'",0),"")'
  );

  dash.getRange('R1').setValue('chart_exotics_product');
  dash.getRange('R2:S2').setValues([['product', 'revenue']]);
  dash.getRange('R3').setFormula(
    '=IFERROR(QUERY(exotics_sales_summary!A2:D,' +
      '"select B, sum(D) where B is not null and B != \'Avocados\' ' +
      'group by B order by sum(D) desc label sum(D) \'\'",0),"")'
  );

  // Fruit $ for SELECTED exotics year (menu / pills)
  dash.getRange('BA1').setValue('chart_exotics_fruit_year');
  dash.getRange('BA2:BB2').setValues([['fruit', 'revenue']]);
  dash.getRange('BA3').setFormula(
    '=IFERROR(QUERY(exotics_sales_summary!A2:D,' +
      '"select B, sum(D) where A = "&' +
      DASH_EXOTICS_YEAR_CELL +
      '&" and B is not null and B != \'Avocados\' group by B order by sum(D) desc label sum(D) \'\'",0),"")'
  );

  // Weekly bins: raw dates in AE:AF, text labels in X:Y so the chart axis shows M/d/yy
  dash.getRange('AE1').setValue('chart_weekly_bins_raw');
  dash.getRange('AE2:AF2').setValues([['week_raw', 'bins']]);
  dash.getRange('AE3').setFormula(
    '=IFERROR(QUERY(metrics_pickups!A2:E,"select A, sum(E) where A is not null group by A order by A label sum(E) \'\'",0),"")'
  );
  dash.getRange('AE3:AE100').setNumberFormat('M/d/yyyy');

  dash.getRange('X1').setValue('chart_weekly_bins');
  dash.getRange('X2:Y2').setValues([['week', 'bins']]);
  dash.getRange('X3').setFormula(
    '=IFERROR(ARRAYFORMULA(IF(AE3:AE="","",TEXT(AE3:AE,"M/d/yy"))),"")'
  );
  dash.getRange('Y3').setFormula(
    '=IFERROR(ARRAYFORMULA(IF(AE3:AE="","",AF3:AF)),"")'
  );

  // Block net $ for selected year (yearly only) — chart source
  dash.getRange('AG1').setValue('chart_block_yearly');
  dash.getRange('AG2:AH2').setValues([['block', 'net_$']]);
  dash.getRange('AG3').setFormula(
    '=IFERROR(QUERY({' +
      'ARRAYFORMULA(IF(grower_statements!E2:E="","",YEAR(grower_statements!E2:E))),' +
      'grower_statements!G2:G,' +
      'ARRAYFORMULA(IF(grower_statements!E2:E="","",N(grower_statements!P2:P)))' +
      '},"select Col2, sum(Col3) where Col1 = "&' +
      DASH_YEAR_CELL +
      '&" and Col2 is not null and Col2 != \'\' group by Col2 order by sum(Col3) desc ' +
      'label sum(Col3) \'\'",0),"")'
  );

  // Hass mid $/lb over time — raw pivot in AL:AP, text dates in AQ:AU for chart axis
  dash.getRange('AL1').setValue('chart_hass_mid_raw');
  dash.getRange('AL2').setFormula(
    '=IFERROR(QUERY(' +
      MARKET_TAB +
      '!A2:E,"select A, avg(E) where (B=48 or B=60 or B=70 or B=84) and A is not null group by A pivot B order by A",0),"")'
  );
  dash.getRange('AQ1').setValue('chart_hass_mid');
  dash.getRange('AQ2:AU2').setValues([['date', '48', '60', '70', '84']]);
  // AL spill row1 = pivot headers (sizes); data starts AL3. Format dates as M/d/yy text.
  dash.getRange('AQ3').setFormula(
    '=IFERROR(ARRAYFORMULA(IF(AL3:AL50="","",IF(ISNUMBER(AL3:AL50),TEXT(AL3:AL50,"M/d/yy"),IFERROR(TEXT(DATEVALUE(AL3:AL50),"M/d/yy"),"")))),"")'
  );
  dash.getRange('AR3').setFormula('=IFERROR(ARRAYFORMULA(IF(AL3:AL50="","",AM3:AM50)),"")');
  dash.getRange('AS3').setFormula('=IFERROR(ARRAYFORMULA(IF(AL3:AL50="","",AN3:AN50)),"")');
  dash.getRange('AT3').setFormula('=IFERROR(ARRAYFORMULA(IF(AL3:AL50="","",AO3:AO50)),"")');
  dash.getRange('AU3').setFormula('=IFERROR(ARRAYFORMULA(IF(AL3:AL50="","",AP3:AP50)),"")');

  // Labor cost by week for SELECTED year — raw dates in AV:AX, text labels in AY:AZ for chart
  dash.getRange('AV1').setValue('chart_labor_week_raw');
  dash.getRange('AV2:AX2').setValues([['week_raw', 'labor_$', 'hours']]);
  dash.getRange('AV3').setFormula(
    '=IFERROR(QUERY(metrics_labor!A2:D,' +
      '"select A, sum(D), sum(C) where A is not null and year(A) = "&' +
      DASH_YEAR_CELL +
      '&" group by A order by A label sum(D) \'\', sum(C) \'\'",0),"")'
  );
  dash.getRange('AV3:AV60').setNumberFormat('M/d/yyyy');

  dash.getRange('AY1').setValue('chart_labor_week');
  dash.getRange('AY2:AZ2').setValues([['week', 'labor_$']]);
  dash.getRange('AY3').setFormula(
    '=IFERROR(ARRAYFORMULA(IF(AV3:AV60="","",TEXT(AV3:AV60,"M/d/yy"))),"")'
  );
  dash.getRange('AZ3').setFormula(
    '=IFERROR(ARRAYFORMULA(IF(AV3:AV60="","",AW3:AW60)),"")'
  );
}

function insertDashboardCharts_(dash) {
  const existing = dash.getCharts();
  for (let i = 0; i < existing.length; i++) dash.removeChart(existing[i]);

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dash.getRange('K2:L20'))
      .setPosition(29, 2, 0, 0)
      .setOption('title', 'Net $ by year (historical)')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#2d5a3d'])
      .setOption('width', 480)
      .setOption('height', 250)
      .setOption('hAxis', { format: '0' })
      .setOption('vAxis', { format: '$#,###' })
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(dash.getRange('AA2:AB5'))
      .setPosition(29, 6, 0, 0)
      .setOption('title', 'Grade mix (selected year)')
      .setOption('colors', ['#2d5a3d', '#7a9e7e', '#c4a574'])
      .setOption('width', 400)
      .setOption('height', 250)
      .setOption('pieHole', 0.4)
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(dash.getRange('X2:Y40'))
      .setPosition(44, 2, 0, 0)
      .setOption('title', 'Weekly bins picked')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#2d5a3d'])
      .setOption('width', 480)
      .setOption('height', 240)
      .setOption('curveType', 'function')
      .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(dash.getRange('AG2:AH20'))
      .setNumHeaders(1)
      .setPosition(59, 6, 0, 0)
      .setOption('title', 'Block net $ (yearly)')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#4a7c59'])
      .setOption('width', 420)
      .setOption('height', 340)
      .setOption('hAxis', { format: '$#,###' })
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dash.getRange('AY2:AZ55'))
      .setNumHeaders(1)
      .setPosition(93, 6, 0, 0)
      .setOption('title', 'Labor $ by week (selected year)')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#3d5a80'])
      .setOption('width', 400)
      .setOption('height', 280)
      .setOption('vAxis', { format: '$#,###' })
      .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(dash.getRange('AQ2:AU50'))
      .setNumHeaders(1)
      .setPosition(116, 2, 0, 0)
      .setOption('title', 'Hass mid $/lb by size (Fresh Facts)')
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', ['#2d5a3d', '#3d5a80', '#c4783a', '#8b6914'])
      .setOption('width', 900)
      .setOption('height', 280)
      .setOption('curveType', 'function')
      .setOption('vAxis', { format: '$0.00', title: '$/lb mid', viewWindow: { min: 0 } })
      .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dash.getRange('O2:P15'))
      .setNumHeaders(1)
      .setPosition(135, 2, 0, 0)
      .setOption('title', 'Passionfruit $ by year')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#c4783a'])
      .setOption('width', 480)
      .setOption('height', 240)
      .setOption('hAxis', { format: '0' })
      .setOption('vAxis', { format: '$#,###' })
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(dash.getRange('R2:S15'))
      .setNumHeaders(1)
      .setPosition(135, 6, 0, 0)
      .setOption('title', 'All exotics by product')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#8b6914'])
      .setOption('width', 400)
      .setOption('height', 240)
      .setOption('hAxis', { format: '$#,###' })
      .build()
  );

  dash.insertChart(
    dash
      .newChart()
      .setChartType(Charts.ChartType.BAR)
      .addRange(dash.getRange('BA2:BB20'))
      .setNumHeaders(1)
      .setPosition(154, 2, 0, 0)
      .setOption('title', 'Fruit sales $ (selected exotics year)')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#8b6914'])
      .setOption('width', 900)
      .setOption('height', 280)
      .setOption('hAxis', { format: '$#,###' })
      .build()
  );
}

function buildDashFooter_(dash, ss) {
  dash.getRange('B174').setValue('DRILL-DOWN — SUPPORTING DATA').setFontWeight('bold').setFontSize(11).setFontColor('#1a3d2b');
  const links = [
    ['Yearly avocado totals', 'metrics_grower_yearly'],
    ['Weekly pickups', 'metrics_pickups'],
    ['Harvest vs pickup', 'metrics_avocado'],
    ['Weekly block returns', 'metrics_block_returns'],
    ['Grower statements', 'grower_statements'],
    ['Labor metrics', 'metrics_labor'],
    ['Hass market prices', MARKET_TAB],
    ['Exotic sales', 'exotics_sales_summary'],
    ['INDEX', 'INDEX'],
  ];
  for (let i = 0; i < links.length; i++) {
    const sheet = ss.getSheetByName(links[i][1]);
    dash.getRange(175 + i, 2).setValue(links[i][0]);
    if (sheet) {
      dash.getRange(175 + i, 3).setFormula('=HYPERLINK("#gid=' + sheet.getSheetId() + '","→ ' + links[i][1] + '")');
    }
  }
  dash
    .getRange('B186')
    .setValue(
      'Exotics fruit chart follows Summerland Dashboard → Exotics year (years come from synced year tabs). ' +
        'Avocado browse year is separate. Rebuild dashboard after adding a new exotics year tab + sync.'
    )
    .setFontSize(9)
    .setFontColor('#8a9a8e')
    .setWrap(true);
  dash.getRange('B186:I186').merge();
}

// ─── Click / menu handling ───────────────────────────────────────────

function installDashboardMenu_() {
  // Menu also rebuilt from PassionfruitImport onOpen when both files are installed.
  try {
    buildDashboardMenu_();
  } catch (e) {
    // Ignore if UI not available (running from editor headless)
  }
}

/** Called from onOpen (PassionfruitImport) and createOwnerDashboard. */
function buildDashboardMenu_() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const years = getAvocadoYears_(ss);
  const exoticYears = getExoticYears_(ss);

  const yearMenu = ui.createMenu('Avocado year');
  years.forEach(function (y) {
    yearMenu.addItem(String(y), 'dashYear_' + y);
  });
  yearMenu.addSeparator().addItem('★ Jump to this year', 'dashJumpThisYear');

  const exoticMenu = ui.createMenu('Exotics year');
  exoticYears.forEach(function (y) {
    exoticMenu.addItem(String(y), 'exoticYear_' + y);
  });
  exoticMenu.addSeparator().addItem('★ Jump to latest', 'exoticJumpThisYear');

  ui.createMenu('Summerland Dashboard')
    .addSubMenu(yearMenu)
    .addSubMenu(exoticMenu)
    .addItem('Rebuild dashboard', 'createOwnerDashboard')
    .addToUi();
}
