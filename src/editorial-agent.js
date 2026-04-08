import { buildCentralThemeBridge } from "./topic-bridge.js";
import { resolveEditorialVoice } from "./editorial-voice.js";

const CONTROVERSY_KEYWORDS = [
  "crise",
  "guerra",
  "conflito",
  "debate",
  "pressao",
  "boicote",
  "ban",
  "banimento",
  "proib",
  "disputa",
  "ataque",
  "polic",
  "regul",
  "processo",
  "demite",
  "demissao",
  "tarifa",
  "taxa",
  "escandalo",
  "acus",
  "censura"
];

const INNOVATION_KEYWORDS = [
  "inovacao",
  "tecnologia",
  "ia",
  "inteligencia artificial",
  "startup",
  "plataforma",
  "chip",
  "software",
  "automacao",
  "dados",
  "robot",
  "pesquisa",
  "produto",
  "digital",
  "algoritmo"
];

const URGENCY_KEYWORDS = [
  "agora",
  "hoje",
  "semana",
  "recorde",
  "viral",
  "cresce",
  "explos",
  "alta",
  "queda",
  "mudanca",
  "ultimo",
  "nova fase",
  "breaking"
];

const BUSINESS_KEYWORDS = [
  "mercado",
  "empresa",
  "negocio",
  "investimento",
  "receita",
  "usuario",
  "consumidor",
  "setor",
  "industria",
  "escala",
  "modelo",
  "estrategia"
];

