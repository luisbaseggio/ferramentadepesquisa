const app = document.querySelector("[data-radar-app]");

const DEFAULT_PROFILE = {
  niche: "",
  secondaryTheme: "",
  source: "google-news",
  recencyHours: "",
  maxDrafts: "",
  siteFilter: ""
};

const SITE_PRESETS = [
  "valor.globo.com",
  "neofeed.com.br",
  "exame.com",
  "pipelinevalor.globo.com",
  "forbes.com",
  "techcrunch.com",
  "theinformation.com",
  "restofworld.org"
];

let uiState = {
  profile: { ...DEFAULT_PROFILE },
  payload: null,
  reviewQueue: { items: [], updatedAt: null },
  sheetsStatus: null,
  error: "",
  activityMessage: "",
  reviewFeedback: null,
  generationInfo: null,
  streamStatus: "conectando",
  busyAction: "",
  loadingStage: "idle",
  highlightedDraftId: ""
};

let eventSource = null;
let requestSequence = 0;

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseSiteFilterInput(value) {
  return [...new Set(
    String(value ?? "")
      .split(/[,\n;]/g)
      .map((entry) => entry.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean)
  )];
}

function siteFilterLabel(value) {
  const sites = parseSiteFilterInput(value);

  if (sites.length === 0) {
    return "todas as fontes";
  }

  if (sites.length === 1) {
    return sites[0];
  }

  return `${sites.length} sites filtrados`;
}

