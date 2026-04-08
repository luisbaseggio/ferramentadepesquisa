import { contentFormatLabel, getContentFormat } from "./content-formats.js";
import { buildEditorialBrief } from "./editorial-agent.js";

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compactText(value, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function resolveEditorialFrame(brief, niche) {
  if (brief.aiPack?.editorialFrame) {
    return brief.aiPack.editorialFrame;
  }

  const fallbackProofs = [
    brief.title ? `O fato-base capturado foi "${brief.title}".` : "",
    brief.source ? `A leitura foi sustentada por ${brief.source}.` : "",
    brief.scores?.signals?.length ? `Os sinais editoriais vieram de ${brief.scores.signals.join(", ")}.` : ""
  ].filter(Boolean);

  const fallbackSlides = (brief.contentBeats || []).map((beat, index) => {
    const [label, ...rest] = String(beat ?? "").split(":");
    const body = rest.length > 0 ? rest.join(":").trim() : String(beat ?? "").trim();
    return {
      label: (label || `Slide ${index + 1}`).trim(),
      body
    };
  });

  return {
    fato_central: brief.title || `Sinal relevante em ${niche}`,
    mudanca_real: brief.whyNow || brief.debateAngle,
    sinal_real: brief.debateAngle,
    tipo_de_mudanca: "mercado",
    mecanismo: brief.debateAngle,
    tensao_central: brief.debateAngle,
    ponte_editorial: brief.whyItMattersToNiche || "",
    tese_editorial: brief.innovationClose || brief.debateAngle,
    direcao_de_conteudo: "carrossel de tese",
    formato_sugerido: "carrossel-instagram",
    angulo_narrativo: brief.debateAngle,
    promessa_da_capa: brief.polarizingHook,
    provas_do_argumento: brief.editorialFrame?.provas_do_argumento || fallbackProofs,
    implicacao_para_o_publico: brief.whyItMattersToNiche || `Isso importa para ${niche} porque revela uma mudança que ainda não ficou óbvia.`,
    consequencia: brief.innovationClose,
    frase_final: brief.innovationClose,
    estrutura_do_carrossel: brief.editorialFrame?.estrutura_do_carrossel || fallbackSlides,
    qualityGate: brief.editorialFrame?.qualityGate || { pass: true, score: 70, issues: [] }
  };
}

function buildSlides(brief) {
  const frame = resolveEditorialFrame(brief, brief.niche || "inovacao");
  const slides = frame.estrutura_do_carrossel?.length
    ? frame.estrutura_do_carrossel
    : (brief.contentBeats || []).map((beat, index) => ({
      label: `Slide ${index + 1}`,
      body: beat
    }));

  return slides.map((slide, index) => ({
    order: index + 1,
    title: slide.label || `Slide ${index + 1}`,
    body: slide.body
  }));
}

function buildSinglePostBlocks(brief) {
  const frame = resolveEditorialFrame(brief, brief.niche || "inovacao");
  return [
    frame.promessa_da_capa,
    frame.tese_editorial,
    frame.consequencia,
    frame.frase_final
  ];
}

function buildThreadPosts(brief) {
  const frame = resolveEditorialFrame(brief, brief.niche || "inovacao");
  return [
    frame.promessa_da_capa,
    "O caso parece pontual. Não é.",
    frame.fato_central,
    frame.sinal_real,
    frame.mecanismo,
    frame.consequencia,
    frame.tese_editorial,
    frame.frase_final
  ];
}

function buildReelsScenes(brief) {
  const frame = resolveEditorialFrame(brief, brief.niche || "inovacao");
  return [
    "Cena 1 - Gancho de abertura",
    frame.promessa_da_capa,
    "Cena 2 - O que está acontecendo",
    frame.fato_central,
    "Cena 3 - Onde está a tensão",
    frame.mecanismo,
    "Cena 4 - O que isso revela",
    frame.tese_editorial,
    "Cena 5 - Fechamento",
    frame.frase_final
  ];
}

function buildFormatArtifacts(brief, format) {
  if (format === "post-unico") {
    return {
      blocks: buildSinglePostBlocks(brief)
    };
  }

  if (format === "thread-x") {
    return {
      threadPosts: buildThreadPosts(brief)
    };
  }

  if (format === "reels-curto") {
    return {
      scenes: buildReelsScenes(brief)
    };
  }

  return {
    slides: buildSlides(brief)
  };
}

function buildCaption(brief, niche) {
  const frame = resolveEditorialFrame(brief, niche);
  return [
    frame.promessa_da_capa,
    frame.tese_editorial,
    frame.ponte_editorial,
    ...(brief.crossThemeBridge ? [brief.crossThemeBridge] : []),
    frame.consequencia,
    frame.implicacao_para_o_publico
  ].join(" ");
}

export function buildContentDraft(brief, niche, options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  const suggestedFormat = brief.aiPack?.format || brief.editorialFrame?.formato_sugerido || "carrossel-instagram";
  const format = getContentFormat(options.format || suggestedFormat).id;
  const titleBase = brief.aiPack?.title || brief.title || `Pauta ${brief.rank || 1}`;
  const id = `${slugify(titleBase)}-${slugify(format)}-${brief.rank || 1}`;
  const formatArtifacts = buildFormatArtifacts(brief, format);
  const editorialFrame = resolveEditorialFrame(brief, niche);
  const selectedHeadlineNumber = Math.min(
    Math.max(Number(brief.aiPack?.selectedHeadlineNumber || 1), 1),
    10
  );
  const generatedHeadlines = Array.isArray(brief.aiPack?.headlines) && brief.aiPack.headlines.length > 0
    ? brief.aiPack.headlines
    : undefined;
  const generatedSpine = brief.aiPack?.spine || undefined;
  const generatedTriage = brief.aiPack?.triage || undefined;
  const generatedFinalRender = brief.aiPack?.generatedFinalRender || undefined;
  const selectedTemplate = Math.min(
    Math.max(Number(brief.aiPack?.selectedTemplate || 1), 1),
    4
  );

  return {
    id,
    createdAt,
    niche,
    format,
    formatLabel: contentFormatLabel(format),
    title: titleBase,
    status: "pending_review",
    sourceTitle: brief.title,
    sourceLink: brief.link,
    sourceName: brief.source,
    query: brief.query,
    crossThemeBridge: brief.crossThemeBridge || "",
    hook: editorialFrame.promessa_da_capa,
    angle: generatedSpine?.["Ângulo escolhido"] || editorialFrame.angulo_narrativo,
    innovationClose: editorialFrame.frase_final,
    factCentral: editorialFrame.fato_central,
    realShift: editorialFrame.mudanca_real,
    tension: editorialFrame.tensao_central,
    mechanism: editorialFrame.mecanismo,
    thesis: editorialFrame.tese_editorial,
    consequence: editorialFrame.consequencia,
    audienceImplication: editorialFrame.implicacao_para_o_publico,
    coverPromise: editorialFrame.promessa_da_capa,
    proofs: editorialFrame.provas_do_argumento,
    editorialDirection: editorialFrame.direcao_de_conteudo,
    changeType: editorialFrame.tipo_de_mudanca,
    qualityGate: editorialFrame.qualityGate,
    editorialFrame,
    triageSnapshot: generatedTriage,
    headlinesSnapshot: generatedHeadlines,
    selectedHeadlineNumber,
    spineSnapshot: generatedSpine,
    selectedTemplate,
    generatedFinalRenderSnapshot: generatedFinalRender,
    generationMode: brief.aiPack ? "openai" : "fallback",
    caption: compactText(buildCaption(brief, niche), 700),
    ...formatArtifacts,
    cta: "Feche pedindo que a audiencia diga qual mudança está sendo subestimada e quem deve capturar vantagem primeiro.",
    reviewChecklist: [
      "A capa promete uma leitura forte e não um resumo da manchete.",
      "A tese explica o que está mudando de verdade.",
      "O fechamento conecta o caso ao tema central com consequência concreta."
    ],
    scores: brief.scores
  };
}

export function buildContentBatch(snapshot, options = {}) {
  const maxDrafts = Math.max(1, Number(options.maxDrafts) || 3);
  const createdAt = options.createdAt || new Date().toISOString();
  const minQualityScore = Number(options.minQualityScore) || 68;
  const allDrafts = (snapshot.briefs ?? [])
    .map((brief) => buildContentDraft(brief, snapshot.niche, { createdAt }))
    .sort((left, right) => (
      (right.qualityGate?.score || 0) - (left.qualityGate?.score || 0) ||
      (right.scores?.totalScore || 0) - (left.scores?.totalScore || 0)
    ));
  const approvedDrafts = allDrafts.filter((draft) => (
    draft.qualityGate?.pass !== false &&
    (draft.qualityGate?.score || 0) >= minQualityScore
  ));
  const drafts = (approvedDrafts.length > 0 ? approvedDrafts : allDrafts)
    .slice(0, maxDrafts);

  return {
    agentName: options.agentName || "Agente de Conteudo de Inovacao",
    generatedAt: createdAt,
    niche: snapshot.niche,
    source: snapshot.source,
    trackedItems: snapshot.summary?.trackedItems ?? 0,
    drafts,
    filteredOut: Math.max(0, allDrafts.length - drafts.length)
  };
}

export function buildContentDraftFromResearchItem(item, niche, options = {}) {
  const brief = buildEditorialBrief({
    ...item,
    source: item.source || item.sourceName,
    agentScores: item.scores ?? item.agentScores
  }, niche, 0);

  return buildContentDraft(brief, niche, options);
}