const EDITORIAL_STOPWORDS = new Set([
  "agora",
  "ainda",
  "analise",
  "ano",
  "anos",
  "apos",
  "area",
  "aumenta",
  "brasil",
  "caso",
  "china",
  "como",
  "contra",
  "cresce",
  "debate",
  "deixa",
  "depois",
  "disputa",
  "empresa",
  "entre",
  "essa",
  "esse",
  "esta",
  "estao",
  "eua",
  "foco",
  "ganha",
  "global",
  "grande",
  "grupo",
  "hoje",
  "impacto",
  "mercado",
  "mundo",
  "nova",
  "novo",
  "noticia",
  "noticias",
  "para",
  "parte",
  "pauta",
  "podem",
  "poder",
  "porque",
  "pressiona",
  "pressao",
  "reage",
  "reagem",
  "risco",
  "setor",
  "sobre",
  "tema",
  "tensao",
  "vira"
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreKeywordMatches(text, keywords, weight = 1) {
  return keywords.reduce((total, keyword) => (
    text.includes(keyword) ? total + weight : total
  ), 0);
}

function computeFreshnessScore(publishedTime) {
  if (!publishedTime) {
    return 0;
  }

  const published = new Date(publishedTime);

  if (Number.isNaN(published.getTime())) {
    return 0;
  }

  const elapsedMs = Date.now() - published.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  if (elapsedDays <= 2) {
    return 3;
  }

  if (elapsedDays <= 7) {
    return 2;
  }

  if (elapsedDays <= 14) {
    return 1;
  }

  return 0;
}

function uniqueLabels(labels) {
  return [...new Set(labels)];
}

function collectSignals(text) {
  const labels = [];

  if (scoreKeywordMatches(text, CONTROVERSY_KEYWORDS) > 0) {
    labels.push("tensao");
  }

  if (scoreKeywordMatches(text, INNOVATION_KEYWORDS) > 0) {
    labels.push("inovacao");
  }

  if (scoreKeywordMatches(text, URGENCY_KEYWORDS) > 0) {
    labels.push("timing");
  }

  if (scoreKeywordMatches(text, BUSINESS_KEYWORDS) > 0) {
    labels.push("mercado");
  }

  return uniqueLabels(labels);
}

function leadingSentence(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "Tema em movimento, ainda sem uma sintese publicada no material coletado.";
  }

  const [firstSentence] = text.split(/(?<=[.!?])\s+/);
  return firstSentence || text;
}

function safeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractFocusPhrase(item, niche) {
  const title = String(item.title ?? "").trim();
  const titlePieces = title.split(/[:\-|]/).map((piece) => piece.trim()).filter(Boolean);

  if (titlePieces[0]) {
    return titlePieces[0];
  }

  const tokens = normalizeText([item.title, item.snippet, item.query].join(" "))
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((token) => token !== normalizeText(niche))
    .filter((token) => !EDITORIAL_STOPWORDS.has(token))
    .slice(0, 4);

  if (tokens.length === 0) {
    return `o movimento em ${niche}`;
  }

  return tokens.join(" ");
}

function focusWithSource(item, niche) {
  const focus = extractFocusPhrase(item, niche);
  const source = String(item.source ?? "").trim();
  return source ? `${focus} (${source})` : focus;
}

function changeTypeLabel(lens, signals) {
  if (lens === "geopolitica") {
    return "geopolitica";
  }

  if (lens === "regulacao") {
    return "regulatoria";
  }

  if (lens === "precificacao") {
    return "economica";
  }

  if (lens === "infraestrutura") {
    return "tecnologica";
  }

  if (lens === "trabalho") {
    return "operacional";
  }

  if (signals.includes("mercado")) {
    return "mercado";
  }

  return "comportamental";
}

function buildRealShift(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const focus = extractFocusPhrase(item, niche);
  const secondaryTheme = themeBridge?.secondaryTheme;

  if (secondaryTheme) {
    return `${focus} ganhou tração porque permite conectar ${niche} com ${secondaryTheme} por uma ponte real de ${themeBridge.editorialAngle}.`;
  }

  if (lens === "geopolitica") {
    return `${focus} não fala só de tecnologia. Fala de como poder estatal, soberania e capacidade industrial passaram a disputar o mesmo tabuleiro.`;
  }

  if (lens === "regulacao") {
    return `${focus} marca um ponto em que regra, legitimidade e velocidade de mercado passam a andar juntas.`;
  }

  if (lens === "precificacao") {
    return `${focus} mostra que a captura de valor já entrou em nova fase: quem controla a plataforma começa a redefinir margem e dependência.`;
  }

  if (lens === "infraestrutura") {
    return `${focus} revela que a vantagem não nasce só da ideia, mas do controle dos gargalos certos.`;
  }

  if (lens === "trabalho") {
    return `${focus} indica que a mudança saiu do discurso e encostou na estrutura real de produtividade, decisão e relevância.`;
  }

  if (signals.includes("mercado")) {
    return `${focus} deixou de ser episódio isolado e virou sinal de redistribuição de vantagem no mercado.`;
  }

  return `${focus} saiu do ruído e virou evidência de que a mudança já começou por baixo da manchete.`;
}

function buildSignalReal(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const focus = extractFocusPhrase(item, niche);

  if (themeBridge?.secondaryTheme) {
    return `${focus} parece falar de ${themeBridge.secondaryTheme}, mas no fundo fala de ${themeBridge.editorialAngle} aplicado a ${niche}.`;
  }

  if (lens === "geopolitica") {
    return `${focus} parece uma notícia de defesa, mas revela a corrida por infraestrutura de poder tecnológico.`;
  }

  if (lens === "regulacao") {
    return `${focus} parece um debate jurídico, mas revela quem vai escalar com legitimidade quando a regra apertar.`;
  }

  if (lens === "precificacao") {
    return `${focus} parece uma discussão de taxa, mas revela quem está em posição de capturar mais valor do ecossistema.`;
  }

  if (lens === "infraestrutura") {
    return `${focus} parece bastidor técnico, mas mostra onde a próxima vantagem competitiva realmente mora.`;
  }

  if (lens === "trabalho") {
    return `${focus} parece ajuste operacional, mas revela como tecnologia redistribui produtividade e poder dentro do mercado.`;
  }

  return `${focus} parece só notícia, mas revela a mudança estrutural escondida debaixo do fato.`;
}

function buildCoreTension(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const focus = focusWithSource(item, niche);

  if (themeBridge?.secondaryTheme) {
    return `${focus} abre a tensão entre repertório popular e mudança estrutural: o que parece tema lateral vira leitura estratégica quando entra pela lente de ${niche}.`;
  }

  if (lens === "geopolitica") {
    return `${focus} organiza uma tensão entre velocidade tecnológica, soberania e vantagem estratégica.`;
  }

  if (lens === "regulacao") {
    return `${focus} concentra a disputa entre crescer primeiro e legitimar a escala antes que o limite chegue.`;
  }

  if (lens === "precificacao") {
    return `${focus} expõe a disputa entre quem opera o ecossistema e quem depende dele para continuar crescendo.`;
  }

  if (lens === "infraestrutura") {
    return `${focus} coloca em choque ambição de produto e controle dos gargalos que realmente sustentam execução.`;
  }

  if (lens === "trabalho") {
    return `${focus} encena a fricção entre eficiência acelerada e concentração de poder decisório.`;
  }

  return `${focus} põe em conflito a leitura superficial da manchete e a mudança de poder que ela realmente revela.`;
}

function buildMechanism(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const focus = extractFocusPhrase(item, niche);

  if (themeBridge?.secondaryTheme) {
    return `${focus} ganha força quando o tema secundário funciona como atalho de atenção, mas o mecanismo real continua sendo ${themeBridge.editorialAngle}: deslocar linguagem, influência e percepção em ${niche}.`;
  }

  if (lens === "geopolitica") {
    return `${focus} funciona como mecanismo de vantagem porque combina chip, dados, capacidade industrial e aparato estatal numa mesma infraestrutura de poder.`;
  }

  if (lens === "regulacao") {
    return `${focus} muda o jogo porque a regra deixa de ser detalhe jurídico e passa a selecionar quem ganha tempo, legitimidade e espaço para escalar.`;
  }

  if (lens === "precificacao") {
    return `${focus} reorganiza o mercado por um mecanismo simples: depois que a dependência se instala, a plataforma começa a capturar margem com mais força.`;
  }

  if (lens === "infraestrutura") {
    return `${focus} opera por controle de gargalo: quem domina cadeia, capacidade e infraestrutura dita o ritmo do restante do mercado.`;
  }

  if (lens === "trabalho") {
    return `${focus} acelera uma redistribuição de vantagem porque tecnologia, operação e estrutura de equipe passam a produzir mais resultado com menos atrito.`;
  }

  return `${focus} ganha peso porque transforma um fato isolado em sinal de reordenação de poder, distribuição ou comportamento.`;
}

function buildEditorialThesis(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const focus = extractFocusPhrase(item, niche);
  const voice = resolveEditorialVoice(niche);

  if (themeBridge?.secondaryTheme) {
    return `${focus} prova que o melhor conteúdo nasce quando ${niche} encontra uma segunda lente concreta, e não quando temas aleatórios são só justapostos.`;
  }

  if (lens === "geopolitica") {
    return `${focus} prova que inovação deixou de ser só progresso técnico e virou infraestrutura de poder, soberania e vantagem estratégica.`;
  }

  if (lens === "regulacao") {
    return `${focus} mostra que, em mercados maduros, a grande vantagem não é só lançar antes; é conseguir escalar dentro da regra antes dos outros.`;
  }

  if (lens === "precificacao") {
    return `${focus} mostra que plataformas maduras aumentam captura de valor justamente quando o ecossistema já não consegue sair delas sem custo alto.`;
  }

  if (lens === "infraestrutura") {
    return `${focus} prova que o próximo ciclo de inovação será decidido menos pela promessa do produto e mais pelo controle da infraestrutura crítica.`;
  }

  if (lens === "trabalho") {
    return `${focus} revela que a disputa atual não é só por eficiência, mas por quem reconfigura produtividade, decisão e relevância mais rápido.`;
  }

  return `${focus} revela uma mudança estrutural em ${niche}: ${voice.thesisFrame.replace(/^A leitura forte aqui não é só de /i, "").replace(/\.$/, "")}`;
}

function buildAudienceImplication(item, niche, signals, themeBridge) {
  const focus = extractFocusPhrase(item, niche);
  const voice = resolveEditorialVoice(niche);

  if (themeBridge?.secondaryTheme) {
    return `Para quem acompanha ${niche}, ${focus} importa porque mostra como cruzar repertório popular com tese forte sem deixar a leitura parecer forçada.`;
  }

  return `${voice.implicationFrame} ${focus} ajuda a mostrar isso de forma concreta.`;
}

function buildConsequence(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const focus = extractFocusPhrase(item, niche);

  if (themeBridge?.secondaryTheme) {
    return `${focus} abre espaço para conteúdo mais forte porque transforma um tema lateral em tese de poder, linguagem e posicionamento dentro de ${niche}.`;
  }

  if (lens === "geopolitica") {
    return `A consequência é clara: quem converter ${focus} em capacidade estatal, industrial e narrativa sai na frente do próximo ciclo.`;
  }

  if (lens === "regulacao") {
    return `A consequência é que o mercado passa a premiar quem combina velocidade com legitimidade, não apenas agressividade de produto.`;
  }

  if (lens === "precificacao") {
    return `A consequência é uma redistribuição silenciosa de margem, poder de barganha e espaço de manobra para quem depende da infraestrutura alheia.`;
  }

  if (lens === "infraestrutura") {
    return `A consequência é que vantagem competitiva passa a depender de quem controla capacidade crítica, não só narrativa de inovação.`;
  }

  if (lens === "trabalho") {
    return `A consequência é uma nova assimetria entre quem opera a mudança e quem continua preso à estrutura anterior.`;
  }

  return `A consequência é que o caso deixa de ser comentário de momento e vira material para tese, posicionamento e tomada de decisão.`;
}

function buildNarrativeAngle(item, niche, signals, themeBridge) {
  const focus = extractFocusPhrase(item, niche);
  const lens = detectEditorialLens(item, signals);

  if (themeBridge?.secondaryTheme) {
    return `O ângulo aqui é mostrar que ${focus} só vira bom conteúdo quando ${themeBridge.secondaryTheme} entra como ponte real de ${themeBridge.editorialAngle}, não como enfeite de atenção.`;
  }

  if (lens === "geopolitica") {
    return `O ângulo aqui é deslocar ${focus} de notícia internacional para disputa por soberania tecnológica e novo tabuleiro de poder.`;
  }

  if (lens === "regulacao") {
    return `O ângulo aqui é mostrar que ${focus} não fala apenas de controle, mas de quem consegue crescer quando a régua sobe.`;
  }

  if (lens === "precificacao") {
    return `O ângulo aqui é mostrar que ${focus} não fala de taxa isolada; fala de dependência, captura de margem e controle do ecossistema.`;
  }

  if (lens === "infraestrutura") {
    return `O ângulo aqui é tirar ${focus} do bastidor técnico e mostrar que o verdadeiro jogo está nos gargalos que sustentam escala.`;
  }

  if (lens === "trabalho") {
    return `O ângulo aqui é mostrar que ${focus} é menos sobre ferramenta e mais sobre redistribuição de produtividade e poder.`;
  }

  return `O ângulo aqui é mostrar que ${focus} vale menos pelo fato bruto e mais pelo mecanismo que ele deixou visível.`;
}

function buildContentDirection(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);

  if (themeBridge?.secondaryTheme) {
    return "carrossel de tese";
  }

  if (lens === "geopolitica" || lens === "infraestrutura") {
    return "analise";
  }

  if (lens === "precificacao" || lens === "regulacao") {
    return "mudanca de mercado";
  }

  if (lens === "trabalho") {
    return "contraponto";
  }

  if (signals.includes("tensao")) {
    return "disputa narrativa";
  }

  return "explicacao";
}

