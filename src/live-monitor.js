export const LIVE_MONITOR_PRESETS = [
  "inovacao",
  "inteligencia artificial",
  "big tech",
  "startup",
  "regulacao tecnologia",
  "plataformas digitais"
];

function weightHeat(heat) {
  if (heat === "critico") {
    return 3;
  }

  if (heat === "alto") {
    return 2;
  }

  return 1;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildLiveMonitorSnapshot({ entries = [], generatedAt = new Date().toISOString() } = {}) {
  const hotspots = entries
    .flatMap(({ niche, snapshot }) => (
      (snapshot?.controversies ?? []).map((item) => ({
        ...item,
        niche,
        sourceLabel: snapshot?.sourceLabel ?? "Google Noticias"
      }))
    ))
    .sort((left, right) => (
      (right.avgScore ?? 0) - (left.avgScore ?? 0) ||
      weightHeat(right.heat) - weightHeat(left.heat) ||
      (right.itemCount ?? 0) - (left.itemCount ?? 0)
    ))
    .slice(0, 18);

  const liveFeed = entries
    .flatMap(({ niche, snapshot }) => (
      (snapshot?.trackedItems ?? []).map((item) => ({
        ...item,
        niche,
        sourceLabel: snapshot?.sourceLabel ?? "Google Noticias"
      }))
    ))
    .sort((left, right) => (
      (right.scores?.totalScore ?? 0) - (left.scores?.totalScore ?? 0) ||
      weightHeat(right.heat) - weightHeat(left.heat)
    ))
    .slice(0, 36);

  const niches = entries.map(({ niche, snapshot }) => ({
    niche,
    trackedItems: snapshot?.summary?.trackedItems ?? 0,
    controversyCount: snapshot?.summary?.controversyCount ?? 0,
    averageScore: snapshot?.summary?.averageScore ?? 0,
    generatedAt: snapshot?.generatedAt ?? null
  }));

  const queries = unique(entries.flatMap(({ snapshot }) => snapshot?.queries ?? [])).slice(0, 12);
  const siteFilters = unique(entries.flatMap(({ snapshot }) => snapshot?.siteFilters ?? []));

  return {
    generatedAt,
    presets: LIVE_MONITOR_PRESETS,
    niches,
    queries,
    siteFilters,
    hotspots,
    liveFeed
  };
}
