import test from "node:test";
import assert from "node:assert/strict";

import { buildSheetRows, parseSheetReviewRows } from "../src/google-sheets-sync.js";

test("buildSheetRows maps queue items into the expected sheet columns", () => {
  const [row] = buildSheetRows([
    {
      id: "tema-1",
      createdAt: "2026-04-02T18:00:00.000Z",
      updatedAt: "2026-04-02T18:05:00.000Z",
      niche: "inovacao",
      format: "carrossel-instagram",
      formatLabel: "Carrossel",
      title: "Tema 1",
      hook: "Hook",
      angle: "Angle",
      innovationClose: "Close",
      caption: "Legenda",
      sourceTitle: "Fonte original",
      sourceLink: "https://example.com",
      sourceName: "Exame",
      query: "\"ia\" debate",
      reviewDecision: "pending",
      reviewNotes: "",
      scores: {
        totalScore: 17.5
      }
    }
  ]);

  assert.equal(row.length, 17);
  assert.equal(row[0], "tema-1");
  assert.equal(row[3], "inovacao");
  assert.equal(row[4], "Carrossel");
  assert.equal(row[14], "pending");
  assert.equal(row[16], "17.5");
});

test("parseSheetReviewRows normalizes review decisions edited in the sheet", () => {
  const items = parseSheetReviewRows([
    ["id", "created_at", "updated_at", "niche", "format", "title", "hook", "angle", "innovation_close", "caption", "source_title", "source_link", "source_name", "query", "review_decision", "review_notes", "score_total"],
    ["tema-1", "", "", "", "", "", "", "", "", "", "", "", "", "", "aprovado", "ok para postar", ""],
    ["tema-2", "", "", "", "", "", "", "", "", "", "", "", "", "", "rejected", "nao encaixa", ""]
  ]);

  assert.deepEqual(items, [
    {
      id: "tema-1",
      reviewDecision: "approved",
      reviewNotes: "ok para postar"
    },
    {
      id: "tema-2",
      reviewDecision: "rejected",
      reviewNotes: "nao encaixa"
    }
  ]);
});
