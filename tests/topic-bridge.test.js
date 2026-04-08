import test from "node:test";
import assert from "node:assert/strict";

import { buildCentralThemeBridge } from "../src/topic-bridge.js";

test("buildCentralThemeBridge connects military AI topics to innovation through power and infrastructure", () => {
  const bridge = buildCentralThemeBridge({
    title: "Inteligencia artificial e poder militar: EUA vs China",
    snippet: "A disputa por defesa, soberania tecnologica e capacidade industrial se intensifica.",
    query: "\"inteligencia artificial\" eua china",
    source: "example.com"
  }, "inovacao");

  assert.equal(bridge.primaryAxis, "poder");
  assert.match(bridge.whyItMatters, /vantagem estratégica|soberania tecnológica|vantagem estrategica|soberania tecnologica/i);
  assert.match(bridge.innovationType, /infraestrutura de poder/i);
});

test("buildCentralThemeBridge connects pricing disputes to innovation through monetization", () => {
  const bridge = buildCentralThemeBridge({
    title: "Amazon fixa taxa extra para vendedores",
    snippet: "Comissao, margem e dependencia de marketplace entram em debate.",
    query: "\"amazon\" taxa vendedores",
    source: "example.com"
  }, "inovacao");

  assert.equal(bridge.primaryAxis, "monetizacao");
  assert.match(bridge.whyItMatters, /margem|captura de valor|plataforma/i);
});

test("buildCentralThemeBridge exposes a cross-theme bridge when a secondary theme is provided", () => {
  const bridge = buildCentralThemeBridge({
    title: "IA acelera a guerra por atenção nas marcas",
    snippet: "Plataformas e creators disputam distribuição, linguagem e relevância.",
    query: "\"ia\" creators",
    source: "example.com",
    secondaryTheme: "Neymar"
  }, "inovacao", { secondaryTheme: "Neymar" });

  assert.equal(bridge.secondaryTheme, "Neymar");
  assert.match(bridge.crossThemeBridge, /Neymar/);
});