function buildFormatIntent(item, niche, signals, themeBridge, scores) {
  const base = themeBridge?.secondaryTheme || detectEditorialLens(item, signals) === "geopolitica"
    ? "carrossel-instagram"
    : scores.totalScore >= 18
      ? "carrossel-instagram"
      : "post-unico";

  return base;
}

function buildProofs(item, scores, themeBridge) {
  const proofs = [];

  if (item.title) {
    proofs.push(`O fato-base capturado foi "${safeText(item.title)}".`);
  }

  if (item.snippet) {
    proofs.push(`O contexto coletado reforça a leitura: ${safeText(leadingSentence(item.snippet))}`);
  }

  if (themeBridge?.whyItMatters) {
    proofs.push(`A ponte com o tema central aponta para ${themeBridge.editorialAngle}.`);
  }

  if (scores?.signals?.length) {
    proofs.push(`O caso chegou com sinais editoriais de ${scores.signals.join(", ")}.`);
  }

  return proofs.slice(0, 3);
}

function buildCoverPromise(item, niche, signals, themeBridge, thesis) {
  const focus = extractFocusPhrase(item, niche);

  if (themeBridge?.secondaryTheme) {
    return `${focus} parece falar de ${themeBridge.secondaryTheme}. Na prática, revela como ${themeBridge.editorialAngle} reorganiza ${niche}.`;
  }

  if (detectEditorialLens(item, signals) === "precificacao") {
    return `${focus} parece uma taxa. Na prática, revela quem começa a capturar mais margem quando a dependência já está instalada.`;
  }

  if (detectEditorialLens(item, signals) === "regulacao") {
    return `${focus} parece só regra nova. Na prática, revela quem vai ganhar legitimidade para escalar primeiro.`;
  }

  if (detectEditorialLens(item, signals) === "geopolitica") {
    return `${focus} parece tema internacional. Na prática, revela como tecnologia virou infraestrutura de poder.`;
  }

  return thesis;
}

