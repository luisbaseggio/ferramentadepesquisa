import test from "node:test";
import assert from "node:assert/strict";

import { buildContentMachinePacket } from "../src/content-machine-packets.js";

test("buildContentMachinePacket converts an approved draft into content machine sections", () => {
  const packet = buildContentMachinePacket({
    id: "tema-aprovado",
    niche: "big tech",
    title: "Meta volta à mira do Cade por regras do WhatsApp e IA",
    sourceTitle: "Meta volta à mira do Cade por regras do WhatsApp e IA",
    sourceLink: "https://example.com/meta",
    sourceName: "pipelinevalor",
    hook: "Se Meta volta à mira do Cade por regras do WhatsApp e IA ja esta dividindo o mercado, quem ignorar a camada de inovacao vai ficar para tras.",
    angle: "Enquadre como atrito de visao de mundo: o que esse caso revela sobre medo de mudanca, controle e perda de relevancia em big tech?",
    innovationClose: "Feche mostrando que a controversia e, na verdade, um sintoma de inovacao e mudanca estrutural em big tech: novas ferramentas, novos modelos e novos vencedores.",
    caption: "Legenda do post aprovado.",
    scores: {
      totalScore: 57,
      signals: ["tensao", "inovacao"]
    },
    reviewNotes: "aprovado para o proximo estagio"
  }, {
    selectedHeadlineNumber: 4,
    selectedTemplate: 2
  });

  assert.equal(packet.headlines.length, 10);
  assert.equal(packet.templateOptions.length, 4);
  assert.equal(packet.selectedHeadlineNumber, 4);
  assert.equal(packet.selectedTemplate, 2);
  assert.match(packet.markdown, /Etapa 1/);
  assert.match(packet.finalRender, /texto 1 -/);
  assert.equal(packet.finalRender.split("\n").length, 14);
  assert.equal(packet.outputFileName, "tema-aprovado.md");
});

test("buildContentMachinePacket adapts the final render for reels", () => {
  const packet = buildContentMachinePacket({
    id: "tema-reels",
    niche: "inovacao",
    format: "reels-curto",
    title: "OpenAI entra no centro do debate regulatorio",
    sourceTitle: "OpenAI entra no centro do debate regulatorio",
    sourceLink: "https://example.com/reels",
    sourceName: "Valor",
    hook: "Ignorar esse atrito agora e perder a leitura do proximo ciclo.",
    angle: "Enquadre como disputa de poder entre regulacao e aceleracao de produto.",
    innovationClose: "Feche mostrando que a controversia expõe o novo tabuleiro da inovacao.",
    caption: "Legenda",
    scores: {
      totalScore: 31,
      signals: ["tensao", "inovacao"]
    },
    reviewNotes: ""
  }, {
    selectedHeadlineNumber: 2,
    selectedTemplate: 1
  });

  assert.equal(packet.formatLabel, "Reels");
  assert.match(packet.finalRender, /cena 1 -/);
  assert.equal(packet.templateOptions.length, 4);
});

test("buildContentMachinePacket preserves manual final render and ai prompt", () => {
  const packet = buildContentMachinePacket({
    id: "tema-manual",
    niche: "inovacao",
    title: "Tema manual",
    sourceTitle: "Tema manual",
    sourceLink: "https://example.com/manual",
    sourceName: "Valor",
    hook: "Hook manual",
    angle: "Angle manual",
    innovationClose: "Close manual",
    caption: "Legenda",
    scores: {
      totalScore: 22,
      signals: ["tensao"]
    },
    reviewNotes: ""
  }, {
    selectedHeadlineNumber: 1,
    selectedTemplate: 1,
    manualFinalRender: "bloco 1 - texto editado manualmente",
    aiPrompt: "Deixe o texto mais incisivo e autoral."
  });

  assert.equal(packet.finalRender, "bloco 1 - texto editado manualmente");
  assert.equal(packet.aiPrompt, "Deixe o texto mais incisivo e autoral.");
  assert.match(packet.markdown, /Deixe o texto mais incisivo e autoral/);
});

test("buildContentMachinePacket preserves pasted news context", () => {
  const packet = buildContentMachinePacket({
    id: "tema-contexto",
    niche: "politica",
    title: "Tema com contexto",
    sourceTitle: "Tema com contexto",
    sourceLink: "https://example.com/contexto",
    sourceName: "Fonte",
    hook: "Hook contexto",
    angle: "Angle contexto",
    innovationClose: "Close contexto",
    caption: "Legenda",
    scores: {
      totalScore: 22,
      signals: ["tensao"]
    },
    reviewNotes: ""
  }, {
    newsContext: "Colei aqui a matéria inteira e os pontos principais para reconstruir o texto."
  });

  assert.equal(packet.newsContext, "Colei aqui a matéria inteira e os pontos principais para reconstruir o texto.");
  assert.match(packet.markdown, /Contexto Colado/);
});
