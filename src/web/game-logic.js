const STEP_DEFINITIONS = [
  { key: "idea", label: "Capturar uma ideia bruta" },
  { key: "angle", label: "Definir o angulo da mensagem" },
  { key: "hook", label: "Escrever um gancho forte" },
  { key: "publish", label: "Fechar com CTA e publicar" }
];

const ACTION_REWARDS = {
  idea: 10,
  angle: 15,
  hook: 20,
  publish: 30
};

const BONUS_MESSAGES = [
  "Sua voz ficou mais nitida.",
  "Isso tem cara de conteudo com assinatura propria.",
  "Consistencia vence inspiracao solta.",
  "Voce transformou intuicao em direcao."
];

const MISSIONS = [
  "Poste algo que provoque conversa.",
  "Traga uma opiniao que so voce poderia defender.",
  "Resuma uma ideia complexa em linguagem simples.",
  "Construa autoridade sem perder humanidade."
];

function createRandom(seed) {
  let value = seed % 2147483647;

  if (value <= 0) {
    value += 2147483646;
  }

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pickFromList(list, seed) {
  const random = createRandom(seed);
  const index = Math.floor(random() * list.length);
  return list[index];
}

export function initialState({ creatorName = "Criador", seed = 7 } = {}) {
  return {
    creatorName,
    score: 0,
    streak: 0,
    cycle: 1,
    currentStep: 0,
    mission: pickFromList(MISSIONS, seed),
    completedSteps: [],
    lastMessage: "Sua jornada comeca ao transformar intuicao em conteudo.",
    currentEntry: {
      idea: "",
      angle: "",
      hook: "",
      publish: ""
    },
    history: []
  };
}

export function getStepDefinitions() {
  return STEP_DEFINITIONS.map((step) => ({ ...step }));
}

export function getExpectedStep(state) {
  return STEP_DEFINITIONS[state.currentStep];
}

export function progressRatio(state) {
  return state.currentStep / STEP_DEFINITIONS.length;
}

export function nextBonusMessage(state, seed = 7) {
  return pickFromList(BONUS_MESSAGES, seed + state.score + state.currentStep + state.cycle);
}

export function canSubmit(state, stepKey, content) {
  return getExpectedStep(state).key === stepKey && Boolean(content.trim());
}

export function expectedStepMessage(stepKey) {
  if (stepKey === "idea") {
    return "Ideia capturada.";
  }

  if (stepKey === "angle") {
    return "Angulo definido.";
  }

  if (stepKey === "hook") {
    return "Gancho travado.";
  }

  return "Publicacao concluida.";
}

export function completeCycle(state, seed = 7) {
  const nextCycle = state.cycle + 1;
  const nextStreak = state.streak + 1;

  return {
    ...state,
    score: state.score + 50,
    streak: nextStreak,
    cycle: nextCycle,
    currentStep: 0,
    completedSteps: [],
    lastMessage: `Ciclo fechado. Voce entrou no ciclo ${nextCycle} com ${nextStreak} publicacoes completas. ${nextBonusMessage({ ...state, cycle: nextCycle, streak: nextStreak, score: state.score + 50, currentStep: 0 }, seed)}`,
    mission: pickFromList(MISSIONS, seed + nextCycle + nextStreak),
    currentEntry: {
      idea: "",
      angle: "",
      hook: "",
      publish: ""
    },
    history: [
      ...state.history,
      {
        cycle: String(state.cycle),
        ...state.currentEntry
      }
    ]
  };
}

export function submitStep(state, stepKey, content, seed = 7) {
  if (!canSubmit(state, stepKey, content)) {
    throw new Error("Acao invalida para o momento atual do loop.");
  }

  const nextState = {
    ...state,
    currentStep: state.currentStep + 1,
    score: state.score + ACTION_REWARDS[stepKey],
    completedSteps: [...state.completedSteps, stepKey],
    currentEntry: {
      ...state.currentEntry,
      [stepKey]: content.trim()
    },
    lastMessage: `${expectedStepMessage(stepKey)} ${nextBonusMessage(state, seed)}`
  };

  if (nextState.currentStep >= STEP_DEFINITIONS.length) {
    return completeCycle(nextState, seed);
  }

  return nextState;
}

export function restartGame(options = {}) {
  return initialState(options);
}
