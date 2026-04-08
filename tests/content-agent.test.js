import test from "node:test";
import assert from "node:assert/strict";

import { buildContentBatch, buildContentDraft, buildContentDraftFromResearchItem } from "../src/content-agent.js";

test("buildContentDraft converts a brief into a reviewable post draft", () => {
  const draft = buildContentDraft({
    rank: 1,
    title: "Big tech entra em choque com nova regulacao de IA",
    source: "Valor",
    link: "https://example.com/post",
    query: "\"IA\" debate",
    polarizingHook: "Ignorar essa disputa agora e perder a leitura do proximo ciclo.",
    debateAngle: "A narrativa e sobre poder, regra e distribuicao.",
    innovationClose: "Feche com a mudanca estrutural em inovacao.",
    contentBeats: ["Gancho", "Contexto", "Atrito", "Virada", "Fechamento"],
    scores: { totalScore: 18, signals: ["tensao", "inovacao"] }
  }, "inovacao", { createdAt: "2026-04-02T18:00:00.000Z" });

  assert.equal(draft.status, "pending_review");
  assert.equal(draft.slides.length, 5);
  assert.match(draft.caption, /inovacao/i);
  assert.equal(draft.sourceLink, "https://example.com/post");
});

test("buildContentBatch limits the number of drafts", () => {
  const batch = buildContentBatch({
    niche: "inovacao",
    source: "google-news",
    summary: { trackedItems: 8 },
    briefs: [
      {
        rank: 1,
        title: "Tema 1",
        source: "Fonte 1",
        link: "https://example.com/1",
        query: "q1",
        polarizingHook: "Hook 1",
        debateAngle: "Angle 1",
        innovationClose: "Close 1",
        contentBeats: ["a", "b", "c", "d", "e"],
        scores: { totalScore: 14, signals: ["tensao"] }
      },
      {
        rank: 2,
        title: "Tema 2",
        source: "Fonte 2",
        link: "https://example.com/2",
        query: "q2",
        polarizingHook: "Hook 2",
        debateAngle: "Angle 2",
        innovationClose: "Close 2",
        contentBeats: ["a", "b", "c", "d", "e"],
        scores: { totalScore: 12, signals: ["inovacao"] }
      }
    ]
  }, { maxDrafts: 1, createdAt: "2026-04-02T18:00:00.000Z" });

  assert.equal(batch.drafts.length, 1);
  assert.equal(batch.drafts[0].createdAt, "2026-04-02T18:00:00.000Z");
});

test("buildContentBatch prioritizes stronger drafts when quality is weaker in later briefs", () => {
  const batch = buildContentBatch({
    niche: "inovacao",
    source: "google-news",
    summary: { trackedItems: 8 },
    briefs: [
      {
        rank: 1,
        title: "Tema forte",
        source: "Fonte 1",
        link: "https://example.com/forte",
        query: "q1",
        polarizingHook: "Hook forte",
        debateAngle: "Angle forte",
        innovationClose: "Close forte",
        contentBeats: ["a", "b", "c", "d", "e"],
        editorialFrame: {
          formato_sugerido: "carrossel-instagram",
          qualidade: "forte",
          qualityGate: { pass: true, score: 92, issues: [] }
        },
        scores: { totalScore: 18, signals: ["tensao", "inovacao"] }
      },
      {
        rank: 2,
        title: "Tema fraco",
        source: "Fonte 2",
        link: "https://example.com/fraco",
        query: "q2",
        polarizingHook: "Hook fraco",
        debateAngle: "Angle fraco",
        innovationClose: "Close fraco",
        contentBeats: ["a", "b", "c", "d", "e"],
        editorialFrame: {
          formato_sugerido: "carrossel-instagram",
          qualityGate: { pass: false, score: 43, issues: ["capa generica"] }
        },
        scores: { totalScore: 12, signals: ["tensao"] }
      }
    ]
  }, { maxDrafts: 2, createdAt: "2026-04-02T18:00:00.000Z" });

  assert.equal(batch.drafts.length, 1);
  assert.equal(batch.drafts[0].title, "Tema forte");
  assert.equal(batch.filteredOut, 1);
});