function buildClosingLine(item, niche, signals, themeBridge, consequence) {
  const focus = extractFocusPhrase(item, niche);
  const lens = detectEditorialLens(item, signals);
  const voice = resolveEditorialVoice(niche);

  if (themeBridge?.secondaryTheme) {
    return `O ponto final não é ${themeBridge.secondaryTheme}. É como ${focus} ajuda a provar uma tese mais forte sobre ${niche}.`;
  }

  if (lens === "geopolitica") {
    if (normalizeText(niche) === "inovacao") {
      return `${focus} importa porque antecipa onde a próxima vantagem em inovação vai nascer: infraestrutura de poder, soberania tecnológica e capacidade industrial.`;
    }

    return `${focus} importa porque antecipa onde a próxima vantagem em ${niche} vai nascer: infraestrutura de poder, soberania tecnológica e capacidade industrial.`;
  }

  if (niche) {
    if (normalizeText(niche) === "inovacao") {
      return `${focus} importa porque antecipa onde a próxima vantagem em inovação vai ser construída antes do consenso.`;
    }

    return `${focus} importa porque ${voice.closingFrame.replace(/^O ponto final precisa mostrar como o caso /i, "").replace(/\.$/, "")}`;
  }

  return `${focus} importa porque antecipa onde a próxima vantagem vai ser construída antes do consenso.`;
}

