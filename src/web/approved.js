const app = document.querySelector("[data-approved-app]");

let uiState = {
  items: [],
  selectedId: "",
  error: "",
  notice: "",
  loading: true,
  busy: false
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function selectedItem() {
  return uiState.items.find((item) => item.id === uiState.selectedId) || uiState.items[0] || null;
}

function defaultPrefix(format, index) {
  const type = format === "reels-curto"
    ? "cena"
    : format === "thread-x"
      ? "tweet"
      : format === "post-unico"
        ? "bloco"
        : "texto";

  return `${type} ${index + 1} - `;
}

function parseRenderBlocks(render) {
  return String(render ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .map((line, index) => {
      const match = line.match(/^(.*?\d+\s*-\s*)(.*)$/);

      return {
        prefix: match?.[1] || defaultPrefix("carrossel-instagram", index),
        content: match?.[2] || line
      };
    });
}

function resolveRenderBlocks(item) {
  const currentBlocks = parseRenderBlocks(item.finalRender || "");
  const generatedBlocks = parseRenderBlocks(item.generatedFinalRender || "");
  const count = Math.max(currentBlocks.length, generatedBlocks.length, 4);
  const blocks = [];

  for (let index = 0; index < count; index += 1) {
    const current = currentBlocks[index];
    const generated = generatedBlocks[index];

    blocks.push({
      prefix: current?.prefix || generated?.prefix || defaultPrefix(item.format, index),
      content: current?.content
        || generated?.content
        || (index === 0 ? item.selectedHeadline?.line1 || item.title || "" : "")
        || (index === 1 ? item.selectedHeadline?.line2 || "" : "")
    });
  }

  return blocks;
}

function buildRenderFromEditor(item) {
  const directEditor = document.querySelector("[name='manualFinalRenderEditor']");

  if (directEditor) {
    return String(directEditor.value ?? "").trim();
  }

  const baseBlocks = resolveRenderBlocks(item);
  const nextBlocks = baseBlocks.map((block, index) => {
    const field = document.querySelector(`[data-block-index="${index}"]`);

    return {
      prefix: field?.dataset.prefix || block.prefix,
      content: String(field?.value ?? block.content ?? "").trim()
    };
  });

  return nextBlocks
    .filter((block) => block.content)
    .map((block) => `${block.prefix}${block.content}`)
    .join("\n");
}

function renderSidebar(items) {
  if (items.length === 0) {
    return `<p class="empty-state">Nenhum post aprovado entrou neste canal ainda.</p>`;
  }

  return items.map((item) => `
    <button type="button" class="approved-link ${item.id === uiState.selectedId ? "approved-link-active" : ""}" data-id="${item.id}">
      <span>${escapeHtml(item.niche)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.formatLabel || item.format || "Formato")}</small>
    </button>
  `).join("");
}

function renderHeadlines(headlines, selectedHeadlineNumber) {
  return headlines.map((headline) => `
    <label class="headline-card ${headline.number === selectedHeadlineNumber ? "headline-card-active" : ""}">
      <input type="radio" name="headlineChoice" value="${headline.number}" ${headline.number === selectedHeadlineNumber ? "checked" : ""} />
      <div>
        <strong>${headline.number}.</strong>
        <p>${escapeHtml(headline.line1)}</p>
        <p>${escapeHtml(headline.line2)}</p>
      </div>
    </label>
  `).join("");
}

function renderTemplateOptions(templateOptions, selectedTemplate) {
  return templateOptions.map((template, index) => `
    <label class="template-option ${selectedTemplate === index + 1 ? "template-option-active" : ""}">
      <input type="radio" name="templateChoice" value="${index + 1}" ${selectedTemplate === index + 1 ? "checked" : ""} />
      <span>${escapeHtml(template)}</span>
    </label>
  `).join("");
}

function renderAdvancedPanel(item) {
  return `
    <details class="advanced-panel studio-panel">
      <summary>Ver opções de capa e template</summary>
      <div class="advanced-panel-body">
        <section class="selection-group">
          <h3>Capas sugeridas</h3>
          <p class="lede">A headline aqui é só a capa: título da primeira lâmina e subtítulo logo abaixo.</p>
          <div class="headline-grid">
            ${renderHeadlines(item.headlines, item.selectedHeadlineNumber)}
          </div>
        </section>
        <section class="selection-group">
          <h3>Template</h3>
          <p class="lede">Troque o template só se quiser regenerar a organização do texto.</p>
          <div class="template-grid">
            ${renderTemplateOptions(item.templateOptions, item.selectedTemplate)}
          </div>
        </section>
      </div>
    </details>
  `;
}

function renderPostWorkspace(item) {
  const sourceLink = item.sourceLink ? `
    <a href="${escapeHtml(item.sourceLink)}" target="_blank" rel="noreferrer">Abrir notícia</a>
  ` : "";
  const markdownLink = item.outputRelativePath ? `
    <a href="/${escapeHtml(item.outputRelativePath.replace(/\\/g, "/"))}" target="_blank" rel="noreferrer">Abrir markdown</a>
  ` : "";

  return `
    <header class="detail-header studio-panel detail-hero">
      <div>
        <p class="eyebrow">${escapeHtml(item.niche)}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="lede">Primeiro leia a peça pronta. Depois refine o texto diretamente na mesa de trabalho.</p>
      </div>
      <div class="detail-actions">
        ${sourceLink}
        ${markdownLink}
      </div>
    </header>

    <section class="section-card studio-panel approved-reading">
      <p class="eyebrow">Leitura rápida</p>
      <h3>Resultado pronto da notícia</h3>
      <p class="lede">Aqui fica a leitura consolidada que a plataforma montou a partir da notícia.</p>
      <label class="render-editor">
        <span>Texto gerado</span>
        <textarea name="manualFinalRender" rows="18" readonly>${escapeHtml(item.finalRender || item.generatedFinalRender || "")}</textarea>
      </label>
    </section>

    <section class="selection-group studio-panel approved-workbench">
      <p class="eyebrow">Mesa de trabalho</p>
      <h3>Refine o post</h3>
      <p class="lede">Edite o texto diretamente, cole a notícia e use o GPT só quando quiser uma nova versão.</p>
      <label class="render-editor">
        <span>Texto para editar</span>
        <textarea name="manualFinalRenderEditor" rows="18" placeholder="Ajuste aqui o texto do carrossel.">${escapeHtml(item.finalRender || item.generatedFinalRender || "")}</textarea>
      </label>
      <div class="render-actions">
        <button type="button" data-action="save-render" ${uiState.busy ? "disabled" : ""}>Salvar texto final</button>
        <button type="button" data-action="restore-render" class="secondary-button" ${uiState.busy ? "disabled" : ""}>Restaurar versão gerada</button>
      </div>
      <div class="chat-workbench">
        <label class="chat-block">
          <span>Notícia ou contexto colado</span>
          <textarea name="newsContext" rows="9" placeholder="Cole aqui a notícia, um trecho, transcrição ou anotações que devem orientar a peça.">${escapeHtml(item.newsContext || "")}</textarea>
        </label>
        <label class="chat-block">
          <span>Pedido para o GPT</span>
          <textarea name="aiPrompt" rows="5" placeholder="Ex: reescreva do zero em formato de storytelling, deixando a abertura mais forte e a progressão mais interessante.">${escapeHtml(item.aiPrompt || "")}</textarea>
        </label>
      </div>
      <div class="prompt-actions">
        <button type="button" data-action="apply-gpt" ${uiState.busy ? "disabled" : ""}>Usar contexto + GPT</button>
        <button type="button" data-action="save-context" class="secondary-button" ${uiState.busy ? "disabled" : ""}>Salvar contexto</button>
        <button type="button" data-action="save-prompt" class="secondary-button" ${uiState.busy ? "disabled" : ""}>Salvar pedido</button>
      </div>
    </section>
  `;
}

function render() {
  const item = selectedItem();

  app.innerHTML = `
    <main class="shell">
      <nav class="top-nav">
        <a href="/">Studio</a>
        <a href="/radar">Radar</a>
        <a href="/approved" class="nav-link-active">Aprovados</a>
        <a href="/live">Ao Vivo</a>
      </nav>

      <section class="approved-intro studio-panel">
        <div>
          <p class="eyebrow">Aprovados</p>
          <h1>Escolha um aprovado e ajuste a peça pronta: capa, próximas lâminas e texto final.</h1>
        </div>
        <div class="intro-actions">
          <a class="primary-link" href="/radar">Voltar ao Radar</a>
          <a class="secondary-link" href="/approved">Atualizar aprovados</a>
        </div>
      </section>

      ${uiState.notice ? `<section class="notice">${escapeHtml(uiState.notice)}</section>` : ""}
      ${uiState.error ? `<section class="alert">${escapeHtml(uiState.error)}</section>` : ""}

      <section class="layout">
        <aside class="sidebar studio-panel">
          <div class="sidebar-header">
            <p class="eyebrow">Lista</p>
            <h2>Aprovados</h2>
          </div>
          <div class="sidebar-list">
            ${renderSidebar(uiState.items)}
          </div>
        </aside>

        <section class="detail">
          ${item ? renderPostWorkspace(item) : `<section class="empty-state">Nenhum item aprovado para exibir.</section>`}
        </section>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.selectedId = button.dataset.id;
      render();
    });
  });

  document.querySelectorAll("input[name='headlineChoice']").forEach((input) => {
    input.addEventListener("change", () => {
      updatePacket({
        selectedHeadlineNumber: Number(input.value),
        manualFinalRender: ""
      });
    });
  });

  document.querySelectorAll("input[name='templateChoice']").forEach((input) => {
    input.addEventListener("change", () => {
      updatePacket({
        selectedTemplate: Number(input.value),
        manualFinalRender: ""
      });
    });
  });

  document.querySelectorAll("[data-block-index]").forEach((field) => {
    field.addEventListener("input", () => {
      const preview = document.querySelector("[name='manualFinalRender']");

      if (preview) {
        preview.value = buildRenderFromEditor(item);
      }
    });
  });

  const saveEvaluationButton = document.querySelector("[data-action='save-evaluation']");
  const savePromptButton = document.querySelector("[data-action='save-prompt']");
  const saveContextButton = document.querySelector("[data-action='save-context']");
  const applyGptButton = document.querySelector("[data-action='apply-gpt']");
  const saveRenderButton = document.querySelector("[data-action='save-render']");
  const restoreRenderButton = document.querySelector("[data-action='restore-render']");

  if (saveEvaluationButton) {
    saveEvaluationButton.addEventListener("click", () => {
      const status = document.querySelector("[name='evaluationStatus']").value;
      const score = Number(document.querySelector("[name='evaluationScore']").value) || 0;
      const notes = document.querySelector("[name='evaluationNotes']").value;

      updatePacket({
        manualFinalRender: buildRenderFromEditor(item),
        evaluationStatus: status,
        evaluationScore: score,
        evaluationNotes: notes
      });
    });
  }

  if (savePromptButton) {
    savePromptButton.addEventListener("click", () => {
      const aiPrompt = document.querySelector("[name='aiPrompt']").value;
      updatePacket({ aiPrompt });
    });
  }

  if (saveContextButton) {
    saveContextButton.addEventListener("click", () => {
      const newsContext = document.querySelector("[name='newsContext']").value;
      updatePacket({ newsContext });
    });
  }

  if (applyGptButton) {
    applyGptButton.addEventListener("click", () => {
      const aiPrompt = document.querySelector("[name='aiPrompt']").value;
      const newsContext = document.querySelector("[name='newsContext']").value;
      applyPromptWithGpt({
        aiPrompt,
        currentRender: buildRenderFromEditor(item),
        newsContext
      });
    });
  }

  if (saveRenderButton) {
    saveRenderButton.addEventListener("click", () => {
      updatePacket({ manualFinalRender: buildRenderFromEditor(item) });
    });
  }

  if (restoreRenderButton) {
    restoreRenderButton.addEventListener("click", () => {
      updatePacket({ manualFinalRender: item.generatedFinalRender || "" });
    });
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });
  const payload = await response.json();

  if (response.status === 401) {
    window.location.href = "/?auth=required";
    throw new Error("Faça login para continuar.");
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Falha na requisicao.");
  }

  return payload;
}

async function loadApprovedChannel() {
  uiState.loading = true;
  render();

  try {
    const payload = await requestJson("/api/approved-channel");
    uiState.items = payload.items ?? [];
    uiState.selectedId = uiState.items.find((item) => item.id === uiState.selectedId)?.id || uiState.items[0]?.id || "";
    uiState.error = "";
    uiState.notice = "";
  } catch (error) {
    uiState.error = error.message;
  } finally {
    uiState.loading = false;
    render();
  }
}

async function updatePacket(updates) {
  const item = selectedItem();

  if (!item) {
    return;
  }

  uiState.busy = true;
  render();

  try {
    const payload = await requestJson(`/api/approved-channel/${encodeURIComponent(item.id)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(updates)
    });
    uiState.items = payload.approvedChannel.items ?? [];
    uiState.selectedId = item.id;
    uiState.error = "";
    uiState.notice = "Peça atualizada com sucesso.";
  } catch (error) {
    uiState.error = error.message;
    uiState.notice = "";
  } finally {
    uiState.busy = false;
    render();
  }
}

async function applyPromptWithGpt({ aiPrompt, currentRender, newsContext }) {
  const item = selectedItem();

  if (!item) {
    return;
  }

  if (!String(aiPrompt || "").trim() && !String(newsContext || "").trim()) {
    uiState.error = "Cole a notícia ou escreva um pedido antes de usar o GPT.";
    uiState.notice = "";
    render();
    return;
  }

  uiState.busy = true;
  uiState.notice = "";
  uiState.error = "";
  render();

  try {
    const payload = await requestJson(`/api/approved-channel/${encodeURIComponent(item.id)}/apply-prompt`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        aiPrompt,
        currentRender,
        newsContext
      })
    });
    uiState.items = payload.approvedChannel.items ?? [];
    uiState.selectedId = item.id;
    uiState.notice = "Peça ajustada com GPT e salva no aprovado.";
    uiState.error = "";
  } catch (error) {
    uiState.error = error.message;
    uiState.notice = "";
  } finally {
    uiState.busy = false;
    render();
  }
}

loadApprovedChannel();
