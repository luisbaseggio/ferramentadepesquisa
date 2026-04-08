import path from "node:path";
import { contentFormatLabel } from "./content-formats.js";
import { resolveEditorialVoice } from "./editorial-voice.js";

const CAROUSEL_TEMPLATE_OPTIONS = [
  "1) Template Principal (18 blocos)",
  "2) Template Futurista (14 textos / 10 slides)",
  "3) Template Contínuo (18 blocos)",
  "4) Template Twitter (21 blocos)"
];

const SINGLE_POST_TEMPLATE_OPTIONS = [
  "1) Tese direta",
  "2) Tese + desenvolvimento",
  "3) Opinião autoral curta",
  "4) Insight + chamada"
];

const THREAD_TEMPLATE_OPTIONS = [
  "1) Thread de análise",
  "2) Thread de conflito",
  "3) Thread de tese",
  "4) Thread prático-estratégica"
];

const REELS_TEMPLATE_OPTIONS = [
  "1) Reels gancho de conflito",
  "2) Reels contraste de futuro",
  "3) Reels opinião forte",
  "4) Reels alerta + oportunidade"
];

function safeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function compact(value, maxLength = 220) {
  const text = safeText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripLead(text, patterns) {
  let result = safeText(text);

  patterns.forEach((pattern) => {
    result = result.replace(pattern, "");
  });

  return result.trim();
}

function titleFromHook(hook, fallbackTitle = "Tema aprovado") {
  const candidate = stripLead(hook, [/^Se\s+/i, /\s+ja esta.*$/i]);
  return candidate || safeText(fallbackTitle);
}

function capitalize(text) {
  const value = safeText(text);
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function withTerminal(text, terminal) {
  const value = safeText(text).replace(/[?!:.]+$/g, "");
  return value ? `${value}${terminal}` : terminal;
}

function resolveFrame(draft) {
  const frame = draft.editorialFrame || {};

  return {
    fato_central: safeText(frame.fato_central || draft.factCentral || draft.sourceTitle || draft.title),
    mudanca_real: safeText(frame.mudanca_real || draft.realShift || draft.hook),
    sinal_real: safeText(frame.sinal_real || draft.angle),
    tipo_de_mudanca: safeText(frame.tipo_de_mudanca || draft.changeType || "mercado"),
    mecanismo: safeText(frame.mecanismo || draft.mechanism || draft.angle),
    tensao_central: safeText(frame.tensao_central || draft.tension || draft.angle),
    ponte_editorial: safeText(frame.ponte_editorial || draft.crossThemeBridge || ""),
    tese_editorial: safeText(frame.tese_editorial || draft.thesis || draft.innovationClose),
    direcao_de_conteudo: safeText(frame.direcao_de_conteudo || draft.editorialDirection || "carrossel de tese"),
    angulo_narrativo: safeText(frame.angulo_narrativo || draft.angle),
    promessa_da_capa: safeText(frame.promessa_da_capa || draft.coverPromise || draft.hook),
    provas_do_argumento: Array.isArray(frame.provas_do_argumento) && frame.provas_do_argumento.length > 0
      ? frame.provas_do_argumento
      : Array.isArray(draft.proofs) && draft.proofs.length > 0
        ? draft.proofs
        : [
            draft.sourceTitle ? `O fato-base capturado foi "${safeText(draft.sourceTitle)}".` : "",
            draft.sourceName ? `A fonte principal foi ${safeText(draft.sourceName)}.` : "",
            draft.scores?.signals?.length ? `Os sinais editoriais vieram de ${draft.scores.signals.join(", ")}.` : ""
          ].filter(Boolean),
    implicacao_para_o_publico: safeText(frame.implicacao_para_o_publico || draft.audienceImplication || draft.caption),
    consequencia: safeText(frame.consequencia || draft.consequence || draft.innovationClose),
    frase_final: safeText(frame.frase_final || draft.innovationClose)
  };
}

function buildTransformation(draft) {
  const frame = resolveFrame(draft);
  return compact(
    `${frame.fato_central} deixou de ser só notícia e passou a sustentar uma tese sobre ${frame.mudanca_real.toLowerCase()}`,
    320
  );
}

function buildFriction(draft) {
  const frame = resolveFrame(draft);
  return compact(
    frame.tensao_central,
    260
  );
}

function buildEvidenceLines(draft) {
  const frame = resolveFrame(draft);
  const proofs = frame.provas_do_argumento.slice(0, 3);

  while (proofs.length < 3) {
    if (proofs.length === 0) {
      proofs.push(`O fato-base capturado foi "${compact(draft.sourceTitle || draft.title, 160)}".`);
    } else if (proofs.length === 1) {
      proofs.push(`A fonte principal foi ${compact(draft.sourceName || "Fonte pública", 160)}.`);
    } else {
      proofs.push(`O caso chegou com sinais de ${(draft.scores?.signals || []).join(", ") || "mudança editorial"}.`);
    }
  }

  return proofs.map((proof, index) => `${String.fromCharCode(65 + index)}) ${compact(proof, 190)}`).join("<br>");
}

function buildAngleSummary(draft) {
  const frame = resolveFrame(draft);
  return compact(
    `${frame.angulo_narrativo} A tese central está em ${frame.tese_editorial.toLowerCase()}`,
    220
  );
}

function buildHeadlineOptions(draft) {
  const frame = resolveFrame(draft);
  const core = titleFromHook(frame.promessa_da_capa || draft.hook, draft.title).toLowerCase();
  const niche = safeText(draft.niche);
  const thesis = compact(frame.tese_editorial, 120);
  const consequence = compact(frame.consequencia, 120);
  const mechanism = compact(frame.mecanismo, 120);
  const bridge = compact(frame.ponte_editorial || frame.implicacao_para_o_publico, 120);
  const implication = compact(frame.implicacao_para_o_publico, 120);
  const source = safeText(draft.sourceName || "uma fonte pública");

  const options = [
    [`O que ${core} realmente revela?`, `${thesis}`],
    [`O conflito escondido por trás de ${core}:`, `${mechanism}`],
    [`Se ${core} continuar, o que muda no sistema?`, `${bridge}`],
    [`${capitalize(core)} parece avanço. Mas carrega uma contradição?`, `${consequence}`],
    [`${capitalize(core)} abre ameaça ou oportunidade?`, `${consequence}`],
    [`Como nomear ${core} do jeito certo?`, `${mechanism}`],
    [`O que ${core} diz sobre o momento atual?`, `${implication}`],
    [`${capitalize(core)} parece detalhe. Mas inverte o jogo?`, `${thesis}`],
    [`Quem cresce se ${core} ganhar tração?`, `${bridge}`],
    [`Por que ${core} ganha tanta atenção agora?`, `${source} ajuda a ancorar uma disputa maior que a manchete.`]
  ];

  return options.map(([line1, line2], index) => ({
    number: index + 1,
    line1: withTerminal(line1, index === 2 || index === 3 ? ":" : "?"),
    line2: withTerminal(line2, index === 5 ? "!" : ".")
  }));
}

function buildSelectedHeadline(headline) {
  return `${headline.line1}<br>${headline.line2}`;
}

function buildSpine(draft, headline) {
  const frame = resolveFrame(draft);
  const pieceLabel = draft.format === "reels-curto"
    ? "O roteiro deve abrir forte, sustentar tensão e fechar com uma ideia simples de repetir em vídeo."
    : draft.format === "thread-x"
      ? "A thread deve sair da manchete, destrinchar o mecanismo e fechar com uma tese clara."
      : draft.format === "post-unico"
        ? "O post precisa condensar tese, atrito e consequência em um texto curto e forte."
        : "O carrossel deve sair da manchete, nomear o mecanismo, provar a tese e fechar com a direção estratégica que emerge.";

  return {
    "Ângulo escolhido": compact(frame.angulo_narrativo, 240),
    Hook: compact(frame.promessa_da_capa, 240),
    "Fato-base": compact(frame.fato_central, 220),
    Mecanismo: compact(frame.mecanismo, 280),
    Prova: buildEvidenceLines(draft),
    Aplicação: compact(
      `${frame.implicacao_para_o_publico} ${frame.consequencia}`,
      280
    ),
    Direção: compact(`${pieceLabel} Em ${draft.niche}, a leitura final deve sustentar a tese "${frame.tese_editorial}".`, 240)
  };
}

function templateOptionsForFormat(format) {
  if (format === "post-unico") {
    return SINGLE_POST_TEMPLATE_OPTIONS;
  }

  if (format === "thread-x") {
    return THREAD_TEMPLATE_OPTIONS;
  }

  if (format === "reels-curto") {
    return REELS_TEMPLATE_OPTIONS;
  }

  return CAROUSEL_TEMPLATE_OPTIONS;
}

function buildTemplateBlocks(template, draft, headline, spine) {
  const frame = resolveFrame(draft);
  const voice = resolveEditorialVoice(draft.niche);
  const title = titleFromHook(frame.promessa_da_capa || draft.hook, draft.title);
  const evidence = [
    compact(frame.fato_central, 180),
    compact(`Prova: ${frame.provas_do_argumento[0] || `Fonte: ${draft.sourceName || "Fonte pública"}.`}`, 180),
    compact(`Leitura: ${frame.provas_do_argumento[1] || frame.ponte_editorial || `Sinal editorial: ${(draft.scores?.signals || []).join(", ") || "tensão"}.`}`, 180)
  ];
  const attributionLine = compact(
    `Produzido com ajuda de Inteligência Artificial inspirado no artigo: "${draft.sourceTitle || draft.title}" — ${draft.sourceName || "Fonte pública"}.`,
    220
  );
  const shortThemeMarker = compact(voice.markerLine, 120);
  const continuousMarker = compact(`Esse deslocamento muda toda a leitura do caso.`, 120);
  const practicalMarker = compact(voice.closingFrame, 160);
  const carouselBlocksByTemplate = {
    1: [
      headline.line1,
      headline.line2,
      compact(`O ponto central não está em ${title.toLowerCase()}.`, 150),
      compact(`${frame.sinal_real} ${frame.fato_central}`, 210),
      compact(`Quando o mercado lê esse caso só como episódio, perde o que ele já revela sobre redistribuição de poder, regra ou margem.`, 210),
      compact(`A resposta mais forte aparece em outra camada: ${frame.mecanismo}`, 210),
      compact(shortThemeMarker, 120),
      compact(`${frame.ponte_editorial || frame.implicacao_para_o_publico} ${frame.tensao_central}`, 220),
      compact(`Isso muda o centro do valor percebido. O caso deixa de ser ruído momentâneo e vira critério para interpretar o próximo ciclo.`, 210),
      compact(frame.consequencia, 210),
      compact(`O ativo principal já não é só o fato. É a leitura que consegue organizar o que muda mais rápido que o consenso.`, 190),
      evidence[0],
      evidence[1],
      evidence[2],
      compact(practicalMarker, 150),
      compact(frame.implicacao_para_o_publico, 200),
      compact(frame.tese_editorial, 210),
      attributionLine
    ],
    2: [
      headline.line1,
      headline.line2,
      compact(`O retorno de ${title.toLowerCase()} não é só sobre o fato em si.`, 170),
      compact(`${frame.sinal_real} ${frame.mecanismo}`, 200),
      compact(`Quando tudo parece caminhar numa direção previsível, é o contraste que volta a capturar atenção e reorganizar leitura.`, 180),
      compact(frame.tensao_central, 180),
      compact(continuousMarker, 120),
      compact(`${frame.ponte_editorial || frame.implicacao_para_o_publico} ${frame.consequencia}`, 200),
      compact(`O valor aqui está no atrito: o caso parece pequeno, mas produz distância do padrão dominante e abre outra interpretação do presente.`, 200),
      compact(frame.tese_editorial, 180),
      compact(`Por isso o tema importa além da manchete.`, 120),
      compact(frame.implicacao_para_o_publico, 180),
      compact(frame.frase_final, 180),
      compact(spine.Direção, 170)
    ],
    3: [
      headline.line1,
      headline.line2,
      compact(`O caso não cresce só por ${title.toLowerCase()}.`, 160),
      compact(`Ele cresce porque reorganiza a forma como o problema passa a ser lido.`, 170),
      compact(continuousMarker, 120),
      compact(`${frame.fato_central} ${frame.sinal_real}`, 210),
      compact(`${frame.tensao_central} ${frame.mecanismo}`, 220),
      compact(`Primeiro vem o frame. Depois vem a explicação. E, muitas vezes, quem vence esse começo vence boa parte do jogo.`, 190),
      compact(shortThemeMarker, 120),
      compact(`${frame.ponte_editorial || frame.implicacao_para_o_publico} ${frame.consequencia}`, 220),
      compact(`Muita gente acha que a melhor solução vence sozinha. Nem sempre. Muitas vezes, vence a que parece mais clara, urgente e defensável cedo.`, 200),
      compact(`É por isso que tantos movimentos bons fracassam: chegam com recurso, mas sem leitura forte o bastante para ficar na cabeça.`, 190),
      compact(`A força do caso está em deixar isso visível.`, 130),
      compact(frame.tese_editorial, 200),
      compact(frame.implicacao_para_o_publico, 180),
      compact(frame.frase_final, 180),
      compact(`Quem lê isso cedo ganha posição antes do consenso.`, 150),
      attributionLine
    ],
    4: [
      headline.line1,
      headline.line2,
      compact(`A história de ${title} parece localizada.`, 120),
      "Não está.",
      compact(frame.fato_central, 150),
      compact(frame.sinal_real, 150),
      "O erro começa quando o caso vira só comentário.",
      compact(frame.tensao_central, 150),
      compact(frame.mecanismo, 150),
      evidence[0],
      evidence[1],
      evidence[2],
      compact(`É aqui que ${draft.niche} entra como tese.`, 130),
      compact(frame.ponte_editorial || frame.implicacao_para_o_publico, 150),
      compact(frame.consequencia, 150),
      "Quem percebe cedo move posição.",
      compact(frame.tese_editorial, 150),
      compact(frame.implicacao_para_o_publico, 150),
      compact(frame.frase_final, 150),
      "Ele antecipa a próxima leitura forte.",
      attributionLine
    ]
  };

  if (draft.format === "post-unico") {
    const singleBlocksByTemplate = {
      1: [headline.line1, draft.hook, spine.Mecanismo, spine.Aplicação],
      2: [headline.line1, headline.line2, spine.Hook, spine.Mecanismo, spine.Aplicação],
      3: [headline.line1, `Minha leitura: ${spine.Mecanismo}`, spine.Aplicação],
      4: [headline.line1, spine.Hook, "O ponto não é o ruído. É o que isso anuncia.", spine.Aplicação]
    };

    return singleBlocksByTemplate[template] ?? singleBlocksByTemplate[1];
  }

  if (draft.format === "thread-x") {
    const threadBlocksByTemplate = {
      1: [headline.line1, "1/ O caso parece pontual.", "2/ Não é.", `3/ ${spine.Hook}`, `4/ ${spine.Mecanismo}`, `5/ ${spine.Aplicação}`, "6/ A mudança real está na redistribuição de vantagem.", "7/ Quem percebe cedo move posição.", "8/ O resto reage tarde."],
      2: [headline.line1, "1/ O conflito é real.", `2/ ${spine.Hook}`, "3/ O erro é tratar como exceção.", `4/ ${spine.Mecanismo}`, "5/ Esse atrito escolhe vencedores.", `6/ ${spine.Aplicação}`],
      3: [headline.line1, `1/ ${spine.Hook}`, `2/ ${spine.Mecanismo}`, "3/ O mercado reage ao barulho.", "4/ A tese está no mecanismo.", `5/ ${spine.Aplicação}`, "6/ Essa é a leitura forte."],
      4: [headline.line1, "1/ O que está em jogo?", `2/ ${spine.Hook}`, `3/ ${spine.Mecanismo}`, "4/ Onde está a oportunidade?", `5/ ${spine.Aplicação}`, "6/ Quem usar isso primeiro ganha leitura e timing."]
    };

    return threadBlocksByTemplate[template] ?? threadBlocksByTemplate[1];
  }

  if (draft.format === "reels-curto") {
    const reelsBlocksByTemplate = {
      1: ["Cena 1 - Gancho", headline.line1, "Cena 2 - Contexto", spine.Hook, "Cena 3 - Tensão", spine.Mecanismo, "Cena 4 - Fechamento", spine.Aplicação],
      2: ["Cena 1 - Contraste", headline.line1, "Cena 2 - O que ninguém está vendo", spine.Mecanismo, "Cena 3 - O que muda agora", spine.Aplicação, "Cena 4 - CTA", "Você reagiria ou construiria em cima disso?"],
      3: ["Cena 1 - Opinião", headline.line1, "Cena 2 - Minha tese", spine.Hook, "Cena 3 - Por quê", spine.Mecanismo, "Cena 4 - Oportunidade", spine.Aplicação],
      4: ["Cena 1 - Alerta", headline.line1, "Cena 2 - A maior leitura errada", "Tratar isso como detalhe.", "Cena 3 - O que realmente importa", spine.Mecanismo, "Cena 4 - O próximo passo", spine.Aplicação]
    };

    return reelsBlocksByTemplate[template] ?? reelsBlocksByTemplate[1];
  }

  return carouselBlocksByTemplate[template] ?? carouselBlocksByTemplate[1];
}

function buildFinalRender(draft, headline, spine, template) {
  const blocks = buildTemplateBlocks(template, draft, headline, spine);
  const prefix = draft.format === "reels-curto"
    ? "cena"
    : draft.format === "thread-x"
      ? "tweet"
      : draft.format === "post-unico"
        ? "bloco"
        : "texto";

  return blocks.map((block, index) => `${prefix} ${index + 1} - ${compact(block, 220)}`).join("\n");
}

function renderMarkdownTable(entries) {
  const lines = [
    "| Campo | Extrato |",
    "|---|---|"
  ];

  Object.entries(entries).forEach(([field, value]) => {
    lines.push(`| ${field} | ${value} |`);
  });

  return lines.join("\n");
}

function renderHeadlinesSection(headlines, angleSummary) {
  const lines = [
    `Ângulo dominante selecionado: ${angleSummary}`,
    "A seguir: a escolha da headline 1–10 define a capa do post.",
    ""
  ];

  headlines.forEach((headline) => {
    lines.push(`${headline.number}. ${headline.line1}`);
    lines.push(headline.line2);
    lines.push("");
  });

  lines.push("Escolhe 1–10. Se quiser, pedir “refazer headlines”.");
  return lines.join("\n");
}

export function buildContentMachinePacket(draft, options = {}) {
  const templateOptions = templateOptionsForFormat(draft.format);
  const headlines = Array.isArray(draft.headlinesSnapshot) && draft.headlinesSnapshot.length > 0
    ? draft.headlinesSnapshot
    : buildHeadlineOptions(draft);
  const selectedHeadlineNumber = Math.min(
    Math.max(Number(options.selectedHeadlineNumber ?? draft.selectedHeadlineNumber) || 1, 1),
    headlines.length
  );
  const selectedTemplate = Math.min(
    Math.max(Number(options.selectedTemplate ?? draft.selectedTemplate) || 1, 1),
    templateOptions.length
  );
  const selectedHeadline = headlines[selectedHeadlineNumber - 1];
  const frame = resolveFrame(draft);
  const triage = draft.triageSnapshot || {
    Transformacao: buildTransformation(draft),
    "Friccao central": buildFriction(draft),
    "Angulo narrativo dominante": buildAngleSummary(draft),
    "Evidencias do insumo": buildEvidenceLines(draft)
  };
  const spine = draft.spineSnapshot || buildSpine(draft, selectedHeadline);
  const canReuseGeneratedRender = Boolean(draft.generatedFinalRenderSnapshot)
    && selectedTemplate === (Number(draft.selectedTemplate) || selectedTemplate)
    && selectedHeadlineNumber === (Number(draft.selectedHeadlineNumber) || selectedHeadlineNumber);
  const generatedFinalRender = canReuseGeneratedRender
    ? draft.generatedFinalRenderSnapshot
    : buildFinalRender(draft, selectedHeadline, spine, selectedTemplate);
  const manualFinalRender = String(options.manualFinalRender ?? "").trim();
  const finalRender = manualFinalRender || generatedFinalRender;
  const aiPrompt = String(options.aiPrompt ?? "").trim();
  const newsContext = String(options.newsContext ?? "").trim();
  const markdown = [
    `# ${draft.title}`,
    "",
    `Formato: ${contentFormatLabel(draft.format || "carrossel-instagram")}`,
    "",
    "## Etapa 1 — Triagem",
    "",
    renderMarkdownTable({
      "Transformação": triage.Transformacao,
      "Fricção central": triage["Friccao central"],
      "Ângulo narrativo dominante": triage["Angulo narrativo dominante"],
      "Evidências do insumo": triage["Evidencias do insumo"]
    }),
    "",
    'Digite "ok" para seguir para as headlines.',
    "",
    "## Etapa 2 — Headlines",
    "",
    renderHeadlinesSection(headlines, triage["Angulo narrativo dominante"]),
    "",
    "## Etapa 3 — Espinha Dorsal",
    "",
    renderMarkdownTable(spine),
    "",
    'Digite "ok" para escolher o template.',
    "",
    "## Etapa 4 — Escolha do Template",
    "",
    templateOptions.join("\n"),
    "",
    "Escolhe 1–4.",
    "",
    "## Etapa 5 — Render Final",
    "",
    "```md",
    finalRender,
    "```",
    "",
    "## Box de Prompt Para Ajuste",
    "",
    aiPrompt || "Sem prompt salvo ainda.",
    "",
    "## Contexto Colado",
    "",
    newsContext || "Sem contexto colado ainda."
  ].join("\n");

  return {
    id: draft.id,
    niche: draft.niche,
    title: draft.title,
    format: draft.format || "carrossel-instagram",
    formatLabel: contentFormatLabel(draft.format || "carrossel-instagram"),
    reviewNotes: draft.reviewNotes || "",
    sourceTitle: draft.sourceTitle,
    sourceLink: draft.sourceLink,
    sourceName: draft.sourceName,
    generatedAt: new Date().toISOString(),
    selectedHeadlineNumber,
    selectedTemplate,
    evaluationStatus: options.evaluationStatus || "pending",
    evaluationScore: Number(options.evaluationScore) || 0,
    evaluationNotes: options.evaluationNotes || "",
    triage,
    headlines,
    selectedHeadline,
    spine,
    templateOptions,
    generatedFinalRender,
    manualFinalRender,
    finalRender,
    aiPrompt,
    newsContext,
    markdown,
    outputFileName: `${draft.id}.md`,
    outputRelativePath: path.join("approved-files", `${draft.id}.md`),
    draftSnapshot: {
      id: draft.id,
      niche: draft.niche,
      format: draft.format || "carrossel-instagram",
      title: draft.title,
      sourceTitle: draft.sourceTitle,
      sourceLink: draft.sourceLink,
      sourceName: draft.sourceName,
      hook: draft.hook,
      angle: draft.angle,
      innovationClose: draft.innovationClose,
      factCentral: draft.factCentral,
      realShift: draft.realShift,
      tension: draft.tension,
      mechanism: draft.mechanism,
      thesis: draft.thesis,
      consequence: draft.consequence,
      audienceImplication: draft.audienceImplication,
      coverPromise: draft.coverPromise,
      proofs: draft.proofs,
      editorialDirection: draft.editorialDirection,
      changeType: draft.changeType,
      qualityGate: draft.qualityGate,
      editorialFrame: draft.editorialFrame || frame,
      triageSnapshot: draft.triageSnapshot || triage,
      headlinesSnapshot: draft.headlinesSnapshot || headlines,
      selectedHeadlineNumber,
      spineSnapshot: draft.spineSnapshot || spine,
      selectedTemplate,
      generatedFinalRenderSnapshot: draft.generatedFinalRenderSnapshot || generatedFinalRender,
      generationMode: draft.generationMode || "fallback",
      caption: draft.caption,
      scores: draft.scores,
      reviewNotes: draft.reviewNotes || "",
      manualFinalRender,
      aiPrompt,
      newsContext,
      evaluationStatus: options.evaluationStatus || "pending",
      evaluationScore: Number(options.evaluationScore) || 0,
      evaluationNotes: options.evaluationNotes || ""
    }
  };
}
