const app = document.querySelector("[data-home-app]");

const urlState = new URLSearchParams(window.location.search);

let uiState = {
  session: null,
  authMode: urlState.get("auth") === "required" ? "login" : "signup",
  authLoading: true,
  authBusy: false,
  reviewQueue: { items: [], updatedAt: null },
  approvedChannel: { items: [], updatedAt: null },
  sheetsStatus: null,
  error: "",
  notice: urlState.get("auth") === "required" ? "Faça login para entrar no estúdio." : "",
  busyAction: "",
  loading: true
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativeDate(value) {
  if (!value) {
    return "ainda nao gerado";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "data invalida" : date.toLocaleString("pt-BR");
}

function nicheCounts(items) {
  const counts = new Map();

  (items ?? []).forEach((item) => {
    const niche = String(item.niche ?? "sem nicho").trim() || "sem nicho";
    counts.set(niche, (counts.get(niche) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
}

function pendingCount(items) {
  return items.filter((item) => item.reviewDecision === "pending").length;
}

function approvedCount(items) {
  return items.filter((item) => item.reviewDecision === "approved").length;
}

function reviewStateLabel(status) {
  if (status?.lastError) {
    return "erro";
  }

  if (status?.lastSuccessAt) {
    return "sincronizado";
  }

  return "aguardando";
}

function renderNiches(items) {
  const niches = nicheCounts(items);

  if (niches.length === 0) {
    return `<p class="empty-state">Nenhum nicho recente ainda.</p>`;
  }

  return niches.map(([niche, count], index) => `
    <a class="signal-card" href="/radar?niche=${encodeURIComponent(niche)}">
      <span>0${index + 1}</span>
      <strong>${escapeHtml(niche)}</strong>
      <small>${count} itens em revisão</small>
    </a>
  `).join("");
}

function renderAuthShell() {
  const isSignup = uiState.authMode === "signup";

  app.innerHTML = `
    <main class="shell auth-shell">
      <section class="auth-hero">
        <div class="hero-copy">
          <p class="eyebrow">Studio Access</p>
          <h1>Entre no estúdio e organize a operação por workspace.</h1>
          <p class="lede">A partir daqui o MVP já nasce com identidade, sessão e workspaces. Cada pessoa entra com a própria conta e escolhe em qual operação quer trabalhar.</p>

          <div class="flow-boxes auth-visual">
            <div class="flow-box">
              <span>Usuário</span>
              <strong>Quem está operando</strong>
            </div>
            <div class="flow-box">
              <span>Workspace</span>
              <strong>Qual operação está aberta</strong>
            </div>
            <div class="flow-box">
              <span>Auth</span>
              <strong>Quem pode acessar cada área</strong>
            </div>
          </div>
        </div>

        <div class="auth-panel">
          <div class="auth-switch">
            <button type="button" class="${!isSignup ? "is-active" : ""}" data-auth-switch="login">Entrar</button>
            <button type="button" class="${isSignup ? "is-active" : ""}" data-auth-switch="signup">Criar conta</button>
          </div>

          ${uiState.notice ? `<section class="notice">${escapeHtml(uiState.notice)}</section>` : ""}
          ${uiState.error ? `<section class="alert">${escapeHtml(uiState.error)}</section>` : ""}

          ${isSignup ? `
            <form class="auth-form" data-auth-form="signup">
              <label>
                <span>Seu nome</span>
                <input name="name" type="text" placeholder="Luis Oliveira" required />
              </label>
              <label>
                <span>Email</span>
                <input name="email" type="email" placeholder="voce@empresa.com" required />
              </label>
              <label>
                <span>Senha</span>
                <input name="password" type="password" placeholder="minimo 8 caracteres" required />
              </label>
              <label>
                <span>Primeiro workspace</span>
                <input name="workspaceName" type="text" placeholder="Studio Inovacao" required />
              </label>
              <button type="submit" class="primary-link auth-submit" ${uiState.authBusy ? "disabled" : ""}>Criar conta e entrar</button>
            </form>
          ` : `
            <form class="auth-form" data-auth-form="login">
              <label>
                <span>Email</span>
                <input name="email" type="email" placeholder="voce@empresa.com" required />
              </label>
              <label>
                <span>Senha</span>
                <input name="password" type="password" placeholder="sua senha" required />
              </label>
              <button type="submit" class="primary-link auth-submit" ${uiState.authBusy ? "disabled" : ""}>Entrar no estúdio</button>
            </form>
          `}
        </div>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-auth-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.authMode = button.dataset.authSwitch;
      uiState.notice = "";
      uiState.error = "";
      render();
    });
  });

  document.querySelector("[data-auth-form='signup']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthForm("signup", new FormData(event.currentTarget));
  });

  document.querySelector("[data-auth-form='login']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthForm("login", new FormData(event.currentTarget));
  });
}

function renderWorkspaceBar() {
  const activeWorkspace = uiState.session?.activeWorkspace;
  const workspaces = uiState.session?.workspaces ?? [];
  const user = uiState.session?.user;

  return `
    <section class="workspace-bar studio-panel">
      <div class="workspace-summary">
        <p class="eyebrow">Sessão ativa</p>
        <h2>${escapeHtml(activeWorkspace?.name || "Sem workspace")}</h2>
        <p>${escapeHtml(user?.name || "")} · ${escapeHtml(user?.email || "")}</p>
      </div>

      <form class="workspace-switch" data-workspace-switch>
        <label>
          <span>Workspace ativo</span>
          <select name="workspaceId">
            ${workspaces.map((workspace) => `
              <option value="${escapeHtml(workspace.id)}" ${workspace.id === activeWorkspace?.id ? "selected" : ""}>
                ${escapeHtml(workspace.name)} · ${escapeHtml(workspace.role)}
              </option>
            `).join("")}
          </select>
        </label>
        <button type="submit" ${uiState.busyAction ? "disabled" : ""}>Trocar workspace</button>
      </form>

      <form class="workspace-create" data-workspace-create>
        <label>
          <span>Novo workspace</span>
          <input name="name" type="text" placeholder="Operação Tech B2B" required />
        </label>
        <button type="submit" ${uiState.busyAction ? "disabled" : ""}>Criar workspace</button>
      </form>

      <button type="button" class="ghost-button" data-action="logout" ${uiState.busyAction ? "disabled" : ""}>Sair</button>
    </section>
  `;
}

function renderStudioShell() {
  const sheetsState = reviewStateLabel(uiState.sheetsStatus);

  app.innerHTML = `
    <main class="shell">
      <nav class="top-nav">
        <a href="/" class="nav-link-active">Studio</a>
        <a href="/radar">Radar</a>
        <a href="/approved">Aprovados</a>
        <a href="/live">Ao Vivo</a>
      </nav>

      ${renderWorkspaceBar()}

      <section class="hero hero-compact studio-entry">
        <div class="hero-copy">
          <p class="eyebrow">Studio</p>
          <h1>Escolha um caminho e comece sem ruído.</h1>
          <p class="lede">Use o Radar para iniciar um fluxo editorial novo. Use o Ao Vivo quando quiser só observar sinais antes de escrever.</p>

          <div class="studio-path-grid">
            <article class="path-card path-card-primary">
              <span>01 Fluxo editorial</span>
              <strong>Pesquisar um nicho e gerar posts</strong>
              <p>Abra o Radar quando quiser transformar tema em pauta e seguir para revisão.</p>
              <a class="primary-link" href="/radar?niche=inovacao">Quero começar um novo post</a>
            </article>

            <article class="path-card">
              <span>02 Monitoramento ao vivo</span>
              <strong>Ver sinais sem entrar no fluxo</strong>
              <p>Abra o Ao Vivo quando quiser observar noticias e polêmicas antes de produzir.</p>
              <a class="secondary-link" href="/live">Quero ver o que está acontecendo agora</a>
            </article>
          </div>
        </div>
      </section>

      ${uiState.notice ? `<section class="notice">${escapeHtml(uiState.notice)}</section>` : ""}
      ${uiState.error ? `<section class="alert">${escapeHtml(uiState.error)}</section>` : ""}

      <section class="panel panel-simple">
        <div class="panel-header panel-header-stack">
          <div>
            <p class="eyebrow">Limpeza</p>
            <h2>Recomece por completo quando precisar zerar a operação.</h2>
          </div>
        </div>

        <div class="simple-reset-grid">
          <button type="button" class="simple-reset-card" data-action="reset-local" ${uiState.busyAction ? "disabled" : ""}>
            <strong>Recomeçar só nesta máquina</strong>
            <p>Zera radar, fila e aprovados locais.</p>
          </button>

          <button type="button" class="simple-reset-card" data-action="reset-all" ${uiState.busyAction ? "disabled" : ""}>
            <strong>Recomeçar tudo + Sheets</strong>
            <p>Recomeça a operação do zero, inclusive na planilha.</p>
          </button>
        </div>
      </section>
    </main>
  `;

  document.querySelector("[data-action='reset-local']")?.addEventListener("click", () => {
    resetSystem("local");
  });

  document.querySelector("[data-action='reset-all']")?.addEventListener("click", () => {
    resetSystem("all");
  });

  document.querySelector("[data-action='logout']")?.addEventListener("click", logout);

  document.querySelector("[data-workspace-switch]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    changeWorkspace(formData.get("workspaceId"));
  });

  document.querySelector("[data-workspace-create]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    createWorkspace(formData.get("name"));
  });
}

function render() {
  if (!uiState.session) {
    renderAuthShell();
    return;
  }

  renderStudioShell();
}

async function requestJson(url) {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisição.");
  }

  return payload;
}

async function requestJsonWithOptions(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisição.");
  }

  return payload;
}

async function loadSession() {
  uiState.authLoading = true;
  render();

  try {
    const payload = await requestJson("/api/auth/session");
    uiState.session = payload.session;
    uiState.error = "";

    if (!payload.authenticated) {
      uiState.loading = false;
      render();
      return;
    }

    await loadStudioData();
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.authLoading = false;
    render();
  }
}

async function loadStudioData() {
  uiState.loading = true;
  render();

  try {
    const payload = await requestJson("/api/studio/overview");

    uiState.reviewQueue = payload.reviewQueue;
    uiState.approvedChannel = payload.approvedChannel;
    uiState.sheetsStatus = payload.sheetsStatus;
    uiState.error = "";
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.loading = false;
    render();
  }
}

async function submitAuthForm(mode, formData) {
  uiState.authBusy = true;
  uiState.notice = "";
  uiState.error = "";
  render();

  try {
    const payload = await requestJsonWithOptions(`/api/auth/${mode}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });

    uiState.session = payload.session;
    uiState.notice = payload.message;
    await loadStudioData();
    window.history.replaceState({}, "", "/");
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.authBusy = false;
    render();
  }
}

async function logout() {
  uiState.busyAction = "logout";
  uiState.notice = "";
  uiState.error = "";
  render();

  try {
    await requestJsonWithOptions("/api/auth/logout", {
      method: "POST"
    });

    uiState.session = null;
    uiState.reviewQueue = { items: [], updatedAt: null };
    uiState.approvedChannel = { items: [], updatedAt: null };
    uiState.sheetsStatus = null;
    uiState.notice = "Sessão encerrada.";
    window.history.replaceState({}, "", "/");
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.busyAction = "";
    render();
  }
}

async function changeWorkspace(workspaceId) {
  if (!workspaceId) {
    return;
  }

  uiState.busyAction = "workspace-switch";
  uiState.notice = "";
  uiState.error = "";
  render();

  try {
    const payload = await requestJsonWithOptions("/api/workspaces/select", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ workspaceId })
    });

    uiState.session = payload.session;
    uiState.notice = payload.message;
    await loadStudioData();
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.busyAction = "";
    render();
  }
}

async function createWorkspace(name) {
  uiState.busyAction = "workspace-create";
  uiState.notice = "";
  uiState.error = "";
  render();

  try {
    const payload = await requestJsonWithOptions("/api/workspaces", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ name })
    });

    uiState.session = payload.session;
    uiState.notice = `Workspace ${payload.workspace.name} criado.`;
    await loadStudioData();
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.busyAction = "";
    render();
  }
}

async function resetSystem(mode) {
  const confirmed = window.confirm(
    mode === "all"
      ? "Isso vai limpar o cache local e também esvaziar o Google Sheets. Quer continuar?"
      : "Isso vai limpar o cache local da ferramenta. Quer continuar?"
  );

  if (!confirmed) {
    return;
  }

  uiState.busyAction = mode;
  uiState.notice = "";
  uiState.error = "";
  render();

  try {
    const payload = await requestJsonWithOptions("/api/system/reset", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ mode })
    });

    uiState.reviewQueue = payload.reviewQueue;
    uiState.approvedChannel = payload.approvedChannel;
    uiState.sheetsStatus = payload.syncStatus;
    uiState.notice = payload.message;
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.busyAction = "";
    render();
  }
}

loadSession();
