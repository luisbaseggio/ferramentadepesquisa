import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRadarQueries,
  buildRadarSnapshotFromItems,
  createRealtimeRadarService,
  fetchGoogleNewsRadar,
  parseSiteFilters,
  parseGoogleNewsRss
} from "../src/realtime-radar.js";

test("parseGoogleNewsRss normalizes title, source and published date", () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title><![CDATA[Crise em startup de IA acelera debate - Valor Economico]]></title>
          <link>https://news.google.com/articles/example</link>
          <description><![CDATA[Discussao sobre regulacao e mercado.]])</description>
          <pubDate>Tue, 01 Apr 2026 11:30:00 GMT</pubDate>
          <source url="https://valor.globo.com">Valor Economico</source>
        </item>
      </channel>
    </rss>
  `;

  const [item] = parseGoogleNewsRss(xml, "inovacao", "\"startup\" debate");

  assert.equal(item.title, "Crise em startup de IA acelera debate");
  assert.equal(item.source, "Valor Economico");
  assert.equal(item.query, "\"startup\" debate");
  assert.match(item.publishedTime, /^2026-04-01T11:30:00/);
});

test("buildRadarSnapshotFromItems ranks controversies and briefs for innovation", () => {
  const snapshot = buildRadarSnapshotFromItems({
    niche: "inovacao",
    source: "google-news",
    queries: ["\"startup\" debate"],
    siteFilters: ["valor.globo.com"],
    items: [
      {
        title: "Boicote a plataforma de IA vira crise entre startups",
        snippet: "Mercado reage a pressao regulatoria e debate sobre inovacao.",
        query: "\"startup\" debate",
        source: "NeoFeed",
        link: "https://example.com/a",
        publishedTime: new Date().toISOString()
      },
      {
        title: "Regulacao de chips acirra disputa entre big techs",
        snippet: "Tema pressiona cadeia global e levanta discussoes sobre estrategia.",
        query: "\"chip\" debate",
        source: "The News",
        link: "https://example.com/b",
        publishedTime: new Date().toISOString()
      }
    ]
  });

  assert.equal(snapshot.summary.trackedItems, 2);
  assert.ok(snapshot.summary.controversyCount >= 1);
  assert.equal(snapshot.briefs.length, 2);
  assert.deepEqual(snapshot.siteFilters, ["valor.globo.com"]);
  assert.ok(snapshot.trackedItems[0].scores.totalScore >= snapshot.trackedItems[1].scores.totalScore);
  assert.match(snapshot.trackedItems[0].themeBridge.whyItMatters, /inovação|inovacao/i);
  assert.ok(snapshot.briefs[0].whyItMattersToNiche);
  assert.ok(snapshot.controversies[0].themeBridge);
});

test("buildRadarQueries appends selected site filters to the query", () => {
  const queries = buildRadarQueries("inovacao", ["valor.globo.com", "neofeed.com.br"]);

  assert.ok(queries[0].includes("site:valor.globo.com"));
  assert.ok(queries[0].includes("site:neofeed.com.br"));
});

test("buildRadarQueries understands natural niche phrases like pesquisa sobre inovacao", () => {
  const queries = buildRadarQueries("pesquisa sobre inovacao");

  assert.ok(queries.some((query) => /inteligencia artificial/i.test(query)));
  assert.ok(queries.some((query) => /\binovacao\b/i.test(query)));
});

test("buildRadarQueries can combine niche and a secondary theme", () => {
  const queries = buildRadarQueries("inovacao", [], { secondaryTheme: "Neymar" });

  assert.ok(queries.some((query) => /Neymar/i.test(query)));
  assert.ok(queries.some((query) => /inovacao/i.test(query)));
});

test("buildRadarQueries reinforces brazilian context when the niche asks for Brasil", () => {
  const queries = buildRadarQueries("politica brasil");

  assert.ok(queries.some((query) => /Brasil|Brasilia|Congresso|Senado|Camara|STF/i.test(query)));
  assert.ok(queries.some((query) => /politica brasil/i.test(query)));
});

test("parseSiteFilters normalizes and deduplicates domains", () => {
  assert.deepEqual(
    parseSiteFilters("https://www.valor.globo.com, neofeed.com.br; valor.globo.com"),
    ["valor.globo.com", "neofeed.com.br"]
  );
});

test("fetchGoogleNewsRadar keeps only items from selected domains", async () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title><![CDATA[Crise de IA pressiona mercado - Valor Economico]]></title>
          <link>https://valor.globo.com/empresas/noticia-1.ghtml</link>
          <description><![CDATA[Discussao sobre regulacao e mercado.]]></description>
          <pubDate>Tue, 01 Apr 2026 11:30:00 GMT</pubDate>
          <source url="https://valor.globo.com">Valor Economico</source>
        </item>
        <item>
          <title><![CDATA[Outro debate sobre IA - Outro Site]]></title>
          <link>https://outrosite.com/noticia-2</link>
          <description><![CDATA[Discussao paralela.]]></description>
          <pubDate>Tue, 01 Apr 2026 12:00:00 GMT</pubDate>
          <source url="https://outrosite.com">Outro Site</source>
        </item>
      </channel>
    </rss>
  `;

  const result = await fetchGoogleNewsRadar({
    niche: "inovacao",
    siteFilters: ["valor.globo.com"],
    now: new Date("2026-04-01T18:00:00.000Z").getTime(),
    fetchImpl: async () => ({
      ok: true,
      text: async () => xml
    })
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].source, "Valor Economico");
});

