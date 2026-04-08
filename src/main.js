#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildEditorialAgentOutput } from "./editorial-agent.js";

const DEFAULT_OUTPUT_DIR = "output";
const DEFAULT_PAGES = 2;
const MAX_PAGES = 10;
const DEFAULT_BRIEF_COUNT = 5;

const CATEGORY_QUERIES = {
  tecnologia: [
    "inteligencia artificial",
    "open source",
    "startups",
    "ciberseguranca",
    "big tech regulation"
  ],
  politica: [
    "eleicoes",
    "congresso",
    "politica publica",
    "transparencia governamental",
    "reforma tributaria"
  ],
  geopolitica: [
    "china e estados unidos",
    "guerra comercial",
    "energia global",
    "defesa internacional",
    "sancoes economicas"
  ]
};

function parseArgs(argv) {
  const args = {
    niche: "",
    pages: DEFAULT_PAGES,
    locale: "lang_pt",
    country: "countryBR",
    recencyDays: 7,
    outputDir: DEFAULT_OUTPUT_DIR,
    domains: [],
    agentMode: "none",
    briefCount: DEFAULT_BRIEF_COUNT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--niche" && next) {
      args.niche = next;
      index += 1;
      continue;
    }

    if (token === "--pages" && next) {
      args.pages = Number(next);
      index += 1;
      continue;
    }

    if (token === "--locale" && next) {
      args.locale = next;
      index += 1;
      continue;
    }

    if (token === "--country" && next) {
      args.country = next;
      index += 1;
      continue;
    }

    if (token === "--recency-days" && next) {
      args.recencyDays = Number(next);
      index += 1;
      continue;
    }

    if (token === "--domains" && next) {
      args.domains = next.split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
      continue;
    }

    if (token === "--output-dir" && next) {
      args.outputDir = next;
      index += 1;
      continue;
    }

    if (token === "--agent-mode" && next) {
      args.agentMode = next;
      index += 1;
      continue;
    }

    if (token === "--brief-count" && next) {
      args.briefCount = Number(next);
      index += 1;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Uso:
  node src/main.js --niche "tecnologia"
  node src/main.js --niche "politica" --domains g1.globo.com,valor.globo.com
  node src/main.js --niche "geopolitica" --pages 3 --recency-days 14
  node src/main.js --niche "tecnologia" --agent-mode polemico-inovacao --brief-count 5

Variaveis obrigatorias:
  GOOGLE_CSE_API_KEY
  GOOGLE_CSE_CX

Opcoes:
  --niche           Nicho principal ou termo livre de pesquisa
  --pages           Quantas paginas de resultados buscar (1 a 10)
  --locale          Restricao de idioma da API do Google (padrao: lang_pt)
  --country         Restricao geografica (padrao: countryBR)
  --recency-days    Janela de recencia para o filtro sort (padrao: 7)
  --domains         Lista separada por virgula de dominios prioritarios
  --agent-mode      Modo editorial opcional. Use polemico-inovacao para gerar pautas prontas
  --brief-count     Quantidade de briefs editoriais gerados (padrao: 5)
  --output-dir      Diretorio de saida (padrao: output)
  `);
}

function buildTrendClause(agentMode) {
  if (agentMode !== "polemico-inovacao") {
    return "";
  }

  return ' ("em alta" OR tendencia OR viral OR debate OR crise OR inovacao)';
}

function buildQueryList(niche, domains, agentMode = "none") {
  const normalized = niche.toLowerCase().trim();
  const presets = CATEGORY_QUERIES[normalized] || [niche];
  const trendClause = buildTrendClause(agentMode);

  return presets.map((term) => {
    const domainClause = domains.length > 0
      ? ` (${domains.map((domain) => `site:${domain}`).join(" OR ")})`
      : "";

    return `"${term}"${trendClause} ${domainClause}`.trim();
  });
}

function buildSearchUrl({ apiKey, cx, query, locale, country, startIndex, recencyDays }) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("lr", locale);
  url.searchParams.set("cr", country);
  url.searchParams.set("start", String(startIndex));
  url.searchParams.set("sort", `date:r:${buildDateRange(recencyDays)}`);
  return url.toString();
}

function buildDateRange(recencyDays) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - recencyDays);
  return `${formatGoogleDate(start)}:${formatGoogleDate(now)}`;
}

function formatGoogleDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchSearchResults(options) {
  const response = await fetch(buildSearchUrl(options));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha na API do Google (${response.status}): ${body}`);
  }

  return response.json();
}

function normalizeItem(item, query, niche) {
  return {
    niche,
    query,
    title: item.title ?? "",
    link: item.link ?? "",
    snippet: item.snippet ?? "",
    displayLink: item.displayLink ?? "",
    publishedTime: item.pagemap?.metatags?.find((tag) => tag["article:published_time"])?.["article:published_time"] ?? null,
    source: item.displayLink ?? new URL(item.link).hostname
  };
}

function dedupeResults(items) {
  const map = new Map();

  for (const item of items) {
    if (!item.link) {
      continue;
    }

    if (!map.has(item.link)) {
      map.set(item.link, item);
    }
  }

  return [...map.values()];
}

function buildCarouselAngles(niche, items) {
  const topItems = items.slice(0, 5);

  return topItems.map((item, index) => ({
    slideTitle: `${index + 1}. ${item.title}`,
    hook: `O que isso muda em ${niche}?`,
    talkingPoints: [
      `Contexto rapido: ${item.snippet}`,
      `Fonte-base: ${item.source}`,
      "Leitura editorial: por que esse tema merece virar carrossel agora",
      "Fechamento: qual oportunidade, risco ou tendencia acompanhar"
    ]
  }));
}