function buildCarouselSlides(frame) {
  return [
    { label: "Capa", body: frame.promessa_da_capa, role: "nomear" },
    { label: "Fato-base", body: frame.fato_central, role: "provar" },
    { label: "Leitura escondida", body: frame.sinal_real, role: "reposicionar" },
    { label: "Mecanismo", body: frame.mecanismo, role: "explicar" },
    { label: "Consequência", body: frame.consequencia, role: "tensionar" },
    { label: "Tese", body: frame.tese_editorial, role: "concluir" },
    { label: "Ponte com o tema", body: frame.ponte_editorial, role: "reposicionar" },
    { label: "Fechamento", body: frame.frase_final, role: "concluir" }
  ];
}

function buildQualityGate(frame) {
  const issues = [];

  if (safeText(frame.tese_editorial).length < 90) {
    issues.push("tese fraca");
  }

  if (safeText(frame.promessa_da_capa).length < 70) {
    issues.push("capa generica");
  }

  if (safeText(frame.mecanismo).length < 90) {
    issues.push("mecanismo pouco especifico");
  }

  if ((frame.provas_do_argumento || []).length < 2) {
    issues.push("provas insuficientes");
  }

  if (safeText(frame.ponte_editorial).length < 70) {
    issues.push("ponte editorial fraca");
  }

  const score = Math.max(55, 100 - issues.length * 12);

  return {
    score,
    pass: issues.length <= 1,
    issues
  };
}

function buildEditorialFrame(item, niche, signals, themeBridge, scores) {
  const fact = safeText(item.title || leadingSentence(item.snippet) || `Sinal relevante em ${niche}.`);
  const realShift = buildRealShift(item, niche, signals, themeBridge);
  const signalReal = buildSignalReal(item, niche, signals, themeBridge);
  const tension = buildCoreTension(item, niche, signals, themeBridge);
  const mechanism = buildMechanism(item, niche, signals, themeBridge);
  const thesis = buildEditorialThesis(item, niche, signals, themeBridge);
  const audienceImplication = buildAudienceImplication(item, niche, signals, themeBridge);
  const consequence = buildConsequence(item, niche, signals, themeBridge);
  const angle = buildNarrativeAngle(item, niche, signals, themeBridge);
  const proofs = buildProofs(item, scores, themeBridge);
  const frame = {
    fato_central: fact,
    mudanca_real: realShift,
    sinal_real: signalReal,
    tipo_de_mudanca: changeTypeLabel(detectEditorialLens(item, signals), signals),
    mecanismo: mechanism,
    tensao_central: tension,
    ponte_editorial: themeBridge.whyItMatters,
    tese_editorial: thesis,
    direcao_de_conteudo: buildContentDirection(item, niche, signals, themeBridge),
    formato_sugerido: buildFormatIntent(item, niche, signals, themeBridge, scores),
    angulo_narrativo: angle,
    promessa_da_capa: buildCoverPromise(item, niche, signals, themeBridge, thesis),
    provas_do_argumento: proofs,
    implicacao_para_o_publico: audienceImplication,
    consequencia: consequence,
    frase_final: buildClosingLine(item, niche, signals, themeBridge, consequence)
  };

  return {
    ...frame,
    estrutura_do_carrossel: buildCarouselSlides(frame),
    qualityGate: buildQualityGate(frame)
  };
}