test("fetchGoogleNewsRadar keeps only brazil-focused items when the niche asks for Brasil", async () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title><![CDATA[Congresso amplia disputa na politica do Brasil - G1]]></title>
          <link>https://g1.globo.com/politica/noticia-1.ghtml</link>
          <description><![CDATA[Discussao sobre Congresso e governo federal no Brasil.]]></description>
          <pubDate>Tue, 01 Apr 2026 11:30:00 GMT</pubDate>
          <source url="https://g1.globo.com">G1</source>
        </item>
        <item>
          <title><![CDATA[Trump acelera tensao na politica internacional - CNN]]></title>
          <link>https://edition.cnn.com/world/noticia-2</link>
          <description><![CDATA[Discussao sobre politica externa dos EUA.]]></description>
          <pubDate>Tue, 01 Apr 2026 12:00:00 GMT</pubDate>
          <source url="https://edition.cnn.com">CNN</source>
        </item>
      </channel>
    </rss>
  `;

  const result = await fetchGoogleNewsRadar({
    niche: "politica brasil",
    now: new Date("2026-04-01T18:00:00.000Z").getTime(),
    fetchImpl: async () => ({
      ok: true,
      text: async () => xml
    })
  });

  assert.equal(result.items.length, 1);
  assert.match(result.items[0].title, /brasil/i);
});

test("fetchGoogleNewsRadar discards items older than the selected time window", async () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title><![CDATA[Noticia recente - Valor Economico]]></title>
          <link>https://valor.globo.com/recentes.ghtml</link>
          <description><![CDATA[Discussao recente.]]></description>
          <pubDate>Wed, 02 Apr 2026 15:00:00 GMT</pubDate>
          <source url="https://valor.globo.com">Valor Economico</source>
        </item>
        <item>
          <title><![CDATA[Noticia antiga - Valor Economico]]></title>
          <link>https://valor.globo.com/antiga.ghtml</link>
          <description><![CDATA[Discussao antiga.]]></description>
          <pubDate>Mon, 30 Mar 2026 10:00:00 GMT</pubDate>
          <source url="https://valor.globo.com">Valor Economico</source>
        </item>
      </channel>
    </rss>
  `;

  const result = await fetchGoogleNewsRadar({
    niche: "inovacao",
    recencyHours: 24,
    now: new Date("2026-04-02T18:00:00.000Z").getTime(),
    fetchImpl: async () => ({
      ok: true,
      text: async () => xml
    })
  });

  assert.equal(result.items.length, 1);
  assert.match(result.items[0].title, /recente/i);
});

test("fetchGoogleNewsRadar falls back to innovation presets when natural language niche returns no items", async () => {
  let calls = 0;
  const fallbackXml = [
    "<rss>",
    "<channel>",
    "<item>",
    "<title><![CDATA[Startup de IA vira destaque - Valor Economico]]></title>",
    "<link>https://valor.globo.com/startup-ia.ghtml</link>",
    "<description><![CDATA[Debate recente sobre mercado e tecnologia.]]></description>",
    "<pubDate>Wed, 02 Apr 2026 15:00:00 GMT</pubDate>",
    '<source url="https://valor.globo.com">Valor Economico</source>',
    "</item>",
    "</channel>",
    "</rss>"
  ].join("");

  const result = await fetchGoogleNewsRadar({
    niche: "pesquisa sobre inovacao",
    recencyHours: 24,
    now: new Date("2026-04-02T18:00:00.000Z").getTime(),
    fetchImpl: async () => {
      calls += 1;

      if (calls <= 6) {
        return {
          ok: true,
          text: async () => "<rss><channel></channel></rss>"
        };
      }

      return {
        ok: true,
        text: async () => fallbackXml
        };
    }
  });

  assert.equal(result.items.length, 1);
  assert.match(result.items[0].title, /startup de ia/i);
  assert.ok(result.queries.length >= 6);
});

test("createRealtimeRadarService caches snapshots and refreshes on force", async () => {
  let calls = 0;
  const service = createRealtimeRadarService({
    fetchRadarItems: async () => {
      calls += 1;
      return {
        queries: ["\"startup\" debate"],
        items: [
          {
            title: "Censura em plataforma reacende debate sobre IA",
            snippet: "Tema mobiliza mercado, regulacao e tecnologia.",
            query: "\"startup\" debate",
            source: "Exame",
            link: `https://example.com/${calls}`,
            publishedTime: new Date().toISOString()
          }
        ]
      };
    },
    now: () => 1_000
  });

  const first = await service.getSnapshot({ niche: "inovacao" });
  const second = await service.getSnapshot({ niche: "inovacao" });
  const forced = await service.getSnapshot({ niche: "inovacao" }, { force: true });

  assert.equal(calls, 2);
  assert.equal(first.snapshot.summary.trackedItems, 1);
  assert.equal(second.snapshot.summary.trackedItems, 1);
  assert.equal(forced.snapshot.summary.trackedItems, 1);

  service.close();
});
