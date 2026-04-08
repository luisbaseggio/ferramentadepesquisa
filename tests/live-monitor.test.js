import test from "node:test";
import assert from "node:assert/strict";

import { buildLiveMonitorSnapshot } from "../src/live-monitor.js";

test("buildLiveMonitorSnapshot aggregates hotspots and feed across niches", () => {
  const snapshot = buildLiveMonitorSnapshot({
    entries: [
      {
        niche: "inovacao",
        snapshot: {
          sourceLabel: "Google Noticias",
          queries: ["inovacao crise"],
          siteFilters: ["valor.globo.com"],
          summary: { trackedItems: 2, controversyCount: 1, averageScore: 10.4 },
          controversies: [
            {
              id: "c1",
              label: "IA / Mercado",
              avgScore: 14.2,
              heat: "alto",
              itemCount: 3,
              summary: "Debate em alta",
              leadLink: "https://example.com/1",
              themeBridge: {
                whyItMatters: "Isso importa para inovacao porque plataforma e mercado se reorganizam."
              }
            }
          ],
          trackedItems: [
            {
              title: "Debate sobre IA cresce",
              heat: "alto",
              source: "Valor",
              link: "https://example.com/1",
              snippet: "Item 1",
              scores: { totalScore: 14.2 },
              themeBridge: {
                whyItMatters: "Isso importa para inovacao porque muda a distribuicao de vantagem.",
                innovationType: "inovação em distribuição e plataforma"
              }
            }
          ]
        }
      },
      {
        niche: "big tech",
        snapshot: {
          sourceLabel: "Google Noticias",
          queries: ["big tech regulacao"],
          siteFilters: ["neofeed.com.br"],
          summary: { trackedItems: 1, controversyCount: 1, averageScore: 11.1 },
          controversies: [
            {
              id: "c2",
              label: "Regulacao / Plataformas",
              avgScore: 15.8,
              heat: "critico",
              itemCount: 2,
              summary: "Conflito mais quente",
              leadLink: "https://example.com/2",
              themeBridge: {
                whyItMatters: "Isso importa para inovacao porque a regra redefine o jogo."
              }
            }
          ],
          trackedItems: [
            {
              title: "Regulacao aperta plataformas",
              heat: "critico",
              source: "NeoFeed",
              link: "https://example.com/2",
              snippet: "Item 2",
              scores: { totalScore: 15.8 },
              themeBridge: {
                whyItMatters: "Isso importa para inovacao porque crescer agora depende da regra.",
                innovationType: "inovação condicionada por regra"
              }
            }
          ]
        }
      }
    ]
  });

  assert.equal(snapshot.hotspots[0].niche, "big tech");
  assert.equal(snapshot.liveFeed[0].niche, "big tech");
  assert.deepEqual(snapshot.siteFilters.sort(), ["neofeed.com.br", "valor.globo.com"]);
  assert.equal(snapshot.niches.length, 2);
  assert.match(snapshot.liveFeed[0].themeBridge.whyItMatters, /inovacao/i);
});