function detectEditorialLens(item, signals) {
  const text = normalizeText([item.title, item.snippet, item.query, item.source].join(" "));

  if (includesAny(text, ["militar", "guerra", "defesa", "armas", "pentag", "china", "eua", "soberania", "geopolit"])) {
    return "geopolitica";
  }

  if (includesAny(text, ["regul", "antitruste", "governo", "tribunal", "lei", "congresso", "ban", "proib", "comissao"])) {
    return "regulacao";
  }

  if (includesAny(text, ["taxa", "tarifa", "preco", "comissao", "margem", "marketplace", "vendedor", "seller"])) {
    return "precificacao";
  }

  if (includesAny(text, ["chip", "semicond", "fabrica", "supply", "cadeia", "infraestrutura"])) {
    return "infraestrutura";
  }

  if (includesAny(text, ["demissao", "layoff", "corte", "emprego", "time", "talento", "equipe"])) {
    return "trabalho";
  }

  if (signals.includes("mercado")) {
    return "mercado";
  }

  return "geral";
}

function buildWhyNow(signals, lens) {
  if (lens === "geopolitica") {
    return "A pauta esta quente porque mistura disputa real por poder, impacto estrategico e recencia suficiente para posicionamento agora.";
  }

  if (lens === "regulacao") {
    return "A pauta ganhou tracao porque regra, escala e reputacao entraram na mesma conversa ao mesmo tempo.";
  }

  if (lens === "precificacao") {
    return "A pauta pede leitura agora porque margem, dependencia e poder de barganha mudam muito rapido quando a taxa vira noticia.";
  }

  if (lens === "infraestrutura") {
    return "A pauta ficou forte porque a disputa saiu do abstrato e encostou em chip, cadeia produtiva e capacidade de execucao.";
  }

  if (lens === "trabalho") {
    return "A pauta acendeu porque o debate saiu do discurso e bateu em time, eficiencia e redistribuicao de poder dentro do mercado.";
  }

  if (signals.includes("tensao") && signals.includes("mercado")) {
    return "A pauta pede leitura agora porque junta conflito aberto, impacto de mercado e recencia suficiente para gerar posicionamento.";
  }

  if (signals.includes("tensao")) {
    return "A pauta pede leitura agora porque a tensao ficou explicita e ja virou conversa maior do que a manchete isolada.";
  }

  return "A pauta merece entrar no radar agora porque saiu do ruido e virou sinal claro de mudanca no mercado.";
}

function buildSpecificWhyNow(item, niche, signals, themeBridge) {
  const focus = extractFocusPhrase(item, niche);
  const axes = themeBridge?.editorialAngle || "";
  const lens = detectEditorialLens(item, signals);

  if (themeBridge?.secondaryTheme) {
    return `${focus} ficou interessante agora porque permite cruzar ${niche} com ${themeBridge.secondaryTheme} sem parecer forçado, usando ${axes} como elo central.`;
  }

  if (lens === "regulacao") {
    return `${focus} pede leitura agora porque regra, escala e reputação encostaram no mesmo ponto de pressão.`;
  }

  if (lens === "precificacao") {
    return `${focus} merece entrar agora porque preço, margem e dependência de plataforma mudam rápido quando a taxa vira manchete.`;
  }

  if (lens === "infraestrutura") {
    return `${focus} ganhou força porque a disputa saiu da teoria e encostou em capacidade real de execução.`;
  }

  if (lens === "geopolitica") {
    return `${focus} ficou quente porque mistura disputa por poder, soberania tecnológica e impacto estratégico imediato.`;
  }

  if (signals.includes("tensao") && signals.includes("mercado")) {
    return `${focus} pede leitura agora porque junta conflito aberto com impacto real de mercado.`;
  }

  return `${focus} saiu do ruído e virou um sinal útil para abrir conversa agora.`;
}

