import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditorialAgentOutput,
  buildEditorialBrief,
  rankResearchItems,
  scoreResearchItem
} from "../src/editorial-agent.js";

test("scoreResearchItem boosts controversy and innovation topics", () => {
  const scored = scoreResearchItem({
    title: "Crise em startup de IA reacende debate sobre regulacao",
    snippet: "Mercado reage a pressao sobre plataforma e novas regras.",
    query: "\"inteligencia artificial\" tendencia",
    source: "example.com",
    publishedTime: new Date().toISOString()
  });

  assert.ok(scored.controversyScore >= 4);
  assert.ok(scored.innovationScore >= 4);
  assert.ok(scored.urgencyScore >= 3);
  assert.ok(scored.signals.includes("tensao"));
  assert.ok(scored.signals.includes("inovacao"));
});

test("rankResearchItems prioritizes the strongest editorial tension", () => {
  const ranked = rankResearchItems([
    {
      title: "Guia neutro de produtividade para equipes",
      snippet: "Rotina e gestao de tarefas sem grande tensao.",
      query: "\"produtividade\"",
      source: "example.com"
    },
    {
      title: "Boicote a plataforma de IA vira crise e pressiona o mercado",
      snippet: "Debate sobre regulacao, empresa e inovacao cresce.",
      query: "\"ia\" tendencia",
      source: "example.com",
      publishedTime: new Date().toISOString()
    }
  ]);

  assert.match(ranked[0].title, /Boicote/);
});

test("buildEditorialAgentOutput creates briefs with innovation closing", () => {
  const output = buildEditorialAgentOutput("tecnologia", [
    {
      title: "Tarifa sobre chips amplia disputa global por IA",
      snippet: "Empresas reagem e o setor debate dependencia tecnologica.",
      query: "\"chip\" tendencia",
      source: "example.com",
      link: "https://example.com/chips",
      publishedTime: new Date().toISOString()
    }
  ], { briefCount: 1 });

  assert.equal(output.briefs.length, 1);
  assert.match(output.briefs[0].innovationClose, /inovação|inovacao/i);
  assert.equal(output.briefs[0].rank, 1);
});

test("buildEditorialBrief uses a stronger geopolitical framing for AI and military topics", () => {
  const brief = buildEditorialBrief({
    title: "Inteligencia Artificial e poder militar: EUA vs China",
    snippet: "A disputa por IA entra no centro da corrida por defesa, soberania e capacidade industrial.",
    query: "\"inteligencia artificial\" eua china",
    source: "example.com",
    link: "https://example.com/ia-militar",
    publishedTime: new Date().toISOString()
  }, "inovacao", 0);

  assert.match(brief.whyNow, /poder|estrategic/i);
  assert.match(brief.polarizingHook, /militar|vantagem estrategica/i);
  assert.match(brief.debateAngle, /soberania tecnologica|tabuleiro/i);
  assert.match(brief.innovationClose, /infraestrutura de poder|capacidade industrial/i);
  assert.doesNotMatch(brief.whyNow, /score/i);
});

test("buildEditorialBrief can adapt the brief when a secondary theme is provided", () => {
  const brief = buildEditorialBrief({
    title: "IA vira eixo de disputa por atenção no esporte e nas marcas",
    snippet: "Plataformas, creators e marcas reposicionam linguagem e distribuição.",
    query: "\"ia\" marcas esporte",
    source: "example.com",
    link: "https://example.com/ia-marcas",
    publishedTime: new Date().toISOString(),
    secondaryTheme: "Neymar"
  }, "inovacao", 0);

  assert.match(brief.polarizingHook, /Neymar/i);
  assert.match(brief.debateAngle, /Neymar/i);
  assert.match(brief.crossThemeBridge, /Neymar/i);
});

test("buildEditorialBrief generates different pillars for different regulation stories", () => {
  const first = buildEditorialBrief({
    title: "Amazon fixa taxa extra para vendedores nos EUA",
    snippet: "Comissao, margem e dependencia de plataforma entram em debate.",
    query: "\"amazon\" taxa vendedores",
    source: "example.com",
    link: "https://example.com/amazon",
    publishedTime: new Date().toISOString()
  }, "inovacao", 0);

  const second = buildEditorialBrief({
    title: "Congresso discute nova regra para IA generativa",
    snippet: "Regra, escala e reputacao entram na mesma conversa.",
    query: "\"ia generativa\" congresso",
    source: "example.com",
    link: "https://example.com/ia-regra",
    publishedTime: new Date().toISOString()
  }, "inovacao", 1);

  assert.notEqual(first.whyNow, second.whyNow);
  assert.notEqual(first.polarizingHook, second.polarizingHook);
  assert.notEqual(first.debateAngle, second.debateAngle);
  assert.notEqual(first.innovationClose, second.innovationClose);
});
