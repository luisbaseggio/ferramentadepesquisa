import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApprovedChannelRepository } from "../approved-channel.js";
import { buildContentBatch, buildContentDraftFromResearchItem } from "../content-agent.js";
import { createGoogleSheetsReviewSync } from "../google-sheets-sync.js";
import { GOOGLE_SHEETS_CONFIG } from "../integrations-config.js";
import { buildLiveMonitorSnapshot, LIVE_MONITOR_PRESETS } from "../live-monitor.js";
import { createOpenAIContentGenerator } from "../openai-content-generator.js";
import { createApprovedPromptRewriter } from "../openai-approved-rewriter.js";
import { createRealtimeRadarService } from "../realtime-radar.js";
import { createReviewQueueRepository } from "../review-queue.js";
import { APPROVED_FILES_DIR, IS_SERVERLESS_RUNTIME, resolveDataPath, resolveOutputPath } from "../runtime-paths.js";
import { SUPABASE_CONFIG, isSupabaseConfigured } from "../supabase-config.js";
import { createSupabaseApprovedChannelRepository } from "../supabase-approved-channel-repository.js";
import { createSupabaseReviewQueueRepository } from "../supabase-review-queue-repository.js";
import { createSupabaseServiceClient } from "../supabase-relational.js";
import { createSupabaseStateStore } from "../supabase-state-store.js";
import { createSupabaseWorkspaceAuthService } from "../supabase-workspace-auth.js";
import { createWorkspaceAuthService } from "../workspace-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);
const SESSION_COOKIE_NAME = "studio_session";
const PROTECTED_PAGE_PATHS = new Set([
  "/live",
  "/live.html",
  "/radar",
  "/radar.html",
  "/approved",
  "/approved.html"
]);
const PUBLIC_API_PATHS = new Set([
  "/api/auth/session",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/logout"
]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const supabaseStateStore = createSupabaseStateStore();
const supabaseServiceClient = createSupabaseServiceClient();
const useSupabaseState = isSupabaseConfigured(SUPABASE_CONFIG);

const radarService = createRealtimeRadarService();
const legacyReviewQueue = createReviewQueueRepository({
  outputFile: resolveOutputPath("review-queue.json"),
  store: useSupabaseState ? supabaseStateStore : null
});
const legacyApprovedChannel = createApprovedChannelRepository({
  outputFile: resolveOutputPath("approved-channel.json"),
  markdownDir: resolveOutputPath("approved-posts"),
  store: useSupabaseState ? supabaseStateStore : null
});
const googleSheetsSync = createGoogleSheetsReviewSync(GOOGLE_SHEETS_CONFIG);
const legacyAuthService = createWorkspaceAuthService({
  stateFile: resolveDataPath("auth-state.json"),
  store: useSupabaseState ? supabaseStateStore : null
});
const relationalReviewQueue = useSupabaseState && supabaseServiceClient
  ? createSupabaseReviewQueueRepository({
      client: supabaseServiceClient
    })
  : null;
const relationalApprovedChannel = useSupabaseState && supabaseServiceClient
  ? createSupabaseApprovedChannelRepository({
      client: supabaseServiceClient
    })
  : null;
const relationalAuthService = (useSupabaseState && SUPABASE_CONFIG.anonKey)
  ? createSupabaseWorkspaceAuthService({
      url: SUPABASE_CONFIG.url,
      anonKey: SUPABASE_CONFIG.anonKey,
      serviceRoleKey: SUPABASE_CONFIG.serviceRoleKey,
      store: supabaseStateStore
    })
  : null;
const approvedPromptRewriter = createApprovedPromptRewriter();
const openAIContentGenerator = createOpenAIContentGenerator();
const syncStatus = {
  configured: googleSheetsSync.isConfigured(),
  spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
  sheetName: GOOGLE_SHEETS_CONFIG.sheetName,
  spreadsheetUrl: GOOGLE_SHEETS_CONFIG.spreadsheetUrl,
  lastSuccessAt: null,
  lastImportAt: null,
  lastError: null
};

function isRelationalBootstrapError(error) {
  return String(error?.message || "").includes("tabelas relacionais do Supabase");
}

async function runWithFallback(primaryTask, fallbackTask) {
  try {
    return await primaryTask();
  } catch (error) {
    if (isRelationalBootstrapError(error)) {
      return fallbackTask();
    }

    throw error;
  }
}

const reviewQueue = {
  list(workspaceId) {
    if (!relationalReviewQueue || !workspaceId) {
      return legacyReviewQueue.list();
    }

    return runWithFallback(
      () => relationalReviewQueue.list(workspaceId),
      () => legacyReviewQueue.list()
    );
  },
  clear(workspaceId) {
    if (!relationalReviewQueue || !workspaceId) {
      return legacyReviewQueue.clear();
    }

    return runWithFallback(
      () => relationalReviewQueue.clear(workspaceId),
      () => legacyReviewQueue.clear()
    );
  },
  upsertBatch(batch, workspaceId) {
    if (!relationalReviewQueue || !workspaceId) {
      return legacyReviewQueue.upsertBatch(batch);
    }

    return runWithFallback(
      () => relationalReviewQueue.upsertBatch(batch, workspaceId),
      () => legacyReviewQueue.upsertBatch(batch)
    );
  },
  decide(id, decision, notes, workspaceId) {
    if (!relationalReviewQueue || !workspaceId) {
      return legacyReviewQueue.decide(id, decision, notes);
    }

    return runWithFallback(
      () => relationalReviewQueue.decide(id, decision, notes, workspaceId),
      () => legacyReviewQueue.decide(id, decision, notes)
    );
  },
  mergeExternalReviews(reviews, workspaceId) {
    if (!relationalReviewQueue || !workspaceId) {
      return legacyReviewQueue.mergeExternalReviews(reviews);
    }

    return runWithFallback(
      () => relationalReviewQueue.mergeExternalReviews(reviews, workspaceId),
      () => legacyReviewQueue.mergeExternalReviews(reviews)
    );
  }
};

const approvedChannel = {
  list(workspaceId) {
    if (!relationalApprovedChannel || !workspaceId) {
      return legacyApprovedChannel.list();
    }

    return runWithFallback(
      () => relationalApprovedChannel.list(workspaceId),
      () => legacyApprovedChannel.list()
    );
  },
  clear(workspaceId) {
    if (!relationalApprovedChannel || !workspaceId) {
      return legacyApprovedChannel.clear();
    }

    return runWithFallback(
      () => relationalApprovedChannel.clear(workspaceId),
      () => legacyApprovedChannel.clear()
    );
  },
  syncFromReviewQueue(queue, workspaceId) {
    if (!relationalApprovedChannel || !workspaceId) {
      return legacyApprovedChannel.syncFromReviewQueue(queue);
    }

    return runWithFallback(
      () => relationalApprovedChannel.syncFromReviewQueue(queue, workspaceId),
      () => legacyApprovedChannel.syncFromReviewQueue(queue)
    );
  },
  updatePacket(id, updates, workspaceId) {
    if (!relationalApprovedChannel || !workspaceId) {
      return legacyApprovedChannel.updatePacket(id, updates);
    }

    return runWithFallback(
      () => relationalApprovedChannel.updatePacket(id, updates, workspaceId),
      () => legacyApprovedChannel.updatePacket(id, updates)
    );
  }
};

const authService = relationalAuthService
  ? {
      getSession(sessionToken) {
        return runWithFallback(
          () => relationalAuthService.getSession(sessionToken),
          () => legacyAuthService.getSession(sessionToken)
        );
      },
      signup(body) {
        return runWithFallback(
          () => relationalAuthService.signup(body),
          () => legacyAuthService.signup(body)
        );
      },
      login(body) {
        return runWithFallback(
          () => relationalAuthService.login(body),
          () => legacyAuthService.login(body)
        );
      },
      logout(sessionToken) {
        return runWithFallback(
          () => relationalAuthService.logout(sessionToken),
          () => legacyAuthService.logout(sessionToken)
        );
      },
      listWorkspaces(sessionToken) {
        return runWithFallback(
          () => relationalAuthService.listWorkspaces(sessionToken),
          () => legacyAuthService.listWorkspaces(sessionToken)
        );
      },
      createWorkspace(sessionToken, body) {
        return runWithFallback(
          () => relationalAuthService.createWorkspace(sessionToken, body),
          () => legacyAuthService.createWorkspace(sessionToken, body)
        );
      },
      selectWorkspace(sessionToken, workspaceId) {
        return runWithFallback(
          () => relationalAuthService.selectWorkspace(sessionToken, workspaceId),
          () => legacyAuthService.selectWorkspace(sessionToken, workspaceId)
        );
      }
    }
  : legacyAuthService;

async function syncReviewQueueToSheets(queue) {
  try {
    const result = await googleSheetsSync.syncQueue(queue);
    syncStatus.lastSuccessAt = new Date().toISOString();
    syncStatus.lastError = null;
    return {
      ok: true,
      ...result
    };
  } catch (error) {
    syncStatus.lastError = error.message || "Falha ao sincronizar com Google Sheets.";
    return {
      ok: false,
      syncedItems: 0,
      spreadsheetId: GOOGLE_SHEETS_CONFIG.spreadsheetId,
      sheetName: GOOGLE_SHEETS_CONFIG.sheetName,
      error: syncStatus.lastError
    };
  }
}

async function importReviewQueueFromSheets(workspaceId = null) {
  try {
    const sheetReviews = await googleSheetsSync.fetchReviews();
    const queue = await reviewQueue.mergeExternalReviews(sheetReviews.items, workspaceId);
    const approved = await approvedChannel.syncFromReviewQueue(queue, workspaceId);
    syncStatus.lastImportAt = new Date().toISOString();
    syncStatus.lastError = null;
    return {
      ok: true,
      importedItems: sheetReviews.items.length,
      queue,
      approved,
      sheetReviews
    };
  } catch (error) {
    syncStatus.lastError = error.message || "Falha ao importar revisoes do Google Sheets.";
    const queue = await reviewQueue.list(workspaceId);
    const approved = await approvedChannel.list(workspaceId);
    return {
      ok: false,
      importedItems: 0,
      queue,
      approved,
      sheetReviews: { items: [] },
      error: syncStatus.lastError
    };
  }
}

async function buildStudioOverview(workspaceId = null) {
  const [queue, approved] = await Promise.all([
    reviewQueue.list(workspaceId),
    approvedChannel.list(workspaceId)
  ]);

  return {
    reviewQueue: queue,
    approvedChannel: approved,
    sheetsStatus: syncStatus,
    storage: {
      mode: useSupabaseState ? "supabase-relational" : "local",
      authMode: (useSupabaseState && SUPABASE_CONFIG.anonKey) ? "supabase-auth" : "local-auth"
    }
  };
}

async function resetOperation(mode = "local", workspaceId = null) {
  radarService.clear();
  const queue = await reviewQueue.clear(workspaceId);
  const approved = await approvedChannel.clear(workspaceId);

  syncStatus.lastSuccessAt = null;
  syncStatus.lastImportAt = null;
  syncStatus.lastError = null;

  let sheets = null;

  if (mode === "all") {
    sheets = await googleSheetsSync.clearSheet();
  }

  return {
    ok: true,
    mode,
    message: mode === "all"
      ? "Cache local e Google Sheets limpos."
      : "Cache local limpo.",
    reviewQueue: queue,
    approvedChannel: approved,
    sheets,
    syncStatus
  };
}

function normalizeLiveDraftInput(item, targetType = "live-feed") {
  if (targetType === "hotspot") {
    return {
      title: item.leadTitle || item.label || "Hotspot em observacao",
      link: item.leadLink,
      source: item.sources?.[0] || item.sourceLabel || "Google Noticias",
      query: item.label || "hotspot",
      snippet: item.summary || "",
      niche: item.niche,
      scores: {
        totalScore: item.avgScore || 0,
        signals: item.signals || []
      }
    };
  }

  return {
    title: item.title,
    link: item.link,
    source: item.source,
    query: item.query,
    snippet: item.snippet,
    niche: item.niche,
    scores: item.scores
  };
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();

      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("JSON invalido na requisicao."));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendRedirect(response, location) {
  response.writeHead(302, {
    location,
    "cache-control": "no-store"
  });
  response.end();
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");

        if (separatorIndex === -1) {
          return [part, ""];
        }

        return [
          decodeURIComponent(part.slice(0, separatorIndex)),
          decodeURIComponent(part.slice(separatorIndex + 1))
        ];
      })
  );
}

