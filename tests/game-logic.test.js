import test from "node:test";
import assert from "node:assert/strict";

import {
  completeCycle,
  initialState,
  progressRatio,
  restartGame,
  submitStep
} from "../src/web/game-logic.js";

test("initial state starts at the first step", () => {
  const state = initialState({ creatorName: "Russinho", seed: 1 });

  assert.equal(state.currentStep, 0);
  assert.equal(state.score, 0);
  assert.equal(state.creatorName, "Russinho");
});

test("submitStep moves through the loop and closes a cycle", () => {
  let state = initialState({ creatorName: "Russinho", seed: 1 });

  state = submitStep(state, "idea", "Ideia original", 1);
  assert.equal(state.currentStep, 1);
  assert.equal(state.score, 10);
  assert.equal(progressRatio(state), 0.25);

  state = submitStep(state, "angle", "Angulo", 1);
  state = submitStep(state, "hook", "Hook", 1);
  state = submitStep(state, "publish", "CTA", 1);

  assert.equal(state.currentStep, 0);
  assert.equal(state.cycle, 2);
  assert.equal(state.streak, 1);
  assert.equal(state.score, 125);
  assert.equal(state.history.length, 1);
});

test("submitStep rejects invalid order", () => {
  const state = initialState({ seed: 2 });

  assert.throws(() => submitStep(state, "hook", "Pular etapas", 2), /Acao invalida/);
});

test("restartGame resets progress", () => {
  const restarted = restartGame({ creatorName: "Russinho", seed: 4 });

  assert.equal(restarted.currentStep, 0);
  assert.equal(restarted.score, 0);
  assert.equal(restarted.streak, 0);
});

test("completeCycle stores the finished entry", () => {
  const state = {
    ...initialState({ creatorName: "Russinho", seed: 5 }),
    currentStep: 4,
    currentEntry: {
      idea: "Ideia",
      angle: "Angulo",
      hook: "Hook",
      publish: "CTA"
    }
  };

  const completed = completeCycle(state, 5);

  assert.equal(completed.streak, 1);
  assert.equal(completed.cycle, 2);
  assert.equal(completed.score, 50);
  assert.equal(completed.history[0].idea, "Ideia");
});
