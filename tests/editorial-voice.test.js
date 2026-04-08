import test from "node:test";
import assert from "node:assert/strict";

import { resolveEditorialVoice } from "../src/editorial-voice.js";

test("resolveEditorialVoice returns innovation voice by default", () => {
  const voice = resolveEditorialVoice("inovacao");

  assert.equal(voice.id, "inovacao");
  assert.match(voice.markerLine, /inovação|inovacao/i);
});

test("resolveEditorialVoice adapts to branding", () => {
  const voice = resolveEditorialVoice("branding");

  assert.equal(voice.id, "branding");
  assert.match(voice.thesisFrame, /marca|linguagem|percep/i);
});

test("resolveEditorialVoice adapts to politics", () => {
  const voice = resolveEditorialVoice("politica");

  assert.equal(voice.id, "politica");
  assert.match(voice.closingFrame, /autoridade|influência|influencia|legitimidade/i);
});
