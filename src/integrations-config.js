export const GOOGLE_SHEETS_CONFIG = {
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1z3zgq0BgJcXrC7q0yVtL6AiWxJM9SrqNyGq13-AqXlg",
  sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || "review_queue",
  serviceAccountPath: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PATH || "/Users/luisoliveira/Downloads/robotic-epoch-476719-h8-3e07fd8444df.json",
  spreadsheetUrl: process.env.GOOGLE_SHEETS_SPREADSHEET_URL || "https://docs.google.com/spreadsheets/d/1z3zgq0BgJcXrC7q0yVtL6AiWxJM9SrqNyGq13-AqXlg/edit?usp=sharing"
};
