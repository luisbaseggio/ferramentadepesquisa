import { buildEditorialAgentOutput, rankResearchItems } from "./editorial-agent.js";
import { buildCentralThemeBridge } from "./topic-bridge.js";

const DEFAULT_SOURCE = "google-news";
const DEFAULT_NICHE = "inovacao";
const DEFAULT_LOCALE = "pt-BR";
const DEFAULT_REGION = "BR";
const DEFAULT_RECENCY_HOURS = 24;
const DEFAULT_LIMIT = 30;
const DEFAULT_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_SITE_FILTERS = [];

const SOURCE_LABELS = {
  "google-news": "Google Noticias"
};

const RADAR_STOPWORDS = new Set([
  "about",
  "agora",
  "ainda",
  "alguma",
  "algumas",
  "alguns",
  "antes",
  "apos",
  "aqui",
  "area",
  "assim",
  "aumenta",
  "bate",
  "brasil",
  "cada",
  "como",
  "contra",
  "cresce",
  "crise",
  "custa",
  "dados",
  "deixa",
  "depois",
  "desde",
  "disputa",
  "empresa",
  "entre",
  "essa",
  "essas",
  "esse",
  "esses",
  "esta",
  "estao",
  "este",
  "foco",
  "forca",
  "google",
  "grande",
  "grupo",
  "hoje",
  "inovacao",
  "inovacoes",
  "inteligencia",
  "mercado",
  "muda",
  "mundo",
  "nesta",
  "noticia",
  "noticias",
  "nova",
  "novas",
  "novo",
  "novos",
  "onde",
  "para",
  "pelo",
  "pelos",
  "pela",
  "pelas",
  "porque",
  "processo",
  "queda",
  "regulacao",
  "sobre",
  "social",
  "startups",
  "tambem",
  "tecnologia",
  "tecnologias",
  "temas",
  "tensao",
  "ultimo",
  "ultimos",
  "viral"
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDomain(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function parseSiteFilters(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeDomain).filter(Boolean))];
  }

  return [...new Set(
    String(value ?? "")
      .split(/[,\n;]/g)
      .map(normalizeDomain)
      .filter(Boolean)
  )];
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripTags(value) {
  return decodeHtml(String(value ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildControversyClause() {
  return '(crise OR debate OR boicote OR processo OR regulacao OR censura OR disputa OR banimento)';
}

function buildInnovationClause() {
  return '(inovacao OR tecnologia OR IA OR "inteligencia artificial" OR startup OR plataforma)';
}

function buildSiteClause(siteFilters = []) {
  const domains = parseSiteFilters(siteFilters);

  if (domains.length === 0) {
    return "";
  }

  return ` (${domains.map((domain) => `site:${domain}`).join(" OR ")})`;
}

function normalizeSecondaryThemeIntent(theme) {
  const raw = String(theme ?? "").trim();
  const cleaned = normalizeText(raw)
    .replace(/\b(quero|preciso|fazer|criar|buscar|pesquisar|pesquisa|sobre|tema|assunto|posts|post|cruzar|junto|com)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    raw,
    core: cleaned || raw
  };
}

function normalizeNicheIntent(niche) {
  const raw = String(niche ?? DEFAULT_NICHE).trim() || DEFAULT_NICHE;
  const normalized = normalizeText(raw)
    .replace(/\b(quero|preciso|fazer|criar|buscar|pesquisar|pesquisa|noticia|noticias|sobre|tema|assunto|posts|post)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const core = normalized || DEFAULT_NICHE;
  const brazilFocus = /\b(brasil|brasileira|brasileiro|brasileiras|brasileiros|brasilia)\b/.test(core);

  return {
    raw,
    core,
    innovationLike: /\binovacao\b|\btecnologia\b|\bia\b/.test(core),
    brazilFocus
  };
}

function buildBrazilClause() {
  return '(Brasil OR brasileira OR brasileiro OR Brasilia OR Congresso OR Senado OR Camara OR STF OR Planalto OR "governo federal")';
}

export function buildRadarQueries(niche, siteFilters = [], options = {}) {
  const intent = normalizeNicheIntent(niche);
  const secondaryIntent = normalizeSecondaryThemeIntent(options.secondaryTheme);
  const cleanedNiche = intent.raw;
  const coreNiche = intent.core;
  const normalizedCore = normalizeText(coreNiche);
  const topicPresets = intent.innovationLike || normalizedCore === "inovacao"
    ? [
        coreNiche,
        "inovacao",
        "inteligencia artificial",
        "startup",
        "big tech",
        "plataforma digital",
        "regulacao tecnologia"
      ]
    : [coreNiche, cleanedNiche];
  const controversyClause = buildControversyClause();
  const innovationClause = buildInnovationClause();
  const brazilClause = intent.brazilFocus ? ` ${buildBrazilClause()}` : "";
  const siteClause = buildSiteClause(siteFilters);
  const queries = [
    ...topicPresets.flatMap((term) => ([
      `"${term}" ${controversyClause}${brazilClause} ${innovationClause}${siteClause}`,
      `${term} ${controversyClause}${brazilClause} ${innovationClause}${siteClause}`,
      `"${term}"${brazilClause} ${innovationClause}${siteClause}`
    ])),
    `"${coreNiche}" ${controversyClause}${brazilClause}${siteClause}`,
    `${coreNiche} ${controversyClause}${brazilClause}${siteClause}`,
    `${coreNiche}${brazilClause} ${innovationClause}${siteClause}`,
    `"${coreNiche}" (${buildControversyClause()} AND ${buildInnovationClause()})${brazilClause}${siteClause}`
  ];

  if (secondaryIntent.core) {
    queries.unshift(
      `"${coreNiche}" "${secondaryIntent.core}" ${controversyClause}${brazilClause} ${innovationClause}${siteClause}`,
      `${coreNiche} ${secondaryIntent.core} ${controversyClause}${brazilClause} ${innovationClause}${siteClause}`,
      `"${secondaryIntent.core}"${brazilClause} ${innovationClause}${siteClause}`,
      `"${secondaryIntent.core}" "${coreNiche}" ${controversyClause}${brazilClause}${siteClause}`
    );
  }

  return [...new Set(queries)].slice(0, 6);
}

function buildGoogleNewsUrl({ query, locale, region, recencyHours }) {
  const url = new URL("https://news.google.com/rss/search");
  const numericRecency = Number(recencyHours);
  const hasRecency = Number.isFinite(numericRecency) && numericRecency > 0;
  url.searchParams.set("q", hasRecency ? `${query} when:${numericRecency}h` : query);
  url.searchParams.set("hl", locale);
  url.searchParams.set("gl", region);
  url.searchParams.set("ceid", `${region}:pt-419`);
  return url.toString();
}

function extractTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? match[1].trim() : "";
}

function extractSource(block) {
  const sourceMatch = block.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/i);

  if (!sourceMatch) {
    return { source: "", sourceUrl: "" };
  }

  return {
    source: stripTags(sourceMatch[2]),
    sourceUrl: sourceMatch[1] ?? ""
  };
}

function cleanTitle(rawTitle, source) {
  const title = stripTags(rawTitle);

  if (source && title.endsWith(` - ${source}`)) {
    return title.slice(0, -(` - ${source}`).length);
  }

  return title;
}

export function parseGoogleNewsRss(xml, niche, query) {
  const matches = [...String(xml ?? "").matchAll(/<item>([\s\S]*?)<\/item>/gi)];

  return matches.map((match) => {
    const block = match[1];
    const { source, sourceUrl } = extractSource(block);
    const rawTitle = extractTag(block, "title");
    const link = decodeHtml(extractTag(block, "link"));
    const description = stripTags(extractTag(block, "description"));
    const publishedRaw = stripTags(extractTag(block, "pubDate"));
    const published = publishedRaw ? new Date(publishedRaw) : null;

    return {
      niche,
      query,
      title: cleanTitle(rawTitle, source),
      link,
      snippet: description,
      displayLink: sourceUrl || link,
      publishedTime: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
      source: source || "Google Noticias"
    };
  });
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function itemMatchesSiteFilters(item, siteFilters = []) {
  const domains = parseSiteFilters(siteFilters);

  if (domains.length === 0) {
    return true;
  }

  const itemDomain = normalizeDomain(
    hostnameFromUrl(item.displayLink) || hostnameFromUrl(item.link)
  );

  return domains.some((domain) => itemDomain === domain || itemDomain.endsWith(`.${domain}`));
}

function itemMatchesBrazilFocus(item) {
  const domain = normalizeDomain(
    hostnameFromUrl(item.displayLink) || hostnameFromUrl(item.link)
  );
  const haystack = normalizeText([
    item.title,
    item.snippet,
    item.source,
    item.displayLink,
    item.link
  ].filter(Boolean).join(" "));

  return domain.endsWith(".br")
    || /\b(brasil|brasileira|brasileiro|brasilia|congresso|senado|camara|stf|planalto)\b/.test(haystack);
}

function itemMatchesRecency(item, recencyHours = DEFAULT_RECENCY_HOURS, now = Date.now()) {
  const numericRecency = Number(recencyHours);
  const hasRecency = Number.isFinite(numericRecency) && numericRecency > 0;

  if (!hasRecency) {
    return true;
  }

  if (!item.publishedTime) {
    return false;
  }

  const published = new Date(item.publishedTime);

  if (Number.isNaN(published.getTime())) {
    return false;
  }

  const cutoff = now - (numericRecency * 60 * 60 * 1000);
  return published.getTime() >= cutoff;
}

export function dedupeRadarItems(items) {
  const deduped = new Map();

  for (const item of items) {
    const titleKey = slugify(item.title);
    const sourceKey = slugify(item.source);
    const linkKey = item.link || `${titleKey}:${sourceKey}`;
    const key = linkKey || `${titleKey}:${sourceKey}`;

    if (key && !deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()];
}

function extractTopicTokens(text, niche) {
  const nicheKey = slugify(niche);

  return (normalizeText(text).match(/[a-z0-9]{4,}/g) ?? [])
    .filter((token) => token !== nicheKey)
    .filter((token) => !RADAR_STOPWORDS.has(token))
    .slice(0, 8);
}

function formatClusterLabel(tokens, item) {
  if (tokens.length === 0) {
    return item.title || "Tema em observacao";
  }

  return tokens
    .slice(0, 3)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" / ");
}

function heatLabel(score) {
  if (score >= 17) {
    return "critico";
  }

  if (score >= 11) {
    return "alto";
  }

  return "observacao";
}

function buildTrackedItem(item, niche) {
  const score = item.agentScores.totalScore;
  const themeBridge = item.themeBridge || buildCentralThemeBridge(item, niche, {
    secondaryTheme: item.secondaryTheme
  });

  return {
    title: item.title,
    link: item.link,
    source: item.source,
    query: item.query,
    snippet: item.snippet,
    publishedTime: item.publishedTime,
    heat: heatLabel(score),
    scores: item.agentScores,
    signals: item.agentScores.signals,
    themeBridge
  };
}

export function clusterRadarItems(items, niche) {
  const clusters = [];

  for (const item of items) {
    const topicTokens = extractTopicTokens(item.title, niche);
    let bestCluster = null;
    let bestOverlap = 0;

    for (const cluster of clusters) {
      const overlap = topicTokens.filter((token) => cluster.topicTokens.has(token)).length;

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCluster = cluster;
      }
    }

    if (!bestCluster || bestOverlap < 2) {
      bestCluster = {
        id: `cluster-${clusters.length + 1}`,
        label: formatClusterLabel(topicTokens, item),
        topicTokens: new Set(topicTokens),
        items: [],
        sources: new Set(),
        signals: new Set()
      };
      clusters.push(bestCluster);
    }

    topicTokens.forEach((token) => bestCluster.topicTokens.add(token));
    bestCluster.items.push(item);
    bestCluster.sources.add(item.source);
    item.agentScores.signals.forEach((signal) => bestCluster.signals.add(signal));
  }

  return clusters
    .map((cluster) => {
      const topItem = cluster.items[0];
      const score = cluster.items.reduce((sum, item) => sum + item.agentScores.totalScore, 0) / cluster.items.length;

      return {
        id: cluster.id,
        label: cluster.label,
        itemCount: cluster.items.length,
        avgScore: Number(score.toFixed(1)),
        heat: heatLabel(score),
        latestPublishedTime: cluster.items
          .map((item) => item.publishedTime)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
        sources: [...cluster.sources],
        signals: [...cluster.signals],
        leadTitle: topItem?.title ?? "Tema em observacao",
        leadLink: topItem?.link ?? "",
        summary: topItem?.snippet ?? "Sinal recente em observacao pelo radar.",
        sampleTitles: cluster.items.slice(0, 3).map((item) => item.title),
        themeBridge: topItem?.themeBridge || null
      };
    })
    .sort((left, right) => right.avgScore - left.avgScore || right.itemCount - left.itemCount);
}

export function buildRadarSnapshotFromItems({
  niche,
  secondaryTheme = "",
  source = DEFAULT_SOURCE,
  items,
  generatedAt = new Date().toISOString(),
  queries = [],
  siteFilters = []
}) {
  const rankedItems = rankResearchItems(items);
  const enrichedItems = rankedItems.map((item) => ({
    ...item,
    themeBridge: buildCentralThemeBridge(item, niche, { secondaryTheme }),
    secondaryTheme
  }));
  const trackedItems = enrichedItems.map((item) => buildTrackedItem(item, niche));
  const controversies = clusterRadarItems(enrichedItems.slice(0, 18), niche).slice(0, 6);
  const editorialAgent = buildEditorialAgentOutput(niche, enrichedItems, { briefCount: 5 });

  return {
    generatedAt,
    niche,
    secondaryTheme,
    source,
    sourceLabel: SOURCE_LABELS[source] || source,
    siteFilters: parseSiteFilters(siteFilters),
    queries,
    summary: {
      trackedItems: trackedItems.length,
      controversyCount: controversies.length,
      topSignals: editorialAgent.topSignals,
      averageScore: trackedItems.length > 0
        ? Number((trackedItems.reduce((sum, item) => sum + item.scores.totalScore, 0) / trackedItems.length).toFixed(1))
        : 0
    },
    controversies,
    trackedItems: trackedItems.slice(0, 15),
    briefs: editorialAgent.briefs
  };
}

export async function fetchGoogleNewsRadar({
  niche = DEFAULT_NICHE,
  secondaryTheme = "",
  locale = DEFAULT_LOCALE,
  region = DEFAULT_REGION,
  recencyHours = DEFAULT_RECENCY_HOURS,
  limit = DEFAULT_LIMIT,
  siteFilters = DEFAULT_SITE_FILTERS,
  now = Date.now(),
  fetchImpl = fetch
} = {}) {
  const nicheIntent = normalizeNicheIntent(niche);
  const queries = buildRadarQueries(niche, siteFilters, { secondaryTheme });
  const collectedItems = [];

  for (const query of queries) {
    const url = buildGoogleNewsUrl({ query, locale, region, recencyHours });
    const response = await fetchImpl(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha ao consultar Google Noticias (${response.status}): ${body}`);
    }

    const xml = await response.text();
    collectedItems.push(...parseGoogleNewsRss(xml, niche, query).map((item) => ({
      ...item,
      secondaryTheme
    })));
  }

  const filteredItems = dedupeRadarItems(collectedItems)
    .filter((item) => itemMatchesSiteFilters(item, siteFilters))
    .filter((item) => (!nicheIntent.brazilFocus || itemMatchesBrazilFocus(item)))
    .filter((item) => itemMatchesRecency(item, recencyHours, now));

  if (filteredItems.length > 0) {
    return {
      queries,
      items: filteredItems.slice(0, limit)
    };
  }

  const fallbackIntent = normalizeNicheIntent(niche);

  if (!fallbackIntent.innovationLike) {
    return {
      queries,
      items: []
    };
  }

  const fallbackQueries = buildRadarQueries(DEFAULT_NICHE, siteFilters, { secondaryTheme });
  const fallbackItems = [];

  for (const query of fallbackQueries) {
    const url = buildGoogleNewsUrl({ query, locale, region, recencyHours });
    const response = await fetchImpl(url);

    if (!response.ok) {
      continue;
    }

    const xml = await response.text();
    fallbackItems.push(...parseGoogleNewsRss(xml, niche, query).map((item) => ({
      ...item,
      secondaryTheme
    })));
  }

  return {
    queries: [...new Set([...queries, ...fallbackQueries])].slice(0, 8),
    items: dedupeRadarItems(fallbackItems)
      .filter((item) => itemMatchesSiteFilters(item, siteFilters))
      .filter((item) => (!nicheIntent.brazilFocus || itemMatchesBrazilFocus(item)))
      .filter((item) => itemMatchesRecency(item, recencyHours, now))
      .slice(0, limit)
  };
}

function buildProfile(profile = {}) {
  const hasRecencyValue = profile.recencyHours !== undefined
    && profile.recencyHours !== null
    && String(profile.recencyHours).trim() !== "";

  return {
    niche: String(profile.niche ?? DEFAULT_NICHE).trim() || DEFAULT_NICHE,
    secondaryTheme: String(profile.secondaryTheme ?? "").trim(),
    source: profile.source ?? DEFAULT_SOURCE,
    locale: profile.locale ?? DEFAULT_LOCALE,
    region: profile.region ?? DEFAULT_REGION,
    recencyHours: hasRecencyValue ? Number(profile.recencyHours) || DEFAULT_RECENCY_HOURS : null,
    limit: Number(profile.limit) || DEFAULT_LIMIT,
    refreshIntervalMs: Number(profile.refreshIntervalMs) || DEFAULT_REFRESH_INTERVAL_MS,
    siteFilters: parseSiteFilters(profile.siteFilters ?? profile.siteFilter ?? DEFAULT_SITE_FILTERS)
  };
}

function profileKey(profile) {
  return JSON.stringify(profile);
}

export function createRealtimeRadarService({
  fetchRadarItems = fetchGoogleNewsRadar,
  now = () => Date.now()
} = {}) {
  const sessions = new Map();

  function broadcast(session) {
    const payload = {
      type: "snapshot",
      data: session.snapshot,
      status: {
        lastSuccessAt: session.lastSuccessAt,
        lastError: session.lastError,
        stale: !session.lastSuccessAt || now() - session.lastSuccessAt > session.profile.refreshIntervalMs * 2
      }
    };

    for (const listener of session.listeners) {
      listener(payload);
    }
  }

  async function refreshSession(session, force = false) {
    const snapshotStillFresh = session.snapshot
      && session.lastSuccessAt
      && now() - session.lastSuccessAt < session.profile.refreshIntervalMs;

    if (!force && snapshotStillFresh) {
      return session.snapshot;
    }

    if (session.refreshPromise) {
      return session.refreshPromise;
    }

    session.refreshPromise = (async () => {
      try {
        const result = await fetchRadarItems(session.profile);
        session.snapshot = buildRadarSnapshotFromItems({
          niche: session.profile.niche,
          secondaryTheme: session.profile.secondaryTheme,
          source: session.profile.source,
          items: result.items,
          queries: result.queries,
          siteFilters: session.profile.siteFilters,
          generatedAt: new Date(now()).toISOString()
        });
        session.lastSuccessAt = now();
        session.lastError = null;
        broadcast(session);
        return session.snapshot;
      } catch (error) {
        session.lastError = error.message;

        if (session.snapshot) {
          broadcast(session);
          return session.snapshot;
        }

        throw error;
      } finally {
        session.refreshPromise = null;
      }
    })();

    return session.refreshPromise;
  }

  function ensureSession(inputProfile) {
    const profile = buildProfile(inputProfile);
    const key = profileKey(profile);

    if (!sessions.has(key)) {
      sessions.set(key, {
        key,
        profile,
        snapshot: null,
        listeners: new Set(),
        timer: null,
        refreshPromise: null,
        lastSuccessAt: 0,
        lastError: null
      });
    }

    const session = sessions.get(key);

    if (!session.timer) {
      session.timer = setInterval(() => {
        refreshSession(session).catch(() => {});
      }, session.profile.refreshIntervalMs);
      session.timer.unref?.();
    }

    return session;
  }

  return {
    async getSnapshot(profile, options = {}) {
      const session = ensureSession(profile);
      const snapshot = await refreshSession(session, options.force === true);

      return {
        snapshot,
        status: {
          lastSuccessAt: session.lastSuccessAt,
          lastError: session.lastError,
          stale: !session.lastSuccessAt || now() - session.lastSuccessAt > session.profile.refreshIntervalMs * 2
        }
      };
    },
    subscribe(profile, listener) {
      const session = ensureSession(profile);
      session.listeners.add(listener);

      refreshSession(session).catch(() => {});

      if (session.snapshot) {
        listener({
          type: "snapshot",
          data: session.snapshot,
          status: {
            lastSuccessAt: session.lastSuccessAt,
            lastError: session.lastError,
            stale: !session.lastSuccessAt || now() - session.lastSuccessAt > session.profile.refreshIntervalMs * 2
          }
        });
      }

      return () => {
        session.listeners.delete(listener);

        if (session.listeners.size === 0 && session.timer) {
          clearInterval(session.timer);
          session.timer = null;
        }
      };
    },
    clear(profile) {
      if (profile) {
        const key = profileKey(buildProfile(profile));
        const session = sessions.get(key);

        if (session?.timer) {
          clearInterval(session.timer);
        }

        sessions.delete(key);
        return;
      }

      for (const session of sessions.values()) {
        if (session.timer) {
          clearInterval(session.timer);
          session.timer = null;
        }

        session.listeners.clear();
      }

      sessions.clear();
    },
    close() {
      for (const session of sessions.values()) {
        if (session.timer) {
          clearInterval(session.timer);
          session.timer = null;
        }

        session.listeners.clear();
      }

      sessions.clear();
    }
  };
}
