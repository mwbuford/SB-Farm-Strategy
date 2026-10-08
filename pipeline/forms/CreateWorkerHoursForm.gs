/**
 * Create a simple Worker Hours Google Form for Armando.
 *
 * Fields:
 * - Date
 * - Hours worked
 * - Number of workers
 * - What they did
 * - Block worked on
 *
 * Optional: links form responses to an existing spreadsheet.
 *
 * Usage:
 * 1) Open script.google.com, create a new project
 * 2) Paste this file
 * 3) Update CONFIG.spreadsheetId if you want responses linked
 * 4) Run createSimpleWorkerHoursForm()
 * 5) Copy the form URL from logs and send to Armando
 */

const CONFIG = {
  spreadsheetId: '', // optional: master sheet ID
  title: 'Summerland — Worker Hours Log',
  description:
    'Quick daily log: date, total hours, crew size, activity, and block worked on.',
  activities: [
    'Avocado harvest',
    'Irrigation',
    'Pruning',
    'Weed control',
    'Spray / fertilizer',
    'General maintenance',
    'Other',
  ],
  blocks: [
    'Los Osos',
    'L05 0505',
    'L01',
    'L02',
    'Citrus — North',
    'Citrus — South',
    'Passionfruit',
    'Other',
  ],
};

function createSimpleWorkerHoursForm() {
  const form = FormApp.create(CONFIG.title);
  form.setDescription(CONFIG.description);
  form.setAllowResponseEdits(false);
  form.setCollectEmail(false);
  form.setProgressBar(false);

  form
    .addDateItem()
    .setTitle('Date')
    .setRequired(true);

  form
    .addTextItem()
    .setTitle('Hours worked (total)')
    .setHelpText('Example: 7.5')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^\\d+(\\.\\d+)?$')
        .setHelpText('Enter a number like 8 or 7.5')
        .build()
    );

  form
    .addTextItem()
    .setTitle('How many workers')
    .setHelpText('Crew size, e.g. 3')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^\\d+$')
        .setHelpText('Enter a whole number')
        .build()
    );

  form
    .addMultipleChoiceItem()
    .setTitle('What they did')
    .setChoiceValues(CONFIG.activities)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Block worked on')
    .setChoiceValues(CONFIG.blocks)
    .setRequired(true);

  form
    .addParagraphTextItem()
    .setTitle('Notes (optional)')
    .setRequired(false);

  if (CONFIG.spreadsheetId) {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, CONFIG.spreadsheetId);
  }

  Logger.log('Form edit URL: ' + form.getEditUrl());
  Logger.log('Form public URL: ' + form.getPublishedUrl());
  Logger.log('Form ID: ' + form.getId());
}
