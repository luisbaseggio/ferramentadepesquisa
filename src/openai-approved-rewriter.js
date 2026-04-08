const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const DEFAULT_OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/responses";

function safeText(value) {
  return String(value ?? "").trim();
}

function normalizeComparableText(value) {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function extractResponseOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts = [];

  for (const outputItem of payload?.output ?? []) {
    for (const contentItem of outputItem?.content ?? []) {
      if (contentItem?.type === "output_text" && typeof contentItem.text === "string") {
        texts.push(contentItem.text.trim());
      }
    }
  }

  return texts.filter(Boolean).join("\n\n").trim();
}

function buildRewritePrompt(packet, currentRender, aiPrompt, sourceContext, mode = "rewrite") {
  const selectedTemplate = packet?.templateOptions?.[Math.max((packet?.selectedTemplate || 1) - 1, 0)] || "";
  const selectedHeadline = [
    packet?.selectedHeadline?.line1 || "",
    packet?.selectedHeadline?.line2 || ""
  ].filter(Boolean).join("\n");
  const context = safeText(sourceContext || packet?.newsContext || "");

  return [
    "Você vai trabalhar em cima de um aprovado do Content Machine 5.4.",
    currentRender ? "Reescreva o render final usando o contexto disponível." : "Gere um render final do zero usando o contexto disponível.",
    "Mantenha o idioma em português do Brasil.",
    "Obedeça a um fluxo rígido e não misture formatos.",
    "Não explique o que fez.",
    "Não use markdown code fences.",
    "Não use metalinguagem.",
    "Não use segunda pessoa.",
    "Não use a palavra cena.",
    "Não invente fatos, números, datas, locais ou fontes.",
    "Não faça acusações diretas a pessoas ou empresas.",
    "Evite tom genérico, decorativo, publicitário ou abstrato.",
    "Não explique por que o gancho, a headline ou a estrutura foram escolhidos.",
    "Não escreva bastidor, comentário de processo ou justificativa de etapa.",
    "O texto final deve soar como história editorial pronta para Instagram.",
    "O texto final precisa funcionar como storytelling de carrossel, com progressão real entre os blocos.",
    "A abertura precisa ser forte, curta e memorável.",
    "Os blocos seguintes precisam desenvolver a história com racionalidade, mecanismo e consequência.",
    "O leitor não deve sentir que está lendo uma explicação do processo ou um relatório sobre a notícia.",
    "A reescrita precisa ser substantiva. Não devolva o mesmo texto com microajustes.",
    "Se houver render atual, use-o apenas como referência do tema e da direção, não como texto a preservar.",
    "Não use no texto final palavras como: gancho, headline, subtítulo, debate, por que agora, etapa, estrutura, fechamento.",
    "Não transforme o texto em aula, relatório ou parecer.",
    "Priorize tensão, contraste, consequência e mecanismo.",
    "Evite frases burocráticas como 'o caso mostra', 'o dado mostra', 'a prova está' quando elas soarem mecânicas.",
    "Transforme a notícia em uma leitura maior, em vez de comentar a notícia de fora.",
    "Mantenha a tese central, o ângulo escolhido, o mecanismo, a prova e a direção do fechamento.",
    "Entregue somente o render final reescrito.",
    "Respeite a quantidade de blocos e a nomenclatura do template escolhido.",
    "",
    `Formato: ${safeText(packet.formatLabel || packet.format || "conteudo")}`,
    `Template escolhido: ${safeText(selectedTemplate)}`,
    `Titulo da pauta: ${safeText(packet.title)}`,
    `Fonte base: ${safeText(packet.sourceTitle || packet.sourceName || "")}`,
    selectedHeadline ? `Headline escolhida:\n${selectedHeadline}` : "",
    packet?.triage ? `Triagem:\nTransformação: ${safeText(packet.triage.Transformacao || "")}\nFricção central: ${safeText(packet.triage["Friccao central"] || "")}\nÂngulo narrativo dominante: ${safeText(packet.triage["Angulo narrativo dominante"] || "")}` : "",
    packet?.spine ? `Espinha dorsal:\nHook: ${safeText(packet.spine.Hook || "")}\nFato-base: ${safeText(packet.spine["Fato-base"] || "")}\nMecanismo: ${safeText(packet.spine.Mecanismo || "")}\nAplicação: ${safeText(packet.spine.Aplicação || "")}\nDireção: ${safeText(packet.spine.Direção || "")}` : "",
    "",
    context ? `Contexto colado pelo usuário:\n${context}` : "Contexto colado pelo usuário: sem contexto adicional.",
    "",
    currentRender ? `Render atual:\n${currentRender}` : "Render atual: vazio ou descartado.",
    "",
    mode === "rebuild"
      ? "Instrução extra: a versão anterior ficou parecida demais com o original. Reescreva do zero, mudando fraseado, encadeamento e ritmo dos blocos."
      : "Instrução extra: entregue uma versão claramente melhor e diferente do texto atual.",
    "",
    "Ajuste pedido:",
    aiPrompt
  ].join("\n");
}

export function createApprovedPromptRewriter({
  apiKey = process.env.OPENAI_API_KEY || "",
  model = DEFAULT_OPENAI_MODEL,
  apiUrl = DEFAULT_OPENAI_API_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  return {
    isConfigured() {
      return Boolean(apiKey);
    },
    async rewriteApprovedPacket(packet, { aiPrompt, currentRender, newsContext }) {
      if (!apiKey) {
        throw new Error("Defina OPENAI_API_KEY para aplicar ajustes com GPT.");
      }

      if (typeof fetchImpl !== "function") {
        throw new Error("Fetch indisponivel para chamar a OpenAI.");
      }

      const prompt = safeText(aiPrompt) || "Reconstrua a peça com base no contexto colado. Não faça polimento leve: reescreva de forma substantiva, com storytelling melhor, mais clareza e mais força narrativa.";
      const render = safeText(currentRender || packet?.finalRender || packet?.generatedFinalRender);
      const context = safeText(newsContext || packet?.newsContext || "");

      if (!render && !context) {
        throw new Error("Cole a notícia ou mantenha um render atual para usar o GPT.");
      }

      const requestRewrite = async (mode = "rewrite") => {
        const response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            input: buildRewritePrompt(packet, render, prompt, context, mode),
            max_output_tokens: 1400
          })
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error?.message || payload?.message || "Falha ao gerar ajuste com GPT.");
        }

        return extractResponseOutputText(payload);
      };

      let rewrittenText = await requestRewrite("rewrite");

      if (
        rewrittenText &&
        render &&
        normalizeComparableText(rewrittenText) === normalizeComparableText(render)
      ) {
        rewrittenText = await requestRewrite("rebuild");
      }

      if (!rewrittenText) {
        throw new Error("A OpenAI nao retornou texto util para substituir o render final.");
      }

      return {
        model,
        rewrittenText
      };
    }
  };
}