function buildEditorialMarkdownSection(agentOutput) {
  if (!agentOutput || agentOutput.briefs.length === 0) {
    return [];
  }

  const lines = [
    "## Agente Editorial",
    "",
    `- Agente: ${agentOutput.agentName}`,
    `- Itens analisados: ${agentOutput.analyzedItems}`,
    `- Sinais dominantes: ${agentOutput.topSignals.join(", ") || "nenhum sinal forte encontrado"}`,
    ""
  ];

  agentOutput.briefs.forEach((brief) => {
    lines.push(`### ${brief.rank}. ${brief.title}`);
    lines.push(`- Fonte: ${brief.source}`);
    lines.push(`- Link: ${brief.link}`);
    lines.push(`- Por que agora: ${brief.whyNow}`);
    lines.push(`- Gancho polemico: ${brief.polarizingHook}`);
    lines.push(`- Angulo de debate: ${brief.debateAngle}`);
    lines.push(`- Fechamento em inovacao: ${brief.innovationClose}`);
    lines.push(`- Cuidado editorial: ${brief.caution}`);
    brief.contentBeats.forEach((beat) => {
      lines.push(`- ${beat}`);
    });
    lines.push("");
  });

  return lines;
}

function buildMarkdownReport({ niche, generatedAt, items, carouselAngles, editorialAgent, args }) {
  const lines = [
    `# Radar de Pesquisa: ${niche}`,
    "",
    `- Gerado em: ${generatedAt}`,
    `- Paginas pesquisadas: ${args.pages}`,
    `- Janela de recencia: ${args.recencyDays} dias`,
    `- Idioma: ${args.locale}`,
    `- Pais alvo: ${args.country}`,
    ""
  ];

  if (args.domains.length > 0) {
    lines.push(`- Dominios priorizados: ${args.domains.join(", ")}`);
    lines.push("");
  }

  lines.push("## Resultados");
  lines.push("");

  items.forEach((item, index) => {
    lines.push(`${index + 1}. [${item.title}](${item.link})`);
    lines.push(`   - Fonte: ${item.source}`);
    lines.push(`   - Query: ${item.query}`);
    lines.push(`   - Resumo: ${item.snippet}`);
  });

  lines.push("");
  lines.push("## Angulos para Carrossel");
  lines.push("");

  carouselAngles.forEach((angle) => {
    lines.push(`### ${angle.slideTitle}`);
    lines.push(`- Gancho: ${angle.hook}`);
    angle.talkingPoints.forEach((point) => {
      lines.push(`- ${point}`);
    });
    lines.push("");
  });

  lines.push(...buildEditorialMarkdownSection(editorialAgent));

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  if (!args.niche) {
    console.error("Informe um nicho com --niche.");
    printHelp();
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) {
    console.error("Defina GOOGLE_CSE_API_KEY e GOOGLE_CSE_CX antes de rodar.");
    process.exitCode = 1;
    return;
  }

  if (!Number.isInteger(args.pages) || args.pages < 1 || args.pages > MAX_PAGES) {
    console.error("--pages deve ser um numero inteiro entre 1 e 10.");
    process.exitCode = 1;
    return;
  }

  if (!Number.isInteger(args.briefCount) || args.briefCount < 1 || args.briefCount > 20) {
    console.error("--brief-count deve ser um numero inteiro entre 1 e 20.");
    process.exitCode = 1;
    return;
  }

  if (!["none", "polemico-inovacao"].includes(args.agentMode)) {
    console.error('--agent-mode deve ser "none" ou "polemico-inovacao".');
    process.exitCode = 1;
    return;
  }

  const queries = buildQueryList(args.niche, args.domains, args.agentMode);
  const allItems = [];

  for (const query of queries) {
    for (let page = 0; page < args.pages; page += 1) {
      const startIndex = page * 10 + 1;
      const payload = await fetchSearchResults({
        apiKey,
        cx,
        query,
        locale: args.locale,
        country: args.country,
        startIndex,
        recencyDays: args.recencyDays
      });

      const normalized = (payload.items ?? []).map((item) => normalizeItem(item, query, args.niche));
      allItems.push(...normalized);

      if (!payload.items?.length) {
        break;
      }
    }
  }

  const uniqueItems = dedupeResults(allItems);
  const carouselAngles = buildCarouselAngles(args.niche, uniqueItems);
  const editorialAgent = args.agentMode === "polemico-inovacao"
    ? buildEditorialAgentOutput(args.niche, uniqueItems, { briefCount: args.briefCount })
    : null;
  const generatedAt = new Date().toISOString();
  const outputBaseName = args.niche.toLowerCase().replace(/\s+/g, "-");
  const outputDir = path.resolve(args.outputDir);

  await mkdir(outputDir, { recursive: true });

  const jsonOutput = {
    generatedAt,
    args,
    totalResults: uniqueItems.length,
    items: uniqueItems,
    carouselAngles,
    editorialAgent
  };

  const jsonPath = path.join(outputDir, `${outputBaseName}.json`);
  const mdPath = path.join(outputDir, `${outputBaseName}.md`);

  await writeFile(jsonPath, JSON.stringify(jsonOutput, null, 2));
  await writeFile(
    mdPath,
    buildMarkdownReport({
      niche: args.niche,
      generatedAt,
      items: uniqueItems,
      carouselAngles,
      editorialAgent,
      args
    })
  );

  console.log(`Pesquisa concluida com ${uniqueItems.length} resultados unicos.`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
