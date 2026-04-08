import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { createApprovedChannelRepository } from "../src/approved-channel.js";

test("approved channel keeps only approved items and creates markdown packets", async () => {
  const baseDir = path.join(os.tmpdir(), `approved-channel-${Date.now()}`);
  const repository = createApprovedChannelRepository({
    outputFile: path.join(baseDir, "approved-channel.json"),
    markdownDir: path.join(baseDir, "approved-posts"),
    now: () => "2026-04-02T20:00:00.000Z"
  });

  const state = await repository.syncFromReviewQueue({
    items: [
      {
        id: "aprovado-1",
        niche: "big tech",
        title: "Tema aprovado",
        sourceTitle: "Tema aprovado",
        sourceLink: "https://example.com/1",
        sourceName: "Fonte",
        hook: "Se Tema aprovado ja esta dividindo o mercado, quem ignorar a camada de inovacao vai ficar para tras.",
        angle: "Enquadre como atrito de visao de mundo: o que esse caso revela sobre medo de mudanca em big tech?",
        innovationClose: "Feche mostrando que a controversia e, na verdade, um sintoma de inovacao.",
        caption: "Legenda",
        scores: { totalScore: 40, signals: ["tensao"] },
        reviewDecision: "approved",
        reviewNotes: ""
      },
      {
        id: "pendente-1",
        title: "Tema pendente",
        reviewDecision: "pending"
      }
    ]
  });

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].id, "aprovado-1");
  assert.equal(state.updatedAt, "2026-04-02T20:00:00.000Z");
});

test("approved channel updates selected headline and template", async () => {
  const baseDir = path.join(os.tmpdir(), `approved-channel-update-${Date.now()}`);
  const repository = createApprovedChannelRepository({
    outputFile: path.join(baseDir, "approved-channel.json"),
    markdownDir: path.join(baseDir, "approved-posts"),
    now: () => "2026-04-02T20:05:00.000Z"
  });

  await repository.syncFromReviewQueue({
    items: [
      {
        id: "aprovado-2",
        niche: "big tech",
        title: "Tema aprovado 2",
        sourceTitle: "Tema aprovado 2",
        sourceLink: "https://example.com/2",
        sourceName: "Fonte",
        hook: "Se Tema aprovado 2 ja esta dividindo o mercado, quem ignorar a camada de inovacao vai ficar para tras.",
        angle: "Enquadre como atrito de visao de mundo: o que esse caso revela sobre medo de mudanca em big tech?",
        innovationClose: "Feche mostrando que a controversia e, na verdade, um sintoma de inovacao.",
        caption: "Legenda",
        scores: { totalScore: 44, signals: ["tensao"] },
        reviewDecision: "approved",
        reviewNotes: ""
      }
    ]
  });

  const updated = await repository.updatePacket("aprovado-2", {
    selectedHeadlineNumber: 3,
    selectedTemplate: 4,
    evaluationStatus: "strong",
    evaluationScore: 9,
    evaluationNotes: "headline forte e render consistente"
  });

  assert.equal(updated.items[0].selectedHeadlineNumber, 3);
  assert.equal(updated.items[0].selectedTemplate, 4);
  assert.equal(updated.items[0].evaluationStatus, "strong");
  assert.equal(updated.items[0].evaluationScore, 9);
  assert.equal(updated.items[0].evaluationNotes, "headline forte e render consistente");
  assert.equal(updated.items[0].finalRender.split("\n").length, 21);
});

test("approved channel updates manual render and ai prompt", async () => {
  const baseDir = path.join(os.tmpdir(), `approved-channel-manual-${Date.now()}`);
  const repository = createApprovedChannelRepository({
    outputFile: path.join(baseDir, "approved-channel.json"),
    markdownDir: path.join(baseDir, "approved-posts"),
    now: () => "2026-04-02T20:06:00.000Z"
  });

  await repository.syncFromReviewQueue({
    items: [
      {
        id: "aprovado-4",
        niche: "big tech",
        title: "Tema aprovado 4",
        sourceTitle: "Tema aprovado 4",
        sourceLink: "https://example.com/4",
        sourceName: "Fonte",
        hook: "Hook 4",
        angle: "Angle 4",
        innovationClose: "Close 4",
        caption: "Legenda",
        scores: { totalScore: 44, signals: ["tensao"] },
        reviewDecision: "approved",
        reviewNotes: ""
      }
    ]
  });

  const updated = await repository.updatePacket("aprovado-4", {
    manualFinalRender: "texto 1 - versao editada manualmente",
    aiPrompt: "Ajuste para um tom mais direto e polêmico.",
    newsContext: "Trecho colado da notícia com o contexto principal."
  });

  assert.equal(updated.items[0].finalRender, "texto 1 - versao editada manualmente");
  assert.equal(updated.items[0].aiPrompt, "Ajuste para um tom mais direto e polêmico.");
  assert.equal(updated.items[0].newsContext, "Trecho colado da notícia com o contexto principal.");
});

test("approved channel can be cleared", async () => {
  const baseDir = path.join(os.tmpdir(), `approved-channel-clear-${Date.now()}`);
  const repository = createApprovedChannelRepository({
    outputFile: path.join(baseDir, "approved-channel.json"),
    markdownDir: path.join(baseDir, "approved-posts"),
    now: () => "2026-04-02T20:10:00.000Z"
  });

  await repository.syncFromReviewQueue({
    items: [
      {
        id: "aprovado-3",
        niche: "big tech",
        title: "Tema aprovado 3",
        sourceTitle: "Tema aprovado 3",
        sourceLink: "https://example.com/3",
        sourceName: "Fonte",
        hook: "Hook",
        angle: "Angle",
        innovationClose: "Close",
        caption: "Legenda",
        scores: { totalScore: 30, signals: ["tensao"] },
        reviewDecision: "approved",
        reviewNotes: ""
      }
    ]
  });

  const cleared = await repository.clear();

  assert.equal(cleared.items.length, 0);
});