function relativeTime(isoValue) {
  if (!isoValue) {
    return "sem horario confirmado";
  }

  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) {
    return "sem horario confirmado";
  }

  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));

  if (minutes < 1) {
    return "agora";
  }

  if (minutes < 60) {
    return `${minutes} min atras`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} h atras`;
  }

  const days = Math.round(hours / 24);
  return `${days} d atras`;
}

function badgeClass(heat) {
  if (heat === "critico") {
    return "badge badge-hot";
  }

  if (heat === "alto") {
    return "badge badge-warm";
  }

  return "badge badge-cool";
}

function decisionLabel(decision) {
  if (decision === "approved") {
    return "aprovado";
  }

  if (decision === "rejected") {
    return "rejeitado";
  }

  return "pendente";
}

function renderSignals(signals = []) {
  if (signals.length === 0) {
    return `<span class="chip">sem sinal forte</span>`;
  }

  return signals.map((signal) => `<span class="chip">${escapeHtml(signal)}</span>`).join("");
}

function visibleQueueItems(queue, niche) {
  const normalizedNiche = normalizeText(niche);

  return (queue?.items ?? [])
    .filter((item) => (
      normalizeText(item.niche) === normalizedNiche &&
      item.reviewDecision !== "approved" &&
      item.reviewDecision !== "rejected"
    ))
    .sort((left, right) => {
      if (left.id === uiState.highlightedDraftId) {
        return -1;
      }

      if (right.id === uiState.highlightedDraftId) {
        return 1;
      }

      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    });
}

function reviewQueueStats(queue, niche) {
  const normalizedNiche = normalizeText(niche);
  const items = (queue?.items ?? []).filter((item) => normalizeText(item.niche) === normalizedNiche);

  return {
    pending: items.filter((item) => item.reviewDecision === "pending").length,
    approved: items.filter((item) => item.reviewDecision === "approved").length,
    rejected: items.filter((item) => item.reviewDecision === "rejected").length,
    total: items.length
  };
}

function activeSiteFilters(snapshot, profile) {
  return (snapshot?.siteFilters ?? parseSiteFilterInput(profile?.siteFilter ?? ""));
}

function renderLoadingCard(copy) {
  return `
    <article class="empty-state loading-state">
      <strong>Buscando agora</strong>
      <p>${escapeHtml(copy)}</p>
    </article>
  `;
}

function renderSearchFeedback(snapshot, profile, loadingStage, activityMessage) {
  if (loadingStage === "snapshot") {
    return `<div class="search-feedback">${escapeHtml(activityMessage || "Buscando noticias...")}</div>`;
  }

  if (!snapshot?.generatedAt) {
    return "";
  }

  const hasBriefs = (snapshot.briefs ?? []).length > 0;
  const content = hasBriefs
    ? `Pesquisa concluida para <strong>${escapeHtml(snapshot.niche || profile.niche)}</strong>.`
    : `Pesquisa concluida para <strong>${escapeHtml(snapshot.niche || profile.niche)}</strong>, mas ainda sem material suficiente para gerar posts. Tente ampliar horas ou usar um nicho mais direto.`;

  return `<div class="search-feedback search-feedback-success">${content}</div>`;
}

function renderNextStepPanel(snapshot, profile, hasDraftableBriefs) {
  if (!snapshot?.generatedAt) {
    return `
      <article class="next-step-card next-step-card-muted">
        <span>Próximo passo</span>
        <strong>Pesquise um nicho para liberar a geração.</strong>
        <p>Assim que a leitura encontrar sinais fortes, o botão de gerar posts fica pronto.</p>
      </article>
    `;
  }

  if (!hasDraftableBriefs) {
    return `
      <article class="next-step-card next-step-card-muted">
        <span>Próximo passo</span>
        <strong>Faltam briefs fortes para gerar posts.</strong>
        <p>Tente aumentar a janela de horas ou usar um nicho mais direto para trazer material novo.</p>
      </article>
    `;
  }

  return `
    <article class="next-step-card next-step-card-ready">
      <span>Próximo passo</span>
      <strong>Radar pronto para ${escapeHtml(snapshot.niche || profile.niche)}.</strong>
      <p>Agora gere os rascunhos para mandar a fila para revisão interna.</p>
      <button type="button" class="next-step-button" data-action="run-agent" ${uiState.busyAction ? "disabled" : ""}>Gerar posts</button>
    </article>
  `;
}

function renderResultSummary(snapshot, queue, niche) {
  if (!snapshot?.generatedAt) {
    return "";
  }

  const summary = snapshot.summary || {};
  const stats = reviewQueueStats(queue, niche);

  return `
    <div class="result-summary">
      <span>${summary.trackedItems ?? 0} sinais</span>
      <span>${summary.controversyCount ?? 0} polêmicas</span>
      <span>${stats.pending} pendentes</span>
    </div>
  `;
}

function renderControversies(payload) {
  if (!payload) {
    return renderLoadingCard("O radar esta montando o mapa de polemicas deste nicho.");
  }

  if (payload.snapshot.controversies.length === 0) {
    return `<p class="empty-state">Nenhuma polemica forte foi agrupada ainda para esse nicho.</p>`;
  }

  return payload.snapshot.controversies
    .map(
      (item) => `
        <article class="card controversy-card">
          <div class="card-topline">
            <span class="${badgeClass(item.heat)}">${escapeHtml(item.heat)}</span>
            <span class="microcopy">${item.itemCount} sinais relacionados</span>
          </div>
          <h3>${escapeHtml(item.label)}</h3>
          <p class="lede-small">${escapeHtml(item.leadTitle)}</p>
          <p>${escapeHtml(item.summary)}</p>
          <p><strong>Ponte com inovação:</strong> ${escapeHtml(item.themeBridge?.whyItMatters || "A leitura editorial ainda esta sendo refinada.")}</p>
          <p class="microcopy">Fontes: ${escapeHtml(item.sources.join(", "))}</p>
          <div class="chip-row">${renderSignals(item.signals)}</div>
          <a href="${item.leadLink}" target="_blank" rel="noreferrer">Abrir noticia base</a>
        </article>
      `
    )
    .join("");
}

function renderFeed(payload) {
  if (!payload) {
    return renderLoadingCard("As noticias mais recentes ainda estao chegando.");
  }

  if (payload.snapshot.trackedItems.length === 0) {
    return `<p class="empty-state">O radar ainda nao recebeu itens para exibir.</p>`;
  }

  return payload.snapshot.trackedItems
    .map(
      (item) => `
        <article class="feed-item">
          <div class="feed-meta">
            <span class="${badgeClass(item.heat)}">${escapeHtml(item.heat)}</span>
            <span>${escapeHtml(item.source)}</span>
            <span>${relativeTime(item.publishedTime)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.snippet)}</p>
          <p><strong>Por que isso importa para inovação:</strong> ${escapeHtml(item.themeBridge?.whyItMatters || "Leitura ainda indisponivel.")}</p>
          <div class="chip-row">${renderSignals(item.signals)}</div>
          <p class="microcopy">Score total ${item.scores.totalScore.toFixed(1)} | query ${escapeHtml(item.query)}</p>
          <a href="${item.link}" target="_blank" rel="noreferrer">Ler contexto</a>
        </article>
      `
    )
    .join("");
}

function renderBriefs(payload) {
  if (!payload) {
    return renderLoadingCard("Os briefs vao aparecer quando o radar fechar a primeira leitura.");
  }

  if (payload.snapshot.briefs.length === 0) {
    return `<p class="empty-state">Os briefs editoriais vao aparecer aqui quando houver material suficiente.</p>`;
  }

  return payload.snapshot.briefs
    .map(
      (brief) => `
        <article class="card brief-card">
          <p class="eyebrow">Brief ${brief.rank}</p>
          <h3>${escapeHtml(brief.title)}</h3>
          <p><strong>Por que agora:</strong> ${escapeHtml(brief.whyNow)}</p>
          <p><strong>Ponte com inovação:</strong> ${escapeHtml(brief.whyItMattersToNiche)}</p>
          ${brief.crossThemeBridge ? `<p><strong>Cruzamento:</strong> ${escapeHtml(brief.crossThemeBridge)}</p>` : ""}
          <p><strong>Tipo de inovação:</strong> ${escapeHtml(brief.innovationType)}</p>
          <p><strong>Gancho:</strong> ${escapeHtml(brief.polarizingHook)}</p>
          <p><strong>Debate:</strong> ${escapeHtml(brief.debateAngle)}</p>
          <p><strong>Fechamento:</strong> ${escapeHtml(brief.innovationClose)}</p>
          <a href="${brief.link}" target="_blank" rel="noreferrer">Ver origem</a>
        </article>
      `
    )
    .join("");
}

function renderReviewQueue(queue, niche) {
  const items = visibleQueueItems(queue, niche);
  const stats = reviewQueueStats(queue, niche);
  const feedback = uiState.reviewFeedback;

  return `
    <div class="review-summary">
      <article class="review-metrics">
        <strong>${stats.pending}</strong>
        <span>pendentes</span>
      </article>
      <article class="review-metrics">
        <strong>${stats.approved}</strong>
        <span>aprovados</span>
      </article>
      <article class="review-metrics">
        <strong>${stats.rejected}</strong>
        <span>rejeitados</span>
      </article>
    </div>

    ${feedback ? `
      <div class="review-feedback review-feedback-${feedback.decision}">
        <strong>${feedback.decision === "approved" ? "Enviado para aprovados" : "Removido da fila"}</strong>
        <p>${escapeHtml(feedback.title || "")}</p>
      </div>
    ` : ""}

    ${items.length === 0 ? `
      <p class="empty-state">Nenhum rascunho pendente deste nicho esta esperando decisao.</p>
    ` : `
      <div class="review-card-grid">
        ${items
          .slice(0, 6)
          .map(
            (item) => `
              <article class="card review-card ${item.id === uiState.highlightedDraftId ? "review-card-highlighted" : ""}">
                <div class="card-topline">
                  <span class="badge ${item.reviewDecision === "approved" ? "badge-approved" : item.reviewDecision === "rejected" ? "badge-rejected" : "badge-cool"}">${decisionLabel(item.reviewDecision)}</span>
                  <span class="microcopy">${escapeHtml(item.sourceName || "fonte nao informada")}</span>
                </div>
                ${item.id === uiState.highlightedDraftId ? `<p class="microcopy review-highlight-label">Novo item vindo do Ao Vivo</p>` : ""}
                <h3>${escapeHtml(item.title)}</h3>
                <p><strong>Formato:</strong> ${escapeHtml(item.formatLabel || item.format || "Carrossel")}</p>
                <p><strong>Hook:</strong> ${escapeHtml(item.hook)}</p>
                <p><strong>Angle:</strong> ${escapeHtml(item.angle)}</p>
                <p><strong>Notas da revisao:</strong> ${escapeHtml(item.reviewNotes || "sem anotacoes ainda")}</p>
                <p class="microcopy">Atualizado ${relativeTime(item.updatedAt)}</p>
                <label class="review-note-field">
                  <span class="microcopy">Anotacao interna</span>
                  <textarea data-review-notes="${item.id}" rows="3" placeholder="Escreva sua observacao aqui...">${escapeHtml(item.reviewNotes || "")}</textarea>
                </label>
                <div class="review-actions">
                  <button type="button" data-review-decision="${item.id}" data-decision="approved" ${uiState.busyAction === `decision:${item.id}` ? "disabled" : ""}>Enviar para aprovados</button>
                  <button type="button" class="ghost" data-review-decision="${item.id}" data-decision="rejected" ${uiState.busyAction === `decision:${item.id}` ? "disabled" : ""}>Rejeitar</button>
                </div>
                <a href="${item.sourceLink}" target="_blank" rel="noreferrer">Abrir noticia usada</a>
              </article>
            `
          )
          .join("")}
      </div>
    `}
  `;
}

function renderQueryChips(snapshot) {
  const queries = activeQueries(snapshot);

  if (queries.length === 0) {
    return `<span class="chip">queries aparecerao aqui</span>`;
  }

  return queries.map((query) => `<span class="chip chip-query">${escapeHtml(query)}</span>`).join("");
}

function renderSitePresetButtons(siteFilter) {
  const active = new Set(parseSiteFilterInput(siteFilter));

  return SITE_PRESETS.map((domain) => `
    <button
      type="button"
      class="site-pill ${active.has(domain) ? "site-pill-active" : ""}"
      data-site-toggle="${escapeHtml(domain)}"
      aria-pressed="${active.has(domain) ? "true" : "false"}"
    >
      ${escapeHtml(domain)}
    </button>
  `).join("");
}

function render() {
  const payload = uiState.payload;
  const snapshot = payload?.snapshot;
  const currentNiche = uiState.profile.niche;
  const hasDraftableBriefs = Boolean(snapshot?.briefs?.length);

  app.innerHTML = `
    <main class="shell">
      <nav class="top-nav">
        <a href="/">Studio</a>
        <a href="/radar" class="nav-link-active">Radar</a>
        <a href="/approved">Aprovados</a>
        <a href="/live">Ao Vivo</a>
      </nav>

      <section class="control-shell">
        <form class="control-panel" data-profile-form id="radar-profile-form">
          <div class="panel-intro">
            <p class="eyebrow">Comece aqui</p>
            <h2>Do zero: escolha o nicho, escolha as fontes e então rode a busca.</h2>
          </div>

          <label for="niche">Nicho</label>
          <input id="niche" name="niche" value="${escapeHtml(uiState.profile.niche)}" maxlength="60" placeholder="ex: inovacao, big tech, IA" />

          <label for="secondaryTheme">Cruzar com</label>
          <input id="secondaryTheme" name="secondaryTheme" value="${escapeHtml(uiState.profile.secondaryTheme)}" maxlength="80" placeholder="opcional: ex: neymar, zoo york, nicolas ferreira" />

          <div class="inline-fields">
            <div>
              <label for="recencyHours">Horas</label>
              <div class="field-stack">
                <input id="recencyHours" name="recencyHours" type="text" inputmode="numeric" pattern="[0-9]*" placeholder=" " value="${escapeHtml(uiState.profile.recencyHours)}" />
                <span class="input-inline-hint">Aqui você coloca quantas horas atrás foi postado</span>
              </div>
            </div>
            <div>
              <label for="maxDrafts">Rascunhos</label>
              <div class="field-stack">
                <input id="maxDrafts" name="maxDrafts" type="text" inputmode="numeric" pattern="[0-9]*" placeholder=" " value="${escapeHtml(uiState.profile.maxDrafts)}" />
                <span class="input-inline-hint">A quantidade de posts que você quer fazer</span>
              </div>
            </div>
          </div>

          <label for="siteFilter">Sites de notícia</label>
          <textarea id="siteFilter" name="siteFilter" rows="3" placeholder="ex: valor.globo.com, neofeed.com.br, techcrunch.com">${escapeHtml(uiState.profile.siteFilter)}</textarea>
          <p class="microcopy">Deixe vazio para buscar em todas as fontes do Google Notícias.</p>

          <div class="site-preset-row">
            ${renderSitePresetButtons(uiState.profile.siteFilter)}
          </div>

          <div class="search-primary-row">
            <button type="submit" ${uiState.busyAction ? "disabled" : ""}>Pesquisar este nicho</button>
          </div>

          ${renderSearchFeedback(snapshot, uiState.profile, uiState.loadingStage, uiState.activityMessage)}
          ${renderNextStepPanel(snapshot, uiState.profile, hasDraftableBriefs)}
          ${renderResultSummary(snapshot, uiState.reviewQueue, currentNiche)}
        </form>
      </section>

      ${uiState.activityMessage ? `<section class="info-banner">${escapeHtml(uiState.activityMessage)}</section>` : ""}
      ${uiState.error ? `<section class="alert">${escapeHtml(uiState.error)}</section>` : ""}

      <section class="feed-panel studio-panel">
        <div class="section-heading">
          <p class="eyebrow">Revisao</p>
          <h2>Fila ativa deste nicho</h2>
        </div>
        <div class="feed-grid review-grid">
          ${renderReviewQueue(uiState.reviewQueue, currentNiche)}
        </div>
      </section>

      <details class="collapsible-section studio-panel" ${snapshot?.generatedAt ? "open" : ""}>
        <summary>
          <span>Leitura do radar</span>
          <strong>Ver polêmicas e briefs</strong>
        </summary>
        <section class="content-grid studio-columns collapsible-content">
          <div class="column">
            <div class="section-heading">
              <p class="eyebrow">Radar</p>
              <h2>Pontos de tensão</h2>
            </div>
            <div class="stack">
              ${renderControversies(payload)}
            </div>
          </div>

          <div class="column">
            <div class="section-heading">
              <p class="eyebrow">Conteudo</p>
              <h2>Briefs prontos para virar peça</h2>
            </div>
            <div class="stack">
              ${renderBriefs(payload)}
            </div>
          </div>
        </section>
      </details>

      <details class="collapsible-section studio-panel">
        <summary>
          <span>Matéria-prima</span>
          <strong>Ver notícias capturadas</strong>
        </summary>
        <section class="feed-panel collapsible-content">
          <div class="feed-grid">
            ${renderFeed(payload)}
          </div>
        </section>
      </details>
    </main>
  `;

  const form = document.querySelector("[data-profile-form]");
  const runAgentButton = document.querySelector("[data-action='run-agent']");
  const siteFilterInput = document.querySelector("#siteFilter");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyProfileForm(form);
    if (!uiState.profile.niche) {
      uiState.error = "Preencha o nicho antes de pesquisar.";
      uiState.activityMessage = "";
      render();
      return;
    }
    connect({ force: true, preserveQueue: true });
  });

  runAgentButton?.addEventListener("click", () => {
    applyProfileForm(form);
    if (!uiState.profile.niche) {
      uiState.error = "Preencha o nicho antes de gerar posts.";
      uiState.activityMessage = "";
      render();
      return;
    }
    runContentAgent();
  });

  document.querySelectorAll("[data-review-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.reviewDecision;
      const decision = button.dataset.decision;
      const notesField = document.querySelector(`[data-review-notes="${CSS.escape(itemId)}"]`);
      decideReviewItem(itemId, decision, notesField?.value || "");
    });
  });

  document.querySelectorAll("[data-site-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const sites = new Set(parseSiteFilterInput(siteFilterInput.value));
      const domain = button.dataset.siteToggle;

      if (sites.has(domain)) {
        sites.delete(domain);
      } else {
        sites.add(domain);
      }

      siteFilterInput.value = [...sites].join(", ");
      applyProfileForm(form);
      render();
    });
  });
}

function applyProfileForm(form) {
  const formData = new FormData(form);
  const niche = String(formData.get("niche") ?? "").trim();
  uiState.profile = {
    ...uiState.profile,
    niche,
    secondaryTheme: String(formData.get("secondaryTheme") ?? "").trim(),
    recencyHours: Number(formData.get("recencyHours") ?? DEFAULT_PROFILE.recencyHours) || DEFAULT_PROFILE.recencyHours,
    maxDrafts: Number(formData.get("maxDrafts") ?? DEFAULT_PROFILE.maxDrafts) || DEFAULT_PROFILE.maxDrafts,
    siteFilter: parseSiteFilterInput(formData.get("siteFilter") ?? "").join(", ")
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Falha na requisicao.");
  }

  return payload;
}

async function loadSnapshot(force = false) {
  const params = new URLSearchParams({
    niche: uiState.profile.niche,
    secondaryTheme: uiState.profile.secondaryTheme,
    source: uiState.profile.source,
    recencyHours: String(uiState.profile.recencyHours),
    siteFilter: uiState.profile.siteFilter
  });

  if (force) {
    params.set("force", "1");
  }

  const payload = await requestJson(`/api/radar/snapshot?${params.toString()}`);
  uiState.payload = payload;
}

async function loadReviewQueue() {
  uiState.reviewQueue = await requestJson("/api/review-queue");
}

async function loadSheetsStatus() {
  uiState.sheetsStatus = await requestJson("/api/google-sheets/status");
}

async function forceRefresh() {
  uiState.busyAction = "refresh";
  uiState.loadingStage = "refresh";
  uiState.error = "";
  uiState.payload = null;
  uiState.activityMessage = `Rodando nova coleta para ${uiState.profile.niche}.`;
  uiState.reviewFeedback = null;
  render();

  try {
    const payload = await requestJson("/api/radar/refresh", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        niche: uiState.profile.niche,
        secondaryTheme: uiState.profile.secondaryTheme,
        source: uiState.profile.source,
        recencyHours: uiState.profile.recencyHours,
        siteFilter: uiState.profile.siteFilter
      })
    });
    uiState.payload = {
      snapshot: payload.snapshot,
      status: payload.status
    };
    uiState.activityMessage = `Coleta atualizada para ${payload.snapshot.niche}.`;
  } catch (error) {
    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    uiState.busyAction = "";
    uiState.loadingStage = "idle";
    render();
  }
}

async function runContentAgent() {
  uiState.busyAction = "run-agent";
  uiState.loadingStage = "agent";
  uiState.error = "";
  uiState.activityMessage = `Coletando noticias e gerando posts para ${uiState.profile.niche}.`;
  uiState.reviewFeedback = null;
  render();

  try {
    const payload = await requestJson("/api/content-agent/run", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        niche: uiState.profile.niche,
        secondaryTheme: uiState.profile.secondaryTheme,
        source: uiState.profile.source,
        recencyHours: uiState.profile.recencyHours,
        maxDrafts: uiState.profile.maxDrafts,
        siteFilter: uiState.profile.siteFilter
      })
    });

    uiState.payload = {
      snapshot: payload.snapshot,
      status: payload.status
    };
    uiState.reviewQueue = payload.reviewQueue;
    uiState.sheetsStatus = payload.syncStatus;
    uiState.generationInfo = payload.generation || null;
    const failedCount = (payload.generation?.failed || []).length;
    const fallbackLabel = payload.batch.fallbackUsed ? " O sistema usou as notícias capturadas como fallback para não te deixar sem drafts." : "";
    const failedLabel = failedCount > 0 ? ` ${failedCount} pautas falharam na geração principal e foram tratadas com fallback.` : "";
    uiState.activityMessage = `${payload.batch.drafts.length} posts gerados para ${payload.snapshot.niche}.${failedLabel}${fallbackLabel}`;
  } catch (error) {
    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    uiState.busyAction = "";
    uiState.loadingStage = "idle";
    render();
  }
}

async function syncSheets() {
  uiState.busyAction = "sync-sheets";
  uiState.error = "";
  uiState.activityMessage = "Enviando a fila atual para o Google Sheets.";
  render();

  try {
    const payload = await requestJson("/api/google-sheets/sync", {
      method: "POST"
    });
    uiState.reviewQueue = payload.reviewQueue;
    uiState.sheetsStatus = payload.syncStatus;
    uiState.activityMessage = payload.message;
  } catch (error) {
    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    uiState.busyAction = "";
    render();
  }
}

async function importSheetsReview() {
  uiState.busyAction = "import-sheets-review";
  uiState.error = "";
  uiState.activityMessage = "Importando as revisoes feitas no Google Sheets.";
  render();

  try {
    const payload = await requestJson("/api/google-sheets/import-review", {
      method: "POST"
    });
    uiState.reviewQueue = payload.reviewQueue;
    uiState.sheetsStatus = payload.syncStatus;
    uiState.activityMessage = payload.message;
  } catch (error) {
    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    uiState.busyAction = "";
    render();
  }
}

async function decideReviewItem(itemId, decision, notes) {
  const item = (uiState.reviewQueue.items ?? []).find((entry) => entry.id === itemId);
  uiState.busyAction = `decision:${itemId}`;
  uiState.error = "";
  uiState.activityMessage = decision === "approved"
    ? "Enviando item para Aprovados."
    : decision === "rejected"
      ? "Removendo item da fila deste nicho."
      : "Salvando decisao na fila interna.";
  render();

  try {
    const payload = await requestJson(`/api/review-queue/${encodeURIComponent(itemId)}/decision`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        decision,
        notes
      })
    });

    uiState.reviewQueue = payload.reviewQueue;
    uiState.sheetsStatus = payload.syncStatus;
    uiState.reviewFeedback = {
      decision,
      title: item?.title || "Item revisado"
    };
    uiState.activityMessage = decision === "approved"
      ? "Item enviado para Aprovados."
      : decision === "rejected"
        ? "Item rejeitado e removido da fila."
        : payload.message;
  } catch (error) {
    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    uiState.busyAction = "";
    render();
  }
}

function closeStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function connectStream() {
  closeStream();

  const streamNiche = normalizeText(uiState.profile.niche);
  const params = new URLSearchParams({
    niche: uiState.profile.niche,
    secondaryTheme: uiState.profile.secondaryTheme,
    source: uiState.profile.source,
    recencyHours: String(uiState.profile.recencyHours),
    siteFilter: uiState.profile.siteFilter
  });

  eventSource = new EventSource(`/api/radar/events?${params.toString()}`);
  uiState.streamStatus = "conectando";
  render();

  eventSource.addEventListener("snapshot", (event) => {
    const payload = JSON.parse(event.data);

    if (normalizeText(payload.data?.niche) !== streamNiche) {
      return;
    }

    uiState.payload = {
      snapshot: payload.data,
      status: payload.status
    };
    uiState.streamStatus = payload.status.stale ? "stale" : "ao vivo";

    if (!uiState.busyAction) {
      uiState.error = payload.status.lastError || "";
      uiState.activityMessage = `Radar ao vivo em ${payload.data.niche}.`;
    }

    render();
  });

  eventSource.onerror = () => {
    uiState.streamStatus = "reconectando";
    render();
  };

  eventSource.onopen = () => {
    uiState.streamStatus = "ao vivo";
    render();
  };
}

async function connect(options = {}) {
  const currentSequence = requestSequence + 1;
  requestSequence = currentSequence;

  closeStream();

  const url = new URL(window.location.href);
  url.searchParams.set("niche", uiState.profile.niche);
  url.searchParams.set("secondaryTheme", uiState.profile.secondaryTheme);
  url.searchParams.set("recencyHours", String(uiState.profile.recencyHours));
  url.searchParams.set("maxDrafts", String(uiState.profile.maxDrafts));
  url.searchParams.set("siteFilter", uiState.profile.siteFilter);
  window.history.replaceState({}, "", url);

  uiState.error = "";
  uiState.payload = null;
  uiState.loadingStage = "snapshot";
  uiState.activityMessage = `Buscando noticias para ${uiState.profile.niche}.`;
  uiState.reviewFeedback = null;
  render();

  try {
    await Promise.all([
      loadSnapshot(options.force === true),
      loadReviewQueue(),
      loadSheetsStatus()
    ]);

    if (currentSequence !== requestSequence) {
      return;
    }

    const briefCount = uiState.payload?.snapshot?.briefs?.length ?? 0;
    uiState.activityMessage = briefCount > 0
      ? `Radar pronto para ${uiState.payload?.snapshot?.niche || uiState.profile.niche}. Proximo passo: clique em Gerar posts.`
      : `Radar pronto para ${uiState.payload?.snapshot?.niche || uiState.profile.niche}, mas ainda sem briefs fortes.`;
  } catch (error) {
    if (currentSequence !== requestSequence) {
      return;
    }

    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    if (currentSequence !== requestSequence) {
      return;
    }

    uiState.loadingStage = "idle";
    render();
    connectStream();
  }
}

function boot() {
  const params = new URLSearchParams(window.location.search);
  const initialNiche = params.get("niche") || "";
  const highlightedDraftId = params.get("highlight") || "";
  uiState.profile = {
    ...DEFAULT_PROFILE,
    niche: initialNiche,
    secondaryTheme: params.get("secondaryTheme") || "",
    recencyHours: Number(params.get("recencyHours") || DEFAULT_PROFILE.recencyHours) || DEFAULT_PROFILE.recencyHours,
    maxDrafts: Number(params.get("maxDrafts") || DEFAULT_PROFILE.maxDrafts) || DEFAULT_PROFILE.maxDrafts,
    siteFilter: params.get("siteFilter") || DEFAULT_PROFILE.siteFilter
  };
  uiState.highlightedDraftId = highlightedDraftId;
  render();

  Promise.all([
    loadReviewQueue(),
    loadSheetsStatus()
  ]).then(() => {
    render();

    if (initialNiche) {
      connect({ force: true });
    }
  }).catch((error) => {
    uiState.error = error.message;
    render();
  });
}

boot();