function buildPolarizingHook(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const crossTheme = themeBridge?.secondaryTheme;
  const focus = extractFocusPhrase(item, niche);

  if (crossTheme) {
    return `${capitalizeSecondaryTheme(crossTheme)} entra como atalho de atenção: ${focus} vira um post forte quando você mostra como essa pauta desloca ${niche} para cultura, influência e repertório popular.`;
  }

  if (lens === "geopolitica") {
    return `${focus} mostra que IA deixou de ser pauta de laboratório e entrou no centro da disputa por poder, influência e vantagem estratégica.`;
  }

  if (lens === "regulacao") {
    return `Quando ${focus} encosta na regra, a discussão deixa de ser só risco. Vira disputa por timing, legitimidade e espaço para crescer antes dos outros.`;
  }

  if (lens === "precificacao") {
    return `Quando ${focus} mexe em taxa ou comissão, a história deixa de ser só preço. Vira controle de margem, dependência e distribuição.`;
  }

  if (lens === "infraestrutura") {
    return `${focus} deixa claro que infraestrutura não é bastidor. É velocidade, dependência e a próxima vantagem do mercado.`;
  }

  if (lens === "trabalho") {
    return `Quando ${focus} bate no time, fica claro que a transição já saiu do discurso e entrou na estrutura real do mercado.`;
  }

  if (signals.includes("tensao") && signals.includes("mercado")) {
    return `${focus} junta poder, distribuição e tecnologia na mesma pauta. Ignorar esse movimento vira erro de leitura.`;
  }

  if (signals.includes("tensao")) {
    return `O erro aqui é tratar ${focus} como ruído. O que parece polêmica isolada costuma antecipar a próxima virada do mercado.`;
  }

  return `Quase todo mundo vai repetir ${focus}. O valor está em mostrar o que isso realmente antecipa para ${niche}.`;
}

