import test from "node:test";
import assert from "node:assert/strict";

import { createOpenAIContentGenerator } from "../src/openai-content-generator.js";

function buildMockPack() {
  return {
    title: "Pacote gerado",
    format: "carrossel-instagram",
    triage: {
      Transformacao: "Transformação forte",
      "Friccao central": "Fricção real",
      "Angulo narrativo dominante": "Ângulo principal",
      "Evidencias do insumo": "A) Evidência 1 B) Evidência 2 C) Evidência 3"
    },
    headlines: Array.from({ length: 10 }, (_, index) => ({
      number: index + 1,
      line1: `Linha 1 da headline ${index + 1}?`,
      line2: `Linha 2 da headline ${index + 1}.`
    })),
    selectedHeadlineNumber: 2,
    spine: {
      "Ângulo escolhido": "Ângulo escolhido",
      Hook: "Hook forte",
      "Fato-base": "Fato-base",
      Mecanismo: "Mecanismo",
      Prova: "Prova",
      Aplicação: "Aplicação",
      Direção: "Direção"
    },
    selectedTemplate: 2,
    editorialFrame: {
      fato_central: "Fato central",
      mudanca_real: "Mudança real",
      sinal_real: "Sinal real",
      tipo_de_mudanca: "mercado",
      mecanismo: "Mecanismo",
      tensao_central: "Tensão central",
      ponte_editorial: "Ponte editorial",
      tese_editorial: "Tese editorial",
      direcao_de_conteudo: "carrossel de tese",
      formato_sugerido: "carrossel-instagram",
      angulo_narrativo: "Ângulo narrativo",
      promessa_da_capa: "Promessa da capa",
      provas_do_argumento: ["Prova A", "Prova B", "Prova C"],
      implicacao_para_o_publico: "Implicação para o público",
      consequencia: "Consequência",
      frase_final: "Frase final"
    },
    qualityGate: {
      pass: true,
      score: 91,
      issues: []
    },
    renderFinal: "texto 1 - um\ntexto 2 - dois\ntexto 3 - tres\ntexto 4 - quatro\ntexto 5 - cinco\ntexto 6 - seis\ntexto 7 - sete\ntexto 8 - oito\ntexto 9 - nove\ntexto 10 - dez\ntexto 11 - onze\ntexto 12 - doze\ntexto 13 - treze\ntexto 14 - quatorze"
  };
}

test("openai content generator normalizes a generated content pack", async () => {
  let requestPayload = null;
  const generator = createOpenAIContentGenerator({
    apiKey: "test-key",
    model: "gpt-5.4",
    apiUrl: "https://api.openai.test/v1/responses",
    fetchImpl: async (_url, options) => {
      requestPayload = JSON.parse(options.body);

      return {
        ok: true,
        async json() {
          return {
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(buildMockPack())
                  }
                ]
              }
            ]
          };
        }
      };
    }
  });

  const pack = await generator.generateBriefPack({
    title: "Tema",
    source: "Valor",
    link: "https://example.com",
    snippet: "Contexto da matéria.",
    whyNow: "Leitura preliminar.",
    debateAngle: "Ângulo preliminar.",
    whyItMattersToNiche: "Isso importa para IA porque muda a disputa.",
    crossThemeBridge: "Use política como segunda lente desta pauta: o elo mais forte com IA está em poder.",
    innovationClose: "Fechamento preliminar."
  }, "inovacao");

  assert.equal(requestPayload.model, "gpt-5.4");
  assert.match(requestPayload.input, /o começo deve entrar pelo universo da notícia e depois virar para o tema central/i);
  assert.match(requestPayload.input, /Use política como segunda lente desta pauta/i);
  assert.match(requestPayload.input, /storytelling/i);
  assert.match(requestPayload.input, /não pode usar marcadores de bastidor/i);
  assert.match(requestPayload.input, /blocos 1 e 2 devem ser curtos, memoráveis e com força própria/i);
  assert.match(requestPayload.input, /não transforme o carrossel em lista de comentários sobre a notícia/i);
  assert.equal(pack.selectedTemplate, 2);
  assert.equal(pack.headlines.length, 10);
  assert.equal(pack.generatedFinalRender.split("\n").length, 14);
  assert.equal(pack.editorialFrame.tese_editorial, "Tese editorial");
});
