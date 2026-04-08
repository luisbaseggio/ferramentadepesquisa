import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { createReviewQueueRepository } from "../src/review-queue.js";

test("review queue stores drafts and preserves decisions on upsert", async () => {
  const filePath = path.join(os.tmpdir(), `review-queue-${Date.now()}.json`);
  let tick = 0;
  const repository = createReviewQueueRepository({
    outputFile: filePath,
    now: () => `2026-04-02T18:00:0${tick += 1}.000Z`
  });

  const firstQueue = await repository.upsertBatch({
    generatedAt: "2026-04-02T18:00:00.000Z",
    drafts: [
      {
        id: "tema-1",
        sourceLink: "https://example.com/1",
        title: "Tema 1"
      }
    ]
  });

  assert.equal(firstQueue.items.length, 1);

  await repository.decide("tema-1", "approved", "faz sentido");

  const secondQueue = await repository.upsertBatch({
    generatedAt: "2026-04-02T18:05:00.000Z",
    drafts: [
      {
        id: "tema-1",
        sourceLink: "https://example.com/1",
        title: "Tema 1 atualizado"
      }
    ]
  });

  assert.equal(secondQueue.items.length, 1);
  assert.equal(secondQueue.items[0].reviewDecision, "approved");
  assert.equal(secondQueue.items[0].title, "Tema 1 atualizado");
});

test("review queue imports decisions edited outside the app", async () => {
  const filePath = path.join(os.tmpdir(), `review-queue-import-${Date.now()}.json`);
  let tick = 0;
  const repository = createReviewQueueRepository({
    outputFile: filePath,
    now: () => `2026-04-02T19:00:0${tick += 1}.000Z`
  });

  await repository.upsertBatch({
    generatedAt: "2026-04-02T19:00:00.000Z",
    drafts: [
      {
        id: "tema-externo",
        sourceLink: "https://example.com/externo",
        title: "Tema externo"
      }
    ]
  });

  const merged = await repository.mergeExternalReviews([
    {
      id: "tema-externo",
      reviewDecision: "approved",
      reviewNotes: "validado na planilha"
    }
  ]);

  assert.equal(merged.items[0].reviewDecision, "approved");
  assert.equal(merged.items[0].reviewNotes, "validado na planilha");
});

test("review queue keeps the same source in different formats as separate items", async () => {
  const filePath = path.join(os.tmpdir(), `review-queue-formats-${Date.now()}.json`);
  let tick = 0;
  const repository = createReviewQueueRepository({
    outputFile: filePath,
    now: () => `2026-04-02T19:05:0${tick += 1}.000Z`
  });

  const queue = await repository.upsertBatch({
    generatedAt: "2026-04-02T19:05:00.000Z",
    drafts: [
      {
        id: "tema-1-carrossel-instagram-1",
        sourceLink: "https://example.com/mesma-noticia",
        format: "carrossel-instagram",
        title: "Tema 1 em carrossel"
      },
      {
        id: "tema-1-thread-x-1",
        sourceLink: "https://example.com/mesma-noticia",
        format: "thread-x",
        title: "Tema 1 em thread"
      }
    ]
  });

  assert.equal(queue.items.length, 2);
  assert.deepEqual(
    queue.items.map((item) => item.format).sort(),
    ["carrossel-instagram", "thread-x"]
  );
});

test("review queue can be cleared", async () => {
  const filePath = path.join(os.tmpdir(), `review-queue-clear-${Date.now()}.json`);
  const repository = createReviewQueueRepository({
    outputFile: filePath,
    now: () => "2026-04-02T19:10:00.000Z"
  });

  await repository.upsertBatch({
    generatedAt: "2026-04-02T19:00:00.000Z",
    drafts: [
      {
        id: "tema-clear",
        sourceLink: "https://example.com/clear",
        title: "Tema para limpar"
      }
    ]
  });

  const cleared = await repository.clear();

  assert.equal(cleared.items.length, 0);
});
