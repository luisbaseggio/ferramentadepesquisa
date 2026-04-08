import fs from "node:fs/promises";

import { google } from "googleapis";

const SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"];
const HEADER_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "niche",
  "format",
  "title",
  "hook",
  "angle",
  "innovation_close",
  "caption",
  "source_title",
  "source_link",
  "source_name",
  "query",
  "review_decision",
  "review_notes",
  "score_total"
];
const COLUMN_INDEX = Object.fromEntries(HEADER_COLUMNS.map((column, index) => [column, index]));

function toCell(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

function buildRowValues(item) {
  return [
    toCell(item.id),
    toCell(item.createdAt),
    toCell(item.updatedAt),
    toCell(item.niche),
    toCell(item.formatLabel || item.format || ""),
    toCell(item.title),
    toCell(item.hook),
    toCell(item.angle),
    toCell(item.innovationClose),
    toCell(item.caption),
    toCell(item.sourceTitle),
    toCell(item.sourceLink),
    toCell(item.sourceName),
    toCell(item.query),
    toCell(item.reviewDecision),
    toCell(item.reviewNotes),
    toCell(item.scores?.totalScore ?? "")
  ];
}

export function buildSheetRows(items) {
  return items.map(buildRowValues);
}

function normalizeDecision(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["approved", "aprovado"].includes(normalized)) {
    return "approved";
  }

  if (["rejected", "rejeitado"].includes(normalized)) {
    return "rejected";
  }

  return "pending";
}

export function parseSheetReviewRows(values) {
  return values
    .slice(1)
    .map((row) => ({
      id: String(row[COLUMN_INDEX.id] ?? "").trim(),
      reviewDecision: normalizeDecision(row[COLUMN_INDEX.review_decision]),
      reviewNotes: String(row[COLUMN_INDEX.review_notes] ?? "").trim()
    }))
    .filter((item) => item.id);
}

function indexById(values) {
  const rows = values.slice(1);
  const map = new Map();

  rows.forEach((row, index) => {
    const id = row[0];

    if (id) {
      map.set(id, index + 2);
    }
  });

  return map;
}

async function createSheetsClient(serviceAccountPath) {
  await fs.access(serviceAccountPath);

  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: SHEETS_SCOPE
  });

  const authClient = await auth.getClient();
  return google.sheets({
    version: "v4",
    auth: authClient
  });
}

async function createSheetsClientFromJson(serviceAccountJson) {
  const credentials = JSON.parse(serviceAccountJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SHEETS_SCOPE
  });

  const authClient = await auth.getClient();
  return google.sheets({
    version: "v4",
    auth: authClient
  });
}

async function ensureHeaderRow(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Q1`
  });
  const firstRow = response.data.values?.[0] ?? [];

  if (HEADER_COLUMNS.every((header, index) => firstRow[index] === header)) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:Q1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [HEADER_COLUMNS]
    }
  });
}

function filterSyncableItems(items) {
  return items.filter((item) => ["pending", "approved"].includes(item.reviewDecision));
}

export function createGoogleSheetsReviewSync({
  spreadsheetId,
  sheetName,
  serviceAccountPath,
  serviceAccountJson = ""
}) {
  const configured = Boolean(serviceAccountJson || serviceAccountPath);

  async function getSheetsClient() {
    if (serviceAccountJson) {
      return createSheetsClientFromJson(serviceAccountJson);
    }

    if (serviceAccountPath) {
      return createSheetsClient(serviceAccountPath);
    }

    throw new Error("Google Sheets nao configurado para este ambiente.");
  }

  async function listRows(sheets) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Q`
    });

    return response.data.values ?? [];
  }

  async function getSheetMetadata(sheets) {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const targetSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === sheetName);

    if (!targetSheet?.properties?.sheetId && targetSheet?.properties?.sheetId !== 0) {
      throw new Error(`Nao encontrei a aba ${sheetName} na planilha.`);
    }

    return targetSheet.properties;
  }

  return {
    isConfigured() {
      return configured;
    },
    async syncQueue(queue) {
      const sheets = await getSheetsClient();
      const sheetProperties = await getSheetMetadata(sheets);
      const sheetId = sheetProperties.sheetId;
      await ensureHeaderRow(sheets, spreadsheetId, sheetName);

      const values = await listRows(sheets);
      const rowIndex = indexById(values);
      const syncableItems = filterSyncableItems(queue.items);

      for (const item of syncableItems) {
        const row = buildRowValues(item);
        const rowNumber = rowIndex.get(item.id);

        if (rowNumber) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A${rowNumber}:Q${rowNumber}`,
            valueInputOption: "RAW",
            requestBody: {
              values: [row]
            }
          });
          continue;
        }

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:Q`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: {
            values: [row]
          }
        });
      }

      const refreshedValues = await listRows(sheets);

      for (let index = refreshedValues.length - 1; index >= 1; index -= 1) {
        const row = refreshedValues[index];
        const id = row[0];

        if (!id) {
          continue;
        }

        const item = queue.items.find((entry) => entry.id === id);

        if (!item || !["pending", "approved"].includes(item.reviewDecision)) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId,
                      dimension: "ROWS",
                      startIndex: index,
                      endIndex: index + 1
                    }
                  }
                }
              ]
            }
          });
        }
      }

      return {
        syncedItems: syncableItems.length,
        spreadsheetId,
        sheetName
      };
    },
    async healthcheck() {
      const sheets = await getSheetsClient();
      await getSheetMetadata(sheets);

      return {
        ok: true,
        spreadsheetId,
        sheetName
      };
    },
    async fetchReviews() {
      const sheets = await getSheetsClient();
      await ensureHeaderRow(sheets, spreadsheetId, sheetName);
      const values = await listRows(sheets);

      return {
        spreadsheetId,
        sheetName,
        items: parseSheetReviewRows(values)
      };
    },
    async clearSheet() {
      const sheets = await getSheetsClient();
      await ensureHeaderRow(sheets, spreadsheetId, sheetName);
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A2:Q`
      });

      return {
        cleared: true,
        spreadsheetId,
        sheetName
      };
    }
  };
}
