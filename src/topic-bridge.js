function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safeText(value) {
  return String(value ?? "").trim();
}

const AXIS_KEYWORDS = {
  poder: ["guerra", "defesa", "militar", "china", "eua", "soberania", "geopolit", "estado", "governo", "influencia"],
  regulacao: ["regul", "lei", "tribunal", "antitruste", "ban", "proib", "governo", "comissao", "politica publica"],
  infraestrutura: ["chip", "semicond", "fabrica", "energia", "rede", "data center", "supply", "cadeia", "infraestrutura", "logistica"],
  monetizacao: ["taxa", "tarifa", "preco", "margem", "receita", "monetiza", "comissao", "assinatura", "seller", "vendedor"],
  distribuicao: ["plataforma", "marketplace", "canal", "app", "algoritmo", "busca", "distribuicao", "alcance", "ecossistema"],
  comportamento: ["consumidor", "usuario", "habito", "adocao", "audiencia", "cultura", "educacao", "aprendizado", "comportamento"],
  operacao: ["eficiencia", "processo", "automacao", "producao", "operacao", "produtividade", "execucao"],
  talento: ["time", "talento", "emprego", "layoff", "demissao", "equipe", "contratacao", "mao de obra"],
  produto: ["produto", "software", "ferramenta", "modelo", "ia", "inteligencia artificial", "robot", "aplicativo"]
};

const INNOVATION_TYPE_LABELS = {
  poder: "inovação como infraestrutura de poder",
  regulacao: "inovação condicionada por regra",
  infraestrutura: "inovação baseada em infraestrutura crítica",
  monetizacao: "inovação em captura de valor",
  distribuicao: "inovação em distribuição e plataforma",
  comportamento: "inovação guiada por mudança de comportamento",
  operacao: "inovação operacional",
  talento: "inovação com redistribuição de talento",
  produto: "inovação de produto e modelo"
};

function countAxisMatches(text, keywords) {
  return keywords.reduce((total, keyword) => (text.includes(keyword) ? total + 1 : total), 0);
}

function rankAxes(text) {
  return Object.entries(AXIS_KEYWORDS)
    .map(([axis, keywords]) => ({
      axis,
      score: countAxisMatches(text, keywords)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function axisLabel(axis) {
  return {
    poder: "poder",
    regulacao: "regulação",
    infraestrutura: "infraestrutura",
    monetizacao: "monetização",
    distribuicao: "distribuição",
    comportamento: "comportamento",
    operacao: "operação",
    talento: "talento",
    produto: "produto"
  }[axis] || axis;
}

function bridgeSentence(primaryAxis, secondaryAxis, centralTheme) {
  if (centralTheme !== "inovacao") {
    return `Essa pauta pode ser relida pela lente de ${centralTheme} porque o conflito real está em ${axisLabel(primaryAxis)}.`;
  }

  if (primaryAxis === "poder") {
    return "Isso importa para inovação porque a disputa deixou de ser só narrativa e passou a definir vantagem estratégica, soberania tecnológica e capacidade industrial.";
  }

  if (primaryAxis === "regulacao") {
    return "Isso importa para inovação porque a próxima vantagem não depende só do produto, mas de quem consegue crescer dentro da nova regra.";
  }

  if (primaryAxis === "infraestrutura") {
    return "Isso importa para inovação porque infraestrutura crítica, cadeia produtiva e gargalos técnicos passam a selecionar os vencedores.";
  }

  if (primaryAxis === "monetizacao") {
    return "Isso importa para inovação porque a disputa real está em margem, dependência de plataforma e captura de valor.";
  }

  if (primaryAxis === "distribuicao") {
    return "Isso importa para inovação porque quem controla distribuição, plataforma e atenção passa a controlar adoção e escala.";
  }

  if (primaryAxis === "comportamento") {
    return "Isso importa para inovação porque toda mudança de comportamento abre espaço para novos produtos, novas rotinas e novas categorias.";
  }

  if (primaryAxis === "operacao") {
    return "Isso importa para inovação porque o caso aponta para ganho de eficiência, automação e reorganização operacional.";
  }

  if (primaryAxis === "talento") {
    return "Isso importa para inovação porque a tecnologia está redistribuindo poder, produtividade e relevância dentro dos times.";
  }

  if (primaryAxis === "produto") {
    return "Isso importa para inovação porque o debate revela qual produto, modelo ou aplicação tende a ganhar tração no próximo ciclo.";
  }

  if (secondaryAxis) {
    return `Isso importa para inovação porque o caso mistura ${axisLabel(primaryAxis)} e ${axisLabel(secondaryAxis)} em uma mesma mudança de mercado.`;
  }

  return "Isso importa para inovação porque o caso antecipa uma mudança de mercado, comportamento ou vantagem competitiva.";
}

function editorialAngle(primaryAxis, secondaryAxis) {
  if (secondaryAxis) {
    return `${axisLabel(primaryAxis)} + ${axisLabel(secondaryAxis)}`;
  }

  return axisLabel(primaryAxis || "mudança estrutural");
}

function buildCrossThemeBridge(primaryAxis, centralTheme, secondaryTheme) {
  const cleanedSecondaryTheme = safeText(secondaryTheme);

  if (!cleanedSecondaryTheme) {
    return "";
  }

  return `Use ${cleanedSecondaryTheme} como segunda lente desta pauta: o elo mais forte com ${centralTheme} está em ${axisLabel(primaryAxis)}.`;
}

export function buildCentralThemeBridge(item, centralTheme = "inovacao", options = {}) {
  const text = normalizeText([item.title, item.snippet, item.query, item.source, item.niche].join(" "));
  const rankedAxes = rankAxes(text);
  const primaryAxis = rankedAxes[0]?.axis || "produto";
  const secondaryAxis = rankedAxes[1]?.axis || "";
  const crossTheme = safeText(options.secondaryTheme || item.secondaryTheme || "");

  return {
    centralTheme,
    secondaryTheme: crossTheme,
    primaryAxis,
    secondaryAxis,
    axes: rankedAxes.slice(0, 3).map((entry) => entry.axis),
    editorialAngle: editorialAngle(primaryAxis, secondaryAxis),
    innovationType: INNOVATION_TYPE_LABELS[primaryAxis] || "inovação em transformação de mercado",
    whyItMatters: bridgeSentence(primaryAxis, secondaryAxis, centralTheme),
    crossThemeBridge: buildCrossThemeBridge(primaryAxis, centralTheme, crossTheme)
  };
}
