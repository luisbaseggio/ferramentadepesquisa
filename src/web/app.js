import {
  getExpectedStep,
  getStepDefinitions,
  initialState,
  progressRatio,
  restartGame,
  submitStep
} from "./game-logic.js";

const STORAGE_KEY = "content-game-web-state";
const app = document.querySelector("[data-app]");

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState() ?? initialState({ creatorName: "Russinho", seed: 7 });

function renderHistory(items) {
  if (items.length === 0) {
    return `<p class="empty">Seu primeiro ciclo completo vai aparecer aqui.</p>`;
  }

  return items
    .slice(-3)
    .reverse()
    .map(
      (item) => `
        <article class="history-card">
          <p class="eyebrow">Ciclo ${item.cycle}</p>
          <h3>${item.idea}</h3>
          <p><strong>Angulo:</strong> ${item.angle}</p>
          <p><strong>Hook:</strong> ${item.hook}</p>
          <p><strong>Fechamento:</strong> ${item.publish}</p>
        </article>
      `
    )
    .join("");
}

function renderSteps(stepDefinitions, currentKey) {
  return stepDefinitions
    .map((step, index) => {
      const isActive = step.key === currentKey;
      const isDone = index < state.currentStep;
      return `
        <li class="step ${isActive ? "step-active" : ""} ${isDone ? "step-done" : ""}">
          <span>${index + 1}</span>
          <div>
            <strong>${step.label}</strong>
            <small>${step.key}</small>
          </div>
        </li>
      `;
    })
    .join("");
}

function render() {
  const stepDefinitions = getStepDefinitions();
  const currentStep = getExpectedStep(state);
  const progressPercent = Math.round(progressRatio(state) * 100);
  const previousCycles = state.history.length;

  app.innerHTML = `
    <main class="shell">
      <nav class="top-nav">
        <a href="/">Studio</a>
        <a href="/live">Ao Vivo</a>
        <a href="/radar">Radar</a>
        <a href="/approved">Aprovados</a>
        <a href="/content-game" class="nav-link-active">Content Game</a>
      </nav>

      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Content Game</p>
          <h1>Afine a voz antes de publicar.</h1>
          <p class="lede">Use este módulo quando o radar já te deu o tema, mas você ainda quer fortalecer opinião, hook e CTA antes da peça final.</p>
          <div class="hero-actions">
            <a class="primary-link" href="/radar">Voltar ao Radar</a>
            <a class="secondary-link" href="/approved">Ver Aprovados</a>
          </div>
        </div>
        <div class="hero-visual">
          <div class="orb orb-a"></div>
          <div class="orb orb-b"></div>
          <div class="visual-panel">
            <span class="visual-kicker">Quando usar</span>
            <strong>Quando a pauta está boa, mas a peça ainda não está afiada.</strong>
            <p>Ele não substitui o radar. Ele serve para treinar a construção do post quando o insight existe, mas a forma ainda está fraca.</p>
          </div>
        </div>
      </section>

      <section class="purpose-grid">
        <article class="purpose-card">
          <span>Use aqui se</span>
          <strong>Você já aprovou o tema, mas ainda não chegou no melhor ângulo.</strong>
          <p>O jogo te força a transformar tema em ideia, ideia em ângulo, ângulo em hook e hook em fechamento.</p>
        </article>
        <article class="purpose-card">
          <span>Evite usar se</span>
          <strong>Você ainda nem sabe se o assunto merece virar conteúdo.</strong>
          <p>Nesse caso, comece no radar e só volte para cá quando a pauta estiver validada.</p>
        </article>
        <article class="purpose-card">
          <span>Objetivo</span>
          <strong>Criar cadência e assinatura própria.</strong>
          <p>Ele funciona como academia criativa: menos pesquisa, mais musculatura narrativa.</p>
        </article>
      </section>

      <section class="scoreboard">
        <div>
          <span>Score</span>
          <strong>${state.score}</strong>
        </div>
        <div>
          <span>Streak</span>
          <strong>${state.streak}</strong>
        </div>
        <div>
          <span>Ciclo</span>
          <strong>${state.cycle}</strong>
        </div>
        <div>
          <span>Etapa</span>
          <strong>${state.currentStep + 1}/${stepDefinitions.length}</strong>
        </div>
        <div>
          <span>Historico</span>
          <strong>${previousCycles}</strong>
        </div>
        <div>
          <span>Progresso</span>
          <strong>${progressPercent}%</strong>
        </div>
      </section>

      <section class="panel panel-grid">
        <div>
          <p class="eyebrow">Missao atual</p>
          <h2>${state.mission}</h2>
          <p class="feedback">${state.lastMessage}</p>
          <div class="progress-track" aria-label="Progresso do ciclo">
            <div class="progress-fill" style="width:${progressPercent}%"></div>
          </div>
          <p class="progress-copy">${progressPercent}% do ciclo concluido</p>
          <ul class="steps">${renderSteps(stepDefinitions, currentStep.key)}</ul>
        </div>

        <form class="composer" data-form>
          <label for="creatorName">Nome criativo</label>
          <input id="creatorName" name="creatorName" maxlength="40" value="${state.creatorName}" />

          <label for="contentInput">${currentStep.label}</label>
          <textarea id="contentInput" name="content" rows="5" placeholder="Escreva aqui o próximo passo da peça..." required></textarea>

          <div class="actions">
            <button type="submit">Concluir etapa</button>
            <button type="button" data-action="restart" class="secondary">Reiniciar ciclo</button>
          </div>

          <p class="microcopy">Sequência ideal: ideia -> ângulo -> hook -> CTA/publicação.</p>
        </form>
      </section>

      <section class="how-grid">
        <article class="how-card">
          <span>Primeiro</span>
          <strong>Escreva a ideia bruta.</strong>
          <p>Não refine demais. Só capture o ponto que você quer defender.</p>
        </article>
        <article class="how-card">
          <span>Segundo</span>
          <strong>Defina o ângulo.</strong>
          <p>Escolha a lente: conflito, mudança de mercado, produto, comportamento.</p>
        </article>
        <article class="how-card">
          <span>Terceiro</span>
          <strong>Trave o hook.</strong>
          <p>Escreva a frase que faz a pessoa parar e continuar lendo.</p>
        </article>
        <article class="how-card">
          <span>Quarto</span>
          <strong>Feche com CTA.</strong>
          <p>Transforme a ideia em peça pronta para publicar ou levar ao aprovado final.</p>
        </article>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Ultimos ciclos</p>
            <h2>Historico recente</h2>
          </div>
          <p class="microcopy">Cada ciclo fechado reforca sua cadencia e deixa uma trilha do que ja ganhou forma.</p>
        </div>
        <div class="history-grid">
          ${renderHistory(state.history)}
        </div>
      </section>
    </main>
  `;

  const form = document.querySelector("[data-form]");
  const creatorNameInput = document.querySelector("#creatorName");
  const restartButton = document.querySelector("[data-action='restart']");

  creatorNameInput.addEventListener("change", (event) => {
    state = { ...state, creatorName: event.target.value.trim() || "Criador" };
    saveState(state);
    render();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const content = String(formData.get("content") ?? "");
    const creatorName = String(formData.get("creatorName") ?? "").trim() || "Criador";

    try {
      state = submitStep({ ...state, creatorName }, currentStep.key, content, 7);
      saveState(state);
      render();
    } catch (error) {
      window.alert(error.message);
    }
  });

  restartButton.addEventListener("click", () => {
    state = restartGame({ creatorName: state.creatorName, seed: 7 });
    saveState(state);
    render();
  });
}

render();
