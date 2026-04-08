import test from "node:test";
import assert from "node:assert/strict";

import {
  createApprovedPromptRewriter,
  extractResponseOutputText
} from "../src/openai-approved-rewriter.js";

test("extractResponseOutputText joins output_text blocks from the response", () => {
  const text = extractResponseOutputText({
    output: [
      {
        content: [
          { type: "output_text", text: "Primeira parte." },
          { type: "ignored", text: "x" }
        ]
      },
      {
        content: [
          { type: "output_text", text: "Segunda parte." }
        ]
      }
    ]
  });

  assert.equal(text, "Primeira parte.\n\nSegunda parte.");
});

test("approved prompt rewriter calls the OpenAI responses API and returns rewritten text", async () => {
  let requestUrl = "";
  let requestOptions = null;

  const rewriter = createApprovedPromptRewriter({
    apiKey: "test-key",
    model: "gpt-5.4-mini",
    apiUrl: "https://api.openai.test/v1/responses",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;

      return {
        ok: true,
        async json() {
          return {
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: "Render final reescrito."
                  }
                ]
              }
            ]
          };
        }
      };
    }
  });

  const result = await rewriter.rewriteApprovedPacket({
    title: "Pauta teste",
    formatLabel: "Carrossel",
    sourceTitle: "Fonte teste",
    finalRender: "Texto atual",
    newsContext: "Texto colado da notícia."
  }, {
    aiPrompt: "Deixe mais curto e mais opinativo.",
    currentRender: "Texto atual",
    newsContext: "Texto colado da notícia."
  });

  assert.equal(requestUrl, "https://api.openai.test/v1/responses");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers.authorization, "Bearer test-key");

  const payload = JSON.parse(requestOptions.body);
  assert.equal(payload.model, "gpt-5.4-mini");
  assert.match(payload.input, /Texto atual/);
  assert.match(payload.input, /Deixe mais curto e mais opinativo/);
  assert.match(payload.input, /Texto colado da notícia/);
  assert.equal(result.rewrittenText, "Render final reescrito.");
});

test("approved prompt rewriter retries when the first rewrite comes back identical", async () => {
  let callCount = 0;

  const rewriter = createApprovedPromptRewriter({
    apiKey: "test-key",
    model: "gpt-5.4-mini",
    apiUrl: "https://api.openai.test/v1/responses",
    fetchImpl: async () => {
      callCount += 1;

      return {
        ok: true,
        async json() {
          return {
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: callCount === 1 ? "Texto atual" : "Texto final realmente reescrito."
                  }
                ]
              }
            ]
          };
        }
      };
    }
  });

  const result = await rewriter.rewriteApprovedPacket({
    title: "Pauta teste",
    formatLabel: "Carrossel",
    sourceTitle: "Fonte teste",
    finalRender: "Texto atual"
  }, {
    aiPrompt: "Reescreva de forma mais forte.",
    currentRender: "Texto atual"
  });

  assert.equal(callCount, 2);
  assert.equal(result.rewrittenText, "Texto final realmente reescrito.");
});