test("buildContentDraftFromResearchItem converts a live item into a format-specific draft", () => {
  const draft = buildContentDraftFromResearchItem({
    title: "Startup entra em choque com nova regulacao",
    source: "NeoFeed",
    link: "https://example.com/live",
    query: "\"startup\" regulacao",
    snippet: "Debate envolve produto, mercado e mudanca estrutural.",
    scores: { totalScore: 16, signals: ["tensao", "inovacao"] }
  }, "inovacao", { createdAt: "2026-04-02T18:30:00.000Z", format: "reels-curto" });

  assert.equal(draft.format, "reels-curto");
  assert.equal(draft.formatLabel, "Reels");
  assert.equal(draft.sourceLink, "https://example.com/live");
  assert.ok(draft.scenes.length >= 5);
});

test("buildContentDraft preserves AI generated editorial package", () => {
  const draft = buildContentDraft({
    rank: 1,
    title: "Tema com IA",
    source: "Valor",
    link: "https://example.com/ia-pack",
    query: "q1",
    snippet: "Contexto capturado da notícia.",
    polarizingHook: "Hook preliminar",
    debateAngle: "Angle preliminar",
    innovationClose: "Close preliminar",
    scores: { totalScore: 20, signals: ["tensao", "inovacao"] },
    aiPack: {
      title: "Tema com IA",
      format: "carrossel-instagram",
      triage: {
        Transformacao: "Transformação gerada com IA",
        "Friccao central": "Fricção gerada com IA",
        "Angulo narrativo dominante": "Ângulo gerado com IA",
        "Evidencias do insumo": "A) Evidência 1 B) Evidência 2 C) Evidência 3"
      },
      headlines: Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        line1: `Headline ${index + 1}?`,
        line2: `Âncora ${index + 1}.`
      })),
      selectedHeadlineNumber: 4,
      spine: {
        "Ângulo escolhido": "Ângulo escolhido com IA",
        Hook: "Hook com IA",
        "Fato-base": "Fato-base com IA",
        Mecanismo: "Mecanismo com IA",
        Prova: "Prova com IA",
        Aplicação: "Aplicação com IA",
        Direção: "Direção com IA"
      },
      selectedTemplate: 3,
      generatedFinalRender: "texto 1 - bloco um\ntexto 2 - bloco dois\ntexto 3 - bloco tres\ntexto 4 - bloco quatro\ntexto 5 - bloco cinco\ntexto 6 - bloco seis\ntexto 7 - bloco sete\ntexto 8 - bloco oito\ntexto 9 - bloco nove\ntexto 10 - bloco dez\ntexto 11 - bloco onze\ntexto 12 - bloco doze\ntexto 13 - bloco treze\ntexto 14 - bloco quatorze\ntexto 15 - bloco quinze\ntexto 16 - bloco dezesseis\ntexto 17 - bloco dezessete\ntexto 18 - bloco dezoito",
      editorialFrame: {
        fato_central: "Fato central com IA",
        mudanca_real: "Mudança real com IA",
        sinal_real: "Sinal real com IA",
        tipo_de_mudanca: "mercado",
        mecanismo: "Mecanismo com IA",
        tensao_central: "Tensão com IA",
        ponte_editorial: "Ponte com IA",
        tese_editorial: "Tese com IA",
        direcao_de_conteudo: "carrossel de tese",
        formato_sugerido: "carrossel-instagram",
        angulo_narrativo: "Ângulo narrativo com IA",
        promessa_da_capa: "Promessa da capa com IA",
        provas_do_argumento: ["Prova A", "Prova B", "Prova C"],
        implicacao_para_o_publico: "Implicação com IA",
        consequencia: "Consequência com IA",
        frase_final: "Frase final com IA",
        estrutura_do_carrossel: [],
        qualityGate: { pass: true, score: 94, issues: [] }
      }
    }
  }, "inovacao", { createdAt: "2026-04-02T18:00:00.000Z" });

  assert.equal(draft.generationMode, "openai");
  assert.equal(draft.selectedHeadlineNumber, 4);
  assert.equal(draft.selectedTemplate, 3);
  assert.equal(draft.generatedFinalRenderSnapshot.split("\n").length, 18);
  assert.equal(draft.triageSnapshot.Transformacao, "Transformação gerada com IA");
});
