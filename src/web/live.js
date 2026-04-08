const app = document.querySelector("[data-live-app]");

const DEFAULT_STATE = {
  niche: "",
  recencyHours: ""
};

const LIVE_CREATE_FORMAT = {
  id: "carrossel-instagram",
  label: "Criar carrossel"
};

let uiState = {
  profile: { ...DEFAULT_STATE },
  payload: null,
  error: "",
  notice: "",
  activityMessage: "",
  loading: true,
  busy: false,
  creatingId: "",
  autoRefreshId: null
};

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

function relativeTime(isoValue) {
  if (!isoValue) {
    return "sem horario";
  }

  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) {
    return "sem horario";
  }

  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));

  if (minutes < 1) {
    return "agora";
  }

  if (minutes < 60) {
    return `${minutes} min atras`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours} h atras`;
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

async function requestJson(url) {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisicao.");
  }

  return payload;
}

async function requestJsonWithOptions(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisicao.");
  }

  return payload;
}

function renderCreateAction(targetType, key) {
  return `
    <div class="format-action-grid">
      <button
        type="button"
        data-create-format="${LIVE_CREATE_FORMAT.id}"
        data-create-target="${targetType}"
        data-create-key="${escapeHtml(key)}"
      >
        ${escapeHtml(LIVE_CREATE_FORMAT.label)}
      </button>
    </div>
  `;
}

function renderHotspots(hotspots = []) {
  if (hotspots.length === 0) {
    return `<p class="empty-state">Nenhuma polemica forte apareceu ainda.</p>`;
  }

  return hotspots.map((item) => `
    <article class="card hotspot-card">
      <div class="card-topline">
        <span class="${badgeClass(item.heat)}">${escapeHtml(item.heat)}</span>
        <span class="chip">${escapeHtml(item.niche)}</span>
      </div>
      <h3>${escapeHtml(item.label)}</h3>
      <p class="microcopy">${item.itemCount} sinais | score ${Number(item.avgScore ?? 0).toFixed(1)}</p>
      <p>${escapeHtml(item.summary)}</p>
      <p><strong>Ponte com inovação:</strong> ${escapeHtml(item.themeBridge?.whyItMatters || "Leitura editorial ainda indisponivel.")}</p>
      <div class="feed-actions">
        <a href="${escapeHtml(item.leadLink)}" target="_blank" rel="noreferrer">Abrir noticia base</a>
      </div>
      ${renderCreateAction("hotspot", item.id)}
    </article>
  `).join("");
}

function renderFeed(items = []) {
  if (items.length === 0) {
    return `<p class="empty-state">Nenhum item ao vivo para mostrar ainda.</p>`;
  }

  return items.map((item) => `
    <article class="feed-item">
      <div class="card-topline">
        <span class="${badgeClass(item.heat)}">${escapeHtml(item.heat)}</span>
        <span class="chip">${escapeHtml(item.niche)}</span>
        <span class="microcopy">${escapeHtml(item.source)}</span>
        <span class="microcopy">${relativeTime(item.publishedTime)}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.snippet)}</p>
      <p><strong>Ponte com inovação:</strong> ${escapeHtml(item.themeBridge?.whyItMatters || "Leitura editorial ainda indisponivel.")}</p>
      <p class="microcopy">Tipo de inovação: ${escapeHtml(item.themeBridge?.innovationType || "em leitura")}</p>
      <p class="microcopy">Score ${Number(item.scores?.totalScore ?? 0).toFixed(1)}</p>
      <div class="feed-actions">
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">Ler contexto</a>
      </div>
      ${renderCreateAction("live-feed", item.link)}
    </article>
  `).join("");
}

function renderNiches(niches = []) {
  return niches.map((item) => `
    <article class="metric-card">
      <span>${escapeHtml(item.niche)}</span>
      <strong>${item.controversyCount}</strong>
      <small>${item.trackedItems} itens monitorados</small>
    </article>
  `).join("");
}

function render() {
  const payload = uiState.payload;
  const generatedAt = payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString("pt-BR") : "aguardando";
  const activeNiche = String(uiState.profile.niche || "").trim();

  app.innerHTML = `
    <main class="shell">
      <nav class="top-nav">
        <a href="/">Studio</a>
        <a href="/radar">Radar</a>
        <a href="/approved">Aprovados</a>
        <a href="/live" class="nav-link-active">Ao Vivo</a>
      </nav>

      <section class="hero live-minimal">
        <div class="hero-copy">
          <p class="eyebrow">Ao Vivo</p>
          <h1>Veja o que esta acontecendo agora.</h1>
          <p class="lede">Escolha um nicho, defina as horas se quiser filtrar e acompanhe as notícias em um só lugar.</p>
        </div>
      </section>

      <form class="control-panel studio-panel live-filter-panel" id="live-filter-form" data-live-form>
        <div class="filter-grid">
          <label for="liveNiche">
            <span>Nicho de interesse</span>
            <input id="liveNiche" name="niche" type="text" placeholder="ex: inovacao, IA, politica" value="${escapeHtml(uiState.profile.niche)}" />
          </label>

          <label for="recencyHours">
            <span>Horas</span>
            <input id="recencyHours" name="recencyHours" type="number" min="1" max="72" placeholder="deixe vazio para ver tudo do momento" value="${escapeHtml(uiState.profile.recencyHours)}" />
          </label>
        </div>
        <div class="hero-actions">
          <button type="submit" ${uiState.busy ? "disabled" : ""}>Atualizar painel</button>
        </div>
        <p class="microcopy">Ultima leitura: ${escapeHtml(generatedAt)}${activeNiche ? ` · Nicho atual: ${escapeHtml(activeNiche)}` : ""}</p>
      </form>

      ${uiState.notice ? `<section class="info-banner">${escapeHtml(uiState.notice)}</section>` : ""}
      ${uiState.activityMessage ? `<section class="info-banner subtle-banner">${escapeHtml(uiState.activityMessage)}</section>` : ""}
      ${uiState.error ? `<section class="alert">${escapeHtml(uiState.error)}</section>` : ""}

      <section class="metrics-grid">
        ${renderNiches(payload?.niches ?? [])}
      </section>

      <section class="panel studio-panel">
        <div class="section-heading">
          <p class="eyebrow">Hotspots</p>
          <h2>Polemicas em destaque</h2>
        </div>
        <div class="content-grid">
          ${renderHotspots(payload?.hotspots ?? [])}
        </div>
      </section>

      <section class="panel studio-panel">
        <div class="section-heading">
          <p class="eyebrow">Feed ao vivo</p>
          <h2>Fluxo geral de noticias quentes</h2>
        </div>
        <div class="feed-grid">
          ${renderFeed(payload?.liveFeed ?? [])}
        </div>
      </section>
    </main>
  `;

  const form = document.querySelector("[data-live-form]");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    uiState.profile = {
      niche: String(formData.get("niche") || "").trim(),
      recencyHours: String(formData.get("recencyHours") || "").trim()
    };
    loadLive(true);
  });

  document.querySelectorAll("[data-create-format]").forEach((button) => {
    button.addEventListener("click", () => {
      const format = button.dataset.createFormat;
      const targetType = button.dataset.createTarget;
      const key = button.dataset.createKey;
      const item = targetType === "hotspot"
        ? (uiState.payload?.hotspots ?? []).find((entry) => entry.id === key)
        : (uiState.payload?.liveFeed ?? []).find((entry) => entry.link === key);

      if (item) {
        createDraftFromLive(item, format, targetType);
      }
    });
  });
}

async function loadLive(force = false) {
  uiState.busy = true;
  uiState.error = "";
  uiState.notice = "";
  uiState.activityMessage = "Atualizando o monitor ao vivo.";
  render();

  try {
    const params = new URLSearchParams({
      niche: String(uiState.profile.niche || "").trim()
    });

    if (String(uiState.profile.recencyHours || "").trim()) {
      params.set("recencyHours", String(uiState.profile.recencyHours).trim());
    }

    if (force) {
      params.set("force", "1");
    }

    uiState.payload = await requestJson(`/api/live-monitor?${params.toString()}`);
    uiState.activityMessage = "Monitor ao vivo atualizado.";
  } catch (error) {
    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    uiState.loading = false;
    uiState.busy = false;
    render();
  }
}

async function createDraftFromLive(item, format, targetType) {
  uiState.creatingId = targetType === "hotspot" ? item.id : item.link;
  uiState.error = "";
  uiState.notice = "";
  uiState.activityMessage = `Criando carrossel a partir de ${item.title || item.label}.`;
  render();

  try {
    const payload = await requestJsonWithOptions("/api/content-agent/from-live", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        niche: item.niche,
        format,
        targetType,
        item
      })
    });

    uiState.notice = `${payload.draft.title} entrou na fila de revisão como ${payload.draft.formatLabel}. Abrindo o Radar para você continuar.`;
    uiState.activityMessage = "";
    render();
    window.setTimeout(() => {
      const params = new URLSearchParams({
        niche: payload.draft.niche || item.niche || "",
        highlight: payload.draft.id || ""
      });
      window.location.href = `/radar?${params.toString()}`;
    }, 900);
  } catch (error) {
    uiState.error = error.message;
    uiState.activityMessage = "";
  } finally {
    uiState.creatingId = "";
    render();
  }
}

function boot() {
  const params = new URLSearchParams(window.location.search);
  uiState.profile = {
    niche: String(params.get("niche") || DEFAULT_STATE.niche || "").trim(),
    recencyHours: String(params.get("recencyHours") || DEFAULT_STATE.recencyHours || "").trim()
  };

  render();
  loadLive(true);
  uiState.autoRefreshId = window.setInterval(() => {
    loadLive(false);
  }, 60_000);
}

boot();
