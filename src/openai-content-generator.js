import { contentFormatLabel } from "./content-formats.js";
import { resolveEditorialVoice } from "./editorial-voice.js";
import { extractResponseOutputText } from "./openai-approved-rewriter.js";

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-5.4";
const DEFAULT_OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/responses";

function safeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function blockCountForTemplate(templateNumber) {
  if (templateNumber === 2) {
    return 14;
  }

  if (templateNumber === 4) {
    return 21;
  }

  return 18;
}

function extractJsonObject(text) {
  const direct = safeText(text);

  if (!direct) {
    throw new Error("A OpenAI não retornou conteúdo para o gerador editorial.");
  }

  try {
    return JSON.parse(direct);
  } catch {}

  const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = direct.indexOf("{");
  const end = direct.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return JSON.parse(direct.slice(start, end + 1));
  }

  throw new Error("Não foi possível extrair JSON válido da resposta da OpenAI.");
}

function normalizeHeadline(item, index) {
  return {
    number: index + 1,
    line1: safeText(item?.line1 || item?.linha1 || ""),
    line2: safeText(item?.line2 || item?.linha2 || "")
  };
}

function normalizeStringArray(values, fallback = []) {
  if (!Array.isArray(values)) {
    return fallback;
  }

  return values.map((value) => safeText(value)).filter(Boolean);
}