function capitalizeSecondaryTheme(value) {
  const text = String(value ?? "").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function buildInnovationBridge(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const crossTheme = themeBridge?.secondaryTheme;
  const focus = extractFocusPhrase(item, niche);

  if (crossTheme) {
    return `Feche mostrando como ${crossTheme} ajuda a traduzir ${focus} em ${niche} para comportamento, influência, marca ou repertório cultural.`;
  }

  if (lens === "geopolitica") {
    return `Feche mostrando que ${focus} prova que inovação, aqui, virou infraestrutura de poder: chip, dados, talento e capacidade industrial passam a definir vantagem.`;
  }

  if (lens === "regulacao") {
    return `Feche mostrando que ${focus} prova que a próxima vantagem em inovação não vem só do produto. Vem também da capacidade de operar dentro da nova regra.`;
  }

  if (lens === "precificacao") {
    return `Feche mostrando que ${focus} revela uma inovação que não acontece só no produto. Ela também nasce quando alguém reorganiza margem, incentivo e distribuição.`;
  }

  if (lens === "infraestrutura") {
    return `Feche mostrando que ${focus} revela como o novo jogo da inovação passa por infraestrutura crítica, cadeia produtiva e controle dos gargalos certos.`;
  }

  if (lens === "trabalho") {
    return `Feche mostrando que ${focus} aponta para uma inovação que muda estrutura de trabalho, decisão e captura de valor, não apenas ferramenta.`;
  }

  if (signals.includes("inovacao")) {
    return `Feche mostrando que ${focus} revela uma mudança estrutural em ${niche}: novas ferramentas, novos modelos e novos vencedores.`;
  }

  if (signals.includes("mercado")) {
    return `Leve o final para a inovação aplicada: quem transformar ${focus} em produto, processo ou distribuição sai na frente.`;
  }

  return `A virada final precisa conectar ${focus} à inovação em ${niche}: tensão relevante quase sempre antecipa comportamento, tecnologia ou estratégia emergente.`;
}

function buildDebateAngle(item, niche, signals, themeBridge) {
  const lens = detectEditorialLens(item, signals);
  const crossTheme = themeBridge?.secondaryTheme;
  const focus = focusWithSource(item, niche);

  if (crossTheme) {
    return `Leve o debate para o cruzamento entre ${niche} e ${crossTheme}: por que ${focus} permite sair da notícia e entrar em linguagem, influência e posicionamento?`;
  }

  if (lens === "geopolitica") {
    return `Enquadre ${focus} como disputa por soberania tecnológica: quem transformar IA em capacidade militar e industrial redefine o tabuleiro.`;
  }

  if (lens === "regulacao") {
    return `Leve o debate para a tensão entre acelerar ${focus} e frear dano: quem quer abrir escala primeiro e quem quer definir limite antes?`;
  }

  if (lens === "precificacao") {
    return `Enquadre ${focus} como disputa por captura de valor: quem dita a taxa, dita a margem, a dependência e o espaço de manobra do ecossistema.`;
  }

  if (lens === "infraestrutura") {
    return `Enquadre ${focus} como batalha pelos gargalos: quem controla chip, cadeia e execução passa a controlar o ritmo da inovação.`;
  }

  if (lens === "trabalho") {
    return `Enquadre ${focus} como tensão entre eficiência e concentração de poder: quem ganha quando menos gente faz mais com a nova tecnologia?`;
  }

  if (signals.includes("tensao") && signals.includes("mercado")) {
    return `Enquadre ${focus} como disputa de narrativa e poder: quem está tentando definir as regras do jogo em ${niche}, e quem lucra se essa versão vencer?`;
  }

  if (signals.includes("tensao")) {
    return `Enquadre ${focus} como atrito de visão de mundo: o que esse caso revela sobre controle, medo de mudança e perda de relevância em ${niche}?`;
  }

  return `Enquadre ${focus} como ponto de inflexão: por que esse assunto saiu do nicho, ganhou tração e agora exige uma opinião clara?`;
}

function buildContentBeats(item, niche, signals, themeBridge) {
  const bridge = themeBridge || buildCentralThemeBridge(item, niche);
  const frame = buildEditorialFrame(item, niche, signals, bridge, item.agentScores ?? scoreResearchItem(item));

  return frame.estrutura_do_carrossel.map((slide) => `${slide.label}: ${slide.body}`);
}

export function scoreResearchItem(item) {
  const text = normalizeText([item.title, item.snippet, item.query, item.source].join(" "));
  const controversyScore = scoreKeywordMatches(text, CONTROVERSY_KEYWORDS, 2);
  const innovationScore = scoreKeywordMatches(text, INNOVATION_KEYWORDS, 2);
  const urgencyScore = scoreKeywordMatches(text, URGENCY_KEYWORDS, 1) + computeFreshnessScore(item.publishedTime);
  const businessScore = scoreKeywordMatches(text, BUSINESS_KEYWORDS, 1);
  const totalScore = controversyScore * 2 + innovationScore * 1.5 + urgencyScore + businessScore;

  return {
    controversyScore,
    innovationScore,
    urgencyScore,
    businessScore,
    totalScore,
    signals: collectSignals(text)
  };
}

export function rankResearchItems(items) {
  return items
    .map((item) => {
      const scores = scoreResearchItem(item);
      return { ...item, agentScores: scores };
    })
    .sort((left, right) => (
      right.agentScores.totalScore - left.agentScores.totalScore ||
      right.agentScores.controversyScore - left.agentScores.controversyScore ||
      right.agentScores.innovationScore - left.agentScores.innovationScore
    ));
}

export function buildEditorialBrief(item, niche, index = 0) {
  const scores = item.agentScores ?? scoreResearchItem(item);
  const signals = scores.signals;
  const themeBridge = buildCentralThemeBridge(item, niche, {
    secondaryTheme: item.secondaryTheme
  });
  const editorialFrame = buildEditorialFrame(item, niche, signals, themeBridge, scores);

  return {
    rank: index + 1,
    title: item.title || `Pauta ${index + 1}`,
    source: item.source,
    link: item.link,
    snippet: item.snippet || "",
    publishedTime: item.publishedTime || "",
    query: item.query,
    whyNow: editorialFrame.mudanca_real,
    themeBridge,
    whyItMattersToNiche: themeBridge.whyItMatters,
    innovationType: themeBridge.innovationType,
    crossThemeBridge: themeBridge.crossThemeBridge,
    polarizingHook: editorialFrame.promessa_da_capa,
    debateAngle: editorialFrame.angulo_narrativo,
    innovationClose: editorialFrame.frase_final,
    contentBeats: editorialFrame.estrutura_do_carrossel.map((slide) => `${slide.label}: ${slide.body}`),
    editorialFrame,
    caution: "Use fatos verificaveis e diferencie opiniao de acusacao para nao transformar controversia em desinformacao.",
    scores
  };
}

export function buildEditorialAgentOutput(niche, items, options = {}) {
  const briefCount = Number(options.briefCount) || 5;
  const rankedItems = rankResearchItems(items);
  const topItems = rankedItems.slice(0, briefCount);
  const briefs = topItems.map((item, index) => buildEditorialBrief(item, niche, index));

  return {
    agentName: options.agentName || "Radar Polemico de Inovacao",
    niche,
    analyzedItems: rankedItems.length,
    briefCount: briefs.length,
    topSignals: uniqueLabels(briefs.flatMap((brief) => brief.scores.signals)),
    briefs
  };
}