function getSessionTokenFromRequest(request) {
  return parseCookies(request)[SESSION_COOKIE_NAME] || "";
}

function isSecureRequest(request) {
  return (
    request.headers["x-forwarded-proto"] === "https" ||
    request.headers["x-forwarded-protocol"] === "https" ||
    Boolean(request.socket?.encrypted)
  );
}

function serializeSessionCookie(value, options = {}) {
  const parts = [`${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`];

  parts.push(`Path=${options.path || "/"}`);
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

function setSessionCookie(request, response, sessionToken) {
  response.setHeader("Set-Cookie", serializeSessionCookie(sessionToken, {
    maxAge: 30 * 24 * 60 * 60,
    secure: isSecureRequest(request)
  }));
}

function clearSessionCookie(request, response) {
  response.setHeader("Set-Cookie", serializeSessionCookie("", {
    maxAge: 0,
    secure: isSecureRequest(request)
  }));
}

function resolveAsset(urlPath) {
  const routeMap = {
    "/": "home.html",
    "/home": "home.html",
    "/home.html": "home.html",
    "/home.js": "home.js",
    "/home.css": "home.css",
    "/live": "live.html",
    "/live.html": "live.html",
    "/live.js": "live.js",
    "/live.css": "live.css",
    "/radar": "radar.html",
    "/radar.html": "radar.html",
    "/radar.js": "radar.js",
    "/radar.css": "radar.css",
    "/approved": "approved.html",
    "/approved.html": "approved.html",
    "/approved.js": "approved.js",
    "/approved.css": "approved.css"
  };
  const assetName = routeMap[urlPath];

  if (!assetName) {
    return null;
  }

  return path.join(WEB_DIR, assetName);
}

function buildRadarProfile(searchParams) {
  return {
    niche: searchParams.get("niche") || "inovacao",
    secondaryTheme: searchParams.get("secondaryTheme") || "",
    source: searchParams.get("source") || "google-news",
    locale: searchParams.get("locale") || "pt-BR",
    region: searchParams.get("region") || "BR",
    recencyHours: Number(searchParams.get("recencyHours") || "24"),
    limit: Number(searchParams.get("limit") || "30"),
    refreshIntervalMs: Number(searchParams.get("refreshIntervalMs") || String(3 * 60 * 1000)),
    siteFilter: searchParams.get("siteFilter") || searchParams.get("siteFilters") || ""
  };
}

function handleSse(request, response, url) {
  if (IS_SERVERLESS_RUNTIME) {
    sendJson(response, 501, {
      error: "O stream ao vivo nao esta disponivel no deploy serverless. Use o polling automatico da interface."
    });
    return;
  }

  const profile = buildRadarProfile(url.searchParams);

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  response.write(": connected\n\n");

  const unsubscribe = radarService.subscribe(profile, (payload) => {
    response.write(`event: ${payload.type}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  request.on("close", () => {
    unsubscribe();
    response.end();
  });
}

export async function handleRequest(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const sessionToken = getSessionTokenFromRequest(request);

  try {
    const sessionContext = await authService.getSession(sessionToken);
    const activeWorkspaceId = sessionContext?.activeWorkspace?.id || null;

    if (request.method === "GET" && PROTECTED_PAGE_PATHS.has(url.pathname) && !sessionContext) {
      sendRedirect(response, "/?auth=required");
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/approved-files/") && !sessionContext) {
      sendRedirect(response, "/?auth=required");
      return;
    }

    if (url.pathname.startsWith("/api/") && !PUBLIC_API_PATHS.has(url.pathname) && !sessionContext) {
      sendJson(response, 401, {
        error: "Faça login para acessar esta area."
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      sendJson(response, 200, {
        authenticated: Boolean(sessionContext),
        session: sessionContext
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await parseJsonBody(request);
      const result = await authService.signup(body);
      setSessionCookie(request, response, result.sessionToken);
      sendJson(response, 200, {
        ok: true,
        message: "Conta criada com sucesso.",
        authenticated: true,
        session: result.session
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseJsonBody(request);
      const result = await authService.login(body);
      setSessionCookie(request, response, result.sessionToken);
      sendJson(response, 200, {
        ok: true,
        message: "Login realizado com sucesso.",
        authenticated: true,
        session: result.session
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      await authService.logout(sessionToken);
      clearSessionCookie(request, response);
      sendJson(response, 200, {
        ok: true,
        authenticated: false
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/workspaces") {
      sendJson(response, 200, {
        items: sessionContext.workspaces,
        activeWorkspace: sessionContext.activeWorkspace
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/workspaces") {
      const body = await parseJsonBody(request);
      const result = await authService.createWorkspace(sessionToken, body);
      sendJson(response, 200, {
        ok: true,
        message: "Workspace criado com sucesso.",
        workspace: result.workspace,
        session: result.session
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/workspaces/select") {
      const body = await parseJsonBody(request);
      const nextSession = await authService.selectWorkspace(sessionToken, String(body.workspaceId || ""));
      sendJson(response, 200, {
        ok: true,
        message: "Workspace ativo atualizado.",
        session: nextSession
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/radar/snapshot") {
      const payload = await radarService.getSnapshot(
        buildRadarProfile(url.searchParams),
        { force: url.searchParams.get("force") === "1" }
      );
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/radar/refresh") {
      const body = await parseJsonBody(request);
      const searchParams = new URLSearchParams({
        ...Object.fromEntries(url.searchParams.entries()),
        ...Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== null))
      });
      const payload = await radarService.getSnapshot(buildRadarProfile(searchParams), { force: true });
      sendJson(response, 200, {
        ok: true,
        message: "Nova coleta concluida.",
        ...payload
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/radar/events") {
      handleSse(request, response, url);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/content-agent/run") {
      const body = await parseJsonBody(request);
      const searchParams = new URLSearchParams(
        Object.fromEntries(
          Object.entries(body).filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)])
        )
      );
      const profile = buildRadarProfile(searchParams);
      const payload = await radarService.getSnapshot(profile, { force: true });
      const aiBatch = openAIContentGenerator.isConfigured()
        ? await openAIContentGenerator.generateBatch(payload.snapshot, {
            maxDrafts: Number(body.maxDrafts) || 3
          })
        : null;
      const batch = buildContentBatch(aiBatch ? {
        ...payload.snapshot,
        briefs: aiBatch.briefs
      } : payload.snapshot, {
        maxDrafts: Number(body.maxDrafts) || 3
      });
      const fallbackDrafts = batch.drafts.length === 0
        ? (payload.snapshot.trackedItems ?? [])
            .slice(0, Math.max(1, Number(body.maxDrafts) || 3))
            .map((item) => buildContentDraftFromResearchItem({
              title: item.title,
              source: item.sourceName || item.source,
              link: item.link,
              query: item.query,
              snippet: item.snippet,
              scores: item.scores,
              secondaryTheme: profile.secondaryTheme
            }, profile.niche, {
              createdAt: new Date().toISOString(),
              format: "carrossel-instagram"
            }))
        : [];
      const effectiveBatch = fallbackDrafts.length > 0
        ? {
            ...batch,
            drafts: fallbackDrafts,
            filteredOut: batch.filteredOut,
            fallbackUsed: true
          }
        : {
            ...batch,
            fallbackUsed: false
          };
      const queue = await reviewQueue.upsertBatch(effectiveBatch, activeWorkspaceId);
      const sheets = await syncReviewQueueToSheets(queue);
      const approved = await approvedChannel.syncFromReviewQueue(queue, activeWorkspaceId);

      sendJson(response, 200, {
        ok: true,
        message: sheets.ok
          ? `${effectiveBatch.drafts.length} rascunhos enviados para revisao.`
          : `${effectiveBatch.drafts.length} rascunhos enviados para revisao. O Google Sheets nao sincronizou nesta rodada.`,
        snapshot: payload.snapshot,
        status: payload.status,
        batch: effectiveBatch,
        generation: {
          mode: openAIContentGenerator.isConfigured() ? "openai+fallback" : "fallback",
          failed: aiBatch?.failed || []
        },
        reviewQueue: queue,
        sheets,
        approvedChannel: approved,
        syncStatus
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/content-agent/from-live") {
      const body = await parseJsonBody(request);
      const niche = String(body.niche || body.item?.niche || "inovacao").trim() || "inovacao";
      const secondaryTheme = String(body.secondaryTheme || body.item?.secondaryTheme || "").trim();
      const item = normalizeLiveDraftInput(body.item || {}, body.targetType);
      const format = body.format;

      if (!item?.title || !item?.link) {
        sendJson(response, 400, {
          error: "Noticia invalida para criar roteiro."
        });
        return;
      }

      const createdAt = new Date().toISOString();
      const draft = buildContentDraftFromResearchItem({
        ...item,
        secondaryTheme
      }, niche, { createdAt, format });
      const queue = await reviewQueue.upsertBatch({
        generatedAt: createdAt,
        drafts: [draft]
      }, activeWorkspaceId);
      const sheets = await syncReviewQueueToSheets(queue);
      const approved = await approvedChannel.syncFromReviewQueue(queue, activeWorkspaceId);

      sendJson(response, 200, {
        ok: true,
        message: sheets.ok
          ? "Noticia enviada para a fila de roteiros."
          : "Noticia enviada para a fila de roteiros. O Google Sheets nao sincronizou nesta rodada.",
        draft,
        reviewQueue: queue,
        sheets,
        approvedChannel: approved,
        syncStatus
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/review-queue") {
      sendJson(response, 200, await reviewQueue.list(activeWorkspaceId));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/studio/overview") {
      sendJson(response, 200, await buildStudioOverview(activeWorkspaceId));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/google-sheets/status") {
      sendJson(response, 200, {
        ...syncStatus,
        storageMode: useSupabaseState ? "supabase-relational" : "local",
        authMode: (useSupabaseState && SUPABASE_CONFIG.anonKey) ? "supabase-auth" : "local-auth"
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/system/reset") {
      const body = await parseJsonBody(request);
      const mode = body.mode === "all" ? "all" : "local";
      const result = await resetOperation(mode, activeWorkspaceId);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/live-monitor") {
      const rawRecencyHours = String(url.searchParams.get("recencyHours") || "").trim();
      const recencyHours = rawRecencyHours ? Number(rawRecencyHours) : null;
      const niche = String(url.searchParams.get("niche") || "").trim();
      const force = url.searchParams.get("force") === "1";
      const nichesToLoad = niche ? [niche] : LIVE_MONITOR_PRESETS;

      const entries = await Promise.all(
        nichesToLoad.map(async (entryNiche) => {
          const payload = await radarService.getSnapshot({
            niche: entryNiche,
            source: "google-news",
            recencyHours
          }, { force });

          return {
            niche: entryNiche,
            snapshot: payload.snapshot
          };
        })
      );

      sendJson(response, 200, buildLiveMonitorSnapshot({ entries }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/approved-channel") {
      sendJson(response, 200, await approvedChannel.list(activeWorkspaceId));
      return;
    }

    const approvedPromptMatch = url.pathname.match(/^\/api\/approved-channel\/([^/]+)\/apply-prompt$/);

    if (request.method === "POST" && approvedPromptMatch) {
      const body = await parseJsonBody(request);
      const packetId = decodeURIComponent(approvedPromptMatch[1]);
      const approved = await approvedChannel.list(activeWorkspaceId);
      const packet = approved.items.find((item) => item.id === packetId);

      if (!packet) {
        sendJson(response, 404, {
          error: "Aprovado nao encontrado."
        });
        return;
      }

      const result = await approvedPromptRewriter.rewriteApprovedPacket(packet, {
        aiPrompt: body.aiPrompt,
        currentRender: body.currentRender,
        newsContext: body.newsContext
      });

      const updatedApproved = await approvedChannel.updatePacket(packetId, {
        aiPrompt: String(body.aiPrompt ?? ""),
        manualFinalRender: result.rewrittenText,
        newsContext: String(body.newsContext ?? "")
      }, activeWorkspaceId);

      sendJson(response, 200, {
        ok: true,
        message: "Render final ajustado com GPT.",
        approvedChannel: updatedApproved,
        rewrite: {
          model: result.model
        }
      });
      return;
    }

    const approvedPacketMatch = url.pathname.match(/^\/api\/approved-channel\/([^/]+)$/);

    if (request.method === "POST" && approvedPacketMatch) {
      const body = await parseJsonBody(request);
      const packetId = decodeURIComponent(approvedPacketMatch[1]);
      const approved = await approvedChannel.updatePacket(packetId, {
        selectedHeadlineNumber: body.selectedHeadlineNumber,
        selectedTemplate: body.selectedTemplate,
        manualFinalRender: body.manualFinalRender,
        aiPrompt: body.aiPrompt,
        newsContext: body.newsContext,
        evaluationStatus: body.evaluationStatus,
        evaluationScore: body.evaluationScore,
        evaluationNotes: body.evaluationNotes
      }, activeWorkspaceId);
      sendJson(response, 200, {
        ok: true,
        message: "Pacote aprovado atualizado.",
        approvedChannel: approved
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/google-sheets/sync") {
      const queue = await reviewQueue.list(activeWorkspaceId);
      const sheets = await syncReviewQueueToSheets(queue);
      sendJson(response, 200, {
        ok: sheets.ok,
        message: sheets.ok
          ? "Fila sincronizada com o Google Sheets."
          : "A fila local foi mantida, mas o Google Sheets nao sincronizou.",
        sheets,
        reviewQueue: queue,
        syncStatus
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/google-sheets/import-review") {
      const { queue, importedItems, ok, error } = await importReviewQueueFromSheets(activeWorkspaceId);
      sendJson(response, 200, {
        ok,
        message: ok
          ? `Revisoes importadas do Google Sheets: ${importedItems}.`
          : `Nao foi possivel importar revisoes do Google Sheets agora. ${error}`,
        reviewQueue: queue,
        syncStatus
      });
      return;
    }

    const reviewDecisionMatch = url.pathname.match(/^\/api\/review-queue\/([^/]+)\/decision$/);

    if (request.method === "POST" && reviewDecisionMatch) {
      const body = await parseJsonBody(request);
      const itemId = decodeURIComponent(reviewDecisionMatch[1]);
      const decision = ["approved", "rejected", "pending"].includes(body.decision) ? body.decision : "pending";
      const queue = await reviewQueue.decide(itemId, decision, String(body.notes ?? ""), activeWorkspaceId);
      const sheets = await syncReviewQueueToSheets(queue);
      const approved = await approvedChannel.syncFromReviewQueue(queue, activeWorkspaceId);
      sendJson(response, 200, {
        ok: true,
        message: sheets.ok
          ? "Fila de revisao atualizada."
          : "Fila de revisao atualizada localmente. O Google Sheets nao sincronizou nesta rodada.",
        reviewQueue: queue,
        sheets,
        approvedChannel: approved,
        syncStatus
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/approved-files/")) {
      const fileName = path.basename(url.pathname);
      const filePath = path.join(APPROVED_FILES_DIR, fileName);
      let body;

      try {
        body = await readFile(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }

        const approved = await approvedChannel.list(activeWorkspaceId);
        const item = approved.items.find((entry) => entry.outputFileName === fileName);

        if (!item) {
          throw error;
        }

        body = Buffer.from(item.markdown || "", "utf8");
      }

      response.writeHead(200, {
        "content-type": "text/markdown; charset=utf-8"
      });
      response.end(body);
      return;
    }

    const assetPath = resolveAsset(url.pathname);

    if (!assetPath) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const ext = path.extname(assetPath);
    const body = await readFile(assetPath);

    response.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "text/plain; charset=utf-8"
    });
    response.end(body);
  } catch (error) {
    syncStatus.lastError = error.message || "Erro interno no servidor";
    sendJson(response, error.statusCode || 500, {
      error: error.message || "Erro interno no servidor"
    });
  }
}

export default handleRequest;

const isExecutedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  const server = createServer(handleRequest);

  server.listen(PORT, () => {
    console.log(`Home local em http://localhost:${PORT}`);
    console.log(`Monitor ao vivo em http://localhost:${PORT}/live`);
    console.log(`Radar em tempo real em http://localhost:${PORT}/radar`);
    console.log(`Canal de aprovados em http://localhost:${PORT}/approved`);
  });
}