function normalizeRenderFinal(renderFinal, templateNumber) {
  const lines = String(renderFinal ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const total = blockCountForTemplate(templateNumber);
  const normalized = [];

  for (let index = 0; index < total; index += 1) {
    const raw = lines[index] || `texto ${index + 1} -`;
    const content = raw.replace(/^texto\s+\d+\s*-\s*/i, "").trim();
    normalized.push(`texto ${index + 1} - ${content}`.trimEnd());
  }

  return normalized.join("\n");
}

function normalizeGeneratedPack(rawPack, brief, niche, format) {
  const headlines = Array.from({ length: 10 }, (_, index) => normalizeHeadline(rawPack?.headlines?.[index], index));
  const selectedHeadlineNumber = Math.min(
    10,
    Math.max(1, Number(rawPack?.selectedHeadlineNumber || rawPack?.headlineEscolhida || 1))
  );
  const selectedTemplate = Math.min(
    4,
    Math.max(1, Number(rawPack?.selectedTemplate || rawPack?.templateEscolhido || 1))
  );
  const triage = rawPack?.triage || {};
  const spine = rawPack?.spine || {};
  const frame = rawPack?.editorialFrame || {};
  const qualityGate = rawPack?.qualityGate || {};

  return {
    title: safeText(rawPack?.title || brief.title),
    format: safeText(format || rawPack?.format || "carrossel-instagram"),
    triage: {
      Transformacao: safeText(triage.Transformacao || triage.transformacao || brief.whyNow),
      "Friccao central": safeText(triage["Friccao central"] || triage.friccao_central || brief.debateAngle),
      "Angulo narrativo dominante": safeText(triage["Angulo narrativo dominante"] || triage.angulo_narrativo_dominante || brief.debateAngle),
      "Evidencias do insumo": safeText(triage["Evidencias do insumo"] || triage.evidencias_do_insumo || brief.snippet || brief.title)
    },
    headlines,
    selectedHeadlineNumber,
    spine: {
      "Ângulo escolhido": safeText(spine["Ângulo escolhido"] || spine.angulo_escolhido || brief.debateAngle),
      Hook: safeText(spine.Hook || spine.hook || brief.polarizingHook),
      "Fato-base": safeText(spine["Fato-base"] || spine.fato_base || brief.title),
      Mecanismo: safeText(spine.Mecanismo || spine.mecanismo || brief.debateAngle),
      Prova: safeText(spine.Prova || spine.prova || brief.snippet || brief.title),
      Aplicação: safeText(spine["Aplicação"] || spine.aplicacao || brief.whyItMattersToNiche || brief.innovationClose),
      Direção: safeText(spine.Direção || spine.direcao || brief.innovationClose)
    },
    selectedTemplate,
    generatedFinalRender: normalizeRenderFinal(rawPack?.renderFinal || rawPack?.render_final, selectedTemplate),
    editorialFrame: {
      fato_central: safeText(frame.fato_central || brief.title),
      mudanca_real: safeText(frame.mudanca_real || brief.whyNow),
      sinal_real: safeText(frame.sinal_real || brief.debateAngle),
      tipo_de_mudanca: safeText(frame.tipo_de_mudanca || "mercado"),
      mecanismo: safeText(frame.mecanismo || spine.Mecanismo || spine.mecanismo || brief.debateAngle),
      tensao_central: safeText(frame.tensao_central || triage["Friccao central"] || triage.friccao_central || brief.debateAngle),
      ponte_editorial: safeText(frame.ponte_editorial || brief.crossThemeBridge || brief.whyItMattersToNiche),
      tese_editorial: safeText(frame.tese_editorial || brief.innovationClose),
      direcao_de_conteudo: safeText(frame.direcao_de_conteudo || "carrossel de tese"),
      formato_sugerido: safeText(frame.formato_sugerido || format || "carrossel-instagram"),
      angulo_narrativo: safeText(frame.angulo_narrativo || brief.debateAngle),
      promessa_da_capa: safeText(frame.promessa_da_capa || `${headlines[selectedHeadlineNumber - 1]?.line1 || ""} ${headlines[selectedHeadlineNumber - 1]?.line2 || ""}`),
      provas_do_argumento: normalizeStringArray(frame.provas_do_argumento, [brief.title, brief.snippet, brief.source].filter(Boolean)),
      implicacao_para_o_publico: safeText(frame.implicacao_para_o_publico || brief.whyItMattersToNiche || resolveEditorialVoice(niche).implicationFrame),
      consequencia: safeText(frame.consequencia || brief.innovationClose),
      frase_final: safeText(frame.frase_final || brief.innovationClose),
      estrutura_do_carrossel: Array.isArray(frame.estrutura_do_carrossel)
        ? frame.estrutura_do_carrossel.map((slide, index) => ({
            label: safeText(slide?.label || `Slide ${index + 1}`),
            body: safeText(slide?.body || "")
          }))
        : [],
      qualityGate: {
        pass: qualityGate.pass !== false,
        score: Math.max(0, Math.min(100, Number(qualityGate.score || 82) || 82)),
        issues: normalizeStringArray(qualityGate.issues, [])
      }
    }
  };
}

function buildPrompt(brief, niche, format) {
  const voice = resolveEditorialVoice(niche);
  const formatLabel = contentFormatLabel(format);
  const hasCrossTheme = Boolean(safeText(brief.crossThemeBridge || ""));

  return [
    "Você é o motor editorial principal de uma plataforma de conteúdo.",
    "Escreva em português do Brasil.",
    "Sua função é transformar UMA notícia em um pacote editorial forte, racional e completo.",
    "Não invente fatos, números, datas, lugares ou fontes.",
    "Não faça publicidade disfarçada.",
    "Não escreva como se estivesse dando uma aula sobre o processo.",
    "Não explique por que escolheu o gancho, o ângulo ou a estrutura.",
    "Não entregue bastidor, raciocínio editorial aparente ou justificativas ao leitor final.",
    "Evite generalidade, clichê, adjetivação vazia e frases bonitas sem mecanismo.",
    "A análise deve ser racional, concreta e organizada por tese.",
    "Headline é apenas a capa: título da primeira lâmina e subtítulo da primeira lâmina.",
    "As demais lâminas devem avançar argumento, não repetir premissa.",
    "O render final deve soar como uma história editorial pronta para seguidores de Instagram, não como explicação do processo.",
    "Cada bloco do render final deve empurrar a leitura para a frente.",
    "O render final é a entrega principal. Triagem, headlines e espinha existem só para sustentar a escrita, não para aparecer no texto final.",
    "Se a pauta cruza dois temas, o começo deve entrar pelo universo da notícia e depois virar para o tema central.",
    "Exemplo de lógica: se a notícia parece política e o tema central é inteligência artificial, o gancho abre em política e a ponte para IA aparece logo nos primeiros blocos seguintes.",
    "Pense como um storyteller editorial, não como um analista descrevendo uma pauta.",
    "O render final deve soar como um carrossel que já poderia ser publicado sem edição estrutural.",
    "Cada bloco precisa carregar uma ideia inteligível, publicável e conectada ao próximo.",
    "O texto precisa ser interessante e racional ao mesmo tempo: prender atenção sem virar floreio.",
    "O leitor não deve sentir que está recebendo explicação sobre a notícia; ele deve sentir que está entrando numa leitura maior sobre o que a notícia revela.",
    "Use o espírito do Content Machine 5.4: triagem, 10 headlines, espinha dorsal, template e render final.",
    "Retorne SOMENTE JSON válido.",
    "",
    "JSON obrigatório:",
    "{",
    '  "title": "string",',
    '  "format": "carrossel-instagram",',
    '  "triage": {',
    '    "Transformacao": "string",',
    '    "Friccao central": "string",',
    '    "Angulo narrativo dominante": "string",',
    '    "Evidencias do insumo": "string"',
    "  },",
    '  "headlines": [',
    '    { "number": 1, "line1": "string", "line2": "string" }',
    "  ],",
    '  "selectedHeadlineNumber": 1,',
    '  "spine": {',
    '    "Ângulo escolhido": "string",',
    '    "Hook": "string",',
    '    "Fato-base": "string",',
    '    "Mecanismo": "string",',
    '    "Prova": "string",',
    '    "Aplicação": "string",',
    '    "Direção": "string"',
    "  },",
    '  "selectedTemplate": 1,',
    '  "editorialFrame": {',
    '    "fato_central": "string",',
    '    "mudanca_real": "string",',
    '    "sinal_real": "string",',
    '    "tipo_de_mudanca": "string",',
    '    "mecanismo": "string",',
    '    "tensao_central": "string",',
    '    "ponte_editorial": "string",',
    '    "tese_editorial": "string",',
    '    "direcao_de_conteudo": "string",',
    '    "formato_sugerido": "carrossel-instagram",',
    '    "angulo_narrativo": "string",',
    '    "promessa_da_capa": "string",',
    '    "provas_do_argumento": ["string", "string", "string"],',
    '    "implicacao_para_o_publico": "string",',
    '    "consequencia": "string",',
    '    "frase_final": "string"',
    "  },",
    '  "qualityGate": { "pass": true, "score": 0, "issues": ["string"] },',
    '  "renderFinal": "texto 1 - ...\\ntexto 2 - ..."',
    "}",
    "",
    "Regras adicionais:",
    "- Gere exatamente 10 headlines com naturezas diferentes.",
    "- Escolha a melhor headline de forma racional, não aleatória.",
    "- O template escolhido deve ser entre 1 e 4.",
    "- O render final deve obedecer o template escolhido.",
    "- Template 1 e 3: exatamente 18 blocos.",
    "- Template 2: exatamente 14 blocos.",
    "- Template 4: exatamente 21 blocos.",
    "- Cada bloco deve começar com 'texto X - '.",
    "- O texto final precisa ser interessante de ler por si só, como narrativa de carrossel, não como relatório.",
    "- O texto final não pode usar marcadores de bastidor como: 'gancho', 'debate', 'por que agora', 'ângulo', 'fechamento', 'headline', 'etapa', 'estrutura'.",
    "- O texto final não pode justificar decisões editoriais. Ele precisa apenas contar a história e defender a leitura.",
    "- Evite explicar a notícia de forma escolar. Prefira conduzir o leitor com progressão narrativa, contraste e consequência.",
    "- Blocos 1 e 2 precisam abrir forte e criar curiosidade ou reenquadramento.",
    "- Blocos 1 e 2 devem ser curtos, memoráveis e com força própria. Eles precisam funcionar como capa e subtítulo de um carrossel real.",
    "- Os blocos seguintes devem desenvolver a história com racionalidade: o que está acontecendo, qual é o mecanismo, qual é a mudança e por que isso importa.",
    "- Entre os blocos 3 e 10, o texto precisa desenvolver o que está acontecendo por trás da notícia.",
    "- Evite excesso de nome próprio, repetição do mesmo dado e retorno mecânico ao título da notícia.",
    "- Nos blocos finais, o texto precisa ampliar a leitura e fechar com uma implicação maior, sem parecer moral da história genérica.",
    "- Alterne blocos curtos e blocos mais densos quando isso ajudar o ritmo.",
    "- Cada bloco deve parecer publicável como parte de um carrossel real.",
    "- O fechamento precisa encerrar a tese, não só repetir o começo.",
    "- O render final não pode explicar a tese ao leitor como se fosse bastidor; ele precisa dramatizar e contar a tese como narrativa editorial.",
    "- Evite frases como 'o ponto é', 'a tese é', 'isso mostra que' quando elas soarem didáticas ou escolares demais.",
    "- Prefira construir a leitura com progressão, contraste e consequência.",
    "- Evite também frases de autoexplicação como 'o dado mostra', 'o caso mostra', 'a prova está', quando elas soarem mecânicas ou burocráticas.",
    "- Não transforme o carrossel em lista de comentários sobre a notícia. Transforme a notícia em história e leitura.",
    `- A voz editorial do nicho é ${voice.label}. Pergunta central: ${voice.centralQuestion}`,
    `- Moldura de tese: ${voice.thesisFrame}`,
    `- Moldura de fechamento: ${voice.closingFrame}`,
    hasCrossTheme ? `- Há um cruzamento temático ativo: ${safeText(brief.crossThemeBridge)}` : "",
    "",
    "Dados da pauta:",
    `Nicho central: ${safeText(niche)}`,
    `Formato desejado: ${safeText(format)} (${formatLabel})`,
    `Título da notícia: ${safeText(brief.title)}`,
    `Fonte: ${safeText(brief.source)}`,
    `Link: ${safeText(brief.link)}`,
    brief.snippet ? `Trecho/contexto capturado: ${safeText(brief.snippet)}` : "Trecho/contexto capturado: sem trecho adicional.",
    brief.query ? `Query de origem: ${safeText(brief.query)}` : "",
    brief.whyNow ? `Leitura preliminar: ${safeText(brief.whyNow)}` : "",
    brief.debateAngle ? `Ângulo preliminar: ${safeText(brief.debateAngle)}` : "",
    brief.whyItMattersToNiche ? `Ponte preliminar com o nicho: ${safeText(brief.whyItMattersToNiche)}` : "",
    brief.crossThemeBridge ? `Cruzamento secundário: ${safeText(brief.crossThemeBridge)}` : "",
    brief.innovationClose ? `Fechamento preliminar: ${safeText(brief.innovationClose)}` : "",
    "",
    "Escreva um pacote melhor que essas leituras preliminares. Se as leituras preliminares estiverem fracas, supere-as.",
    "No render final, entregue a história já escrita para publicação.",
    "Pense no render final como um storytelling em 18, 14 ou 21 blocos, e não como uma explicação técnica."
  ].filter(Boolean).join("\n");
}

export function createOpenAIContentGenerator({
  apiKey = process.env.OPENAI_API_KEY || "",
  model = DEFAULT_OPENAI_MODEL,
  apiUrl = DEFAULT_OPENAI_API_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  async function generatePack(brief, niche, format = "carrossel-instagram") {
    if (!apiKey) {
      throw new Error("Defina OPENAI_API_KEY para usar o gerador editorial principal.");
    }

    if (typeof fetchImpl !== "function") {
      throw new Error("Fetch indisponível para chamar a OpenAI.");
    }

    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: buildPrompt(brief, niche, format),
        max_output_tokens: 2200
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || "Falha ao gerar pacote editorial com a OpenAI.");
    }

    return normalizeGeneratedPack(extractJsonObject(extractResponseOutputText(payload)), brief, niche, format);
  }

  return {
    isConfigured() {
      return Boolean(apiKey);
    },
    async generateBriefPack(brief, niche, options = {}) {
      return generatePack(brief, niche, options.format || "carrossel-instagram");
    },
    async generateBatch(snapshot, options = {}) {
      const createdAt = options.createdAt || new Date().toISOString();
      const maxDrafts = Math.max(1, Number(options.maxDrafts) || 3);
      const briefs = Array.isArray(snapshot?.briefs) ? snapshot.briefs.slice(0, maxDrafts) : [];
      const results = await Promise.all(briefs.map(async (brief) => {
        try {
          return {
            ok: true,
            brief: {
              ...brief,
              aiPack: await generatePack(brief, snapshot.niche, options.format || "carrossel-instagram")
            }
          };
        } catch (error) {
          return {
            ok: false,
            error: error.message || "Falha ao gerar pacote com IA.",
            brief
          };
        }
      }));

      return {
        generatedAt: createdAt,
        niche: snapshot.niche,
        source: snapshot.source,
        trackedItems: snapshot.summary?.trackedItems ?? 0,
        briefs: results.map((result) => result.brief),
        failed: results.filter((result) => !result.ok).map((result) => ({
          title: result.brief?.title || "Pauta",
          error: result.error
        }))
      };
    }
  };
}
