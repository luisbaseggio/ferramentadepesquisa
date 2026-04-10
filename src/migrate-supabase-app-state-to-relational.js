import { randomBytes } from "node:crypto";

import { createSupabaseStateStore } from "./supabase-state-store.js";
import { createSupabaseServiceClient } from "./supabase-relational.js";

const PROFILES_TABLE = "profiles";
const WORKSPACES_TABLE = "workspaces";
const MEMBERSHIPS_TABLE = "workspace_memberships";
const SESSIONS_TABLE = "workspace_sessions";
const REVIEW_QUEUE_TABLE = "review_queue_items";
const APPROVED_CHANNEL_TABLE = "approved_channel_items";

function buildInitialLegacyState() {
  return {
    updatedAt: null,
    users: [],
    workspaces: [],
    memberships: [],
    sessions: []
  };
}

function buildEmptyCollection() {
  return {
    updatedAt: null,
    items: []
  };
}

function normalizeQueueItem(item) {
  return {
    ...item,
    reviewDecision: item.reviewDecision || "pending",
    reviewNotes: item.reviewNotes || ""
  };
}

async function listAllAuthUsers(adminClient) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000
    });

    if (error) {
      throw new Error(error.message || "Nao foi possivel listar usuarios do Supabase Auth.");
    }

    const chunk = data?.users || [];
    users.push(...chunk);

    if (chunk.length < 1000) {
      break;
    }

    page += 1;
  }

  return users;
}

async function main() {
  const store = createSupabaseStateStore();
  const client = createSupabaseServiceClient();

  if (!store.isConfigured() || !client) {
    throw new Error("Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  const [authState, reviewQueue, approvedChannel, authUsers] = await Promise.all([
    store.read("auth_state", buildInitialLegacyState()),
    store.read("review_queue", buildEmptyCollection()),
    store.read("approved_channel", buildEmptyCollection()),
    listAllAuthUsers(client)
  ]);

  const authUserByEmail = new Map(
    authUsers.map((user) => [String(user.email || "").trim().toLowerCase(), user])
  );
  const supabaseUserIdByLegacyId = new Map();
  const warnings = [];

  for (const legacyUser of authState.users || []) {
    const email = String(legacyUser.email || "").trim().toLowerCase();
    const authUser = authUserByEmail.get(email);

    if (!authUser) {
      warnings.push(`Usuario sem conta no Supabase Auth: ${email}`);
      continue;
    }

    supabaseUserIdByLegacyId.set(legacyUser.id, authUser.id);

    const { error } = await client
      .from(PROFILES_TABLE)
      .upsert({
        id: authUser.id,
        name: legacyUser.name || authUser.user_metadata?.name || email.split("@")[0] || "Usuário",
        email,
        created_at: legacyUser.createdAt || new Date().toISOString(),
        last_login_at: legacyUser.lastLoginAt || null
      }, { onConflict: "id" });

    if (error) {
      throw new Error(`Falha ao migrar profiles: ${error.message}`);
    }
  }

  for (const workspace of authState.workspaces || []) {
    const { error } = await client
      .from(WORKSPACES_TABLE)
      .upsert({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        owner_user_id: supabaseUserIdByLegacyId.get(workspace.ownerUserId) || null,
        created_at: workspace.createdAt || new Date().toISOString()
      }, { onConflict: "id" });

    if (error) {
      throw new Error(`Falha ao migrar workspaces: ${error.message}`);
    }
  }

  for (const membership of authState.memberships || []) {
    const supabaseUserId = supabaseUserIdByLegacyId.get(membership.userId);

    if (!supabaseUserId) {
      warnings.push(`Membership ignorada sem usuario migrado: ${membership.id}`);
      continue;
    }

    const { error } = await client
      .from(MEMBERSHIPS_TABLE)
      .upsert({
        id: membership.id,
        user_id: supabaseUserId,
        workspace_id: membership.workspaceId,
        role: membership.role || "member",
        created_at: membership.createdAt || new Date().toISOString()
      }, { onConflict: "id" });

    if (error) {
      throw new Error(`Falha ao migrar memberships: ${error.message}`);
    }
  }

  for (const session of authState.sessions || []) {
    const supabaseUserId = supabaseUserIdByLegacyId.get(session.userId) || session.supabaseUserId || null;

    if (!supabaseUserId) {
      warnings.push(`Sessao ignorada sem usuario migrado: ${session.id}`);
      continue;
    }

    const { error } = await client
      .from(SESSIONS_TABLE)
      .upsert({
        id: session.id,
        token_hash: session.tokenHash,
        user_id: supabaseUserId,
        workspace_id: session.workspaceId,
        created_at: session.createdAt || new Date().toISOString(),
        last_seen_at: session.lastSeenAt || session.createdAt || new Date().toISOString(),
        expires_at: session.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, { onConflict: "id" });

    if (error) {
      throw new Error(`Falha ao migrar sessions: ${error.message}`);
    }
  }

  const defaultWorkspaceId = authState.workspaces?.[0]?.id || null;
  if (!defaultWorkspaceId) {
    warnings.push("Nenhum workspace encontrado para migrar review queue e approved channel.");
  }

  if (defaultWorkspaceId) {
    for (const item of reviewQueue.items || []) {
      const normalizedItem = normalizeQueueItem(item);
      const { error } = await client
        .from(REVIEW_QUEUE_TABLE)
        .upsert({
          id: normalizedItem.id,
          workspace_id: defaultWorkspaceId,
          source_link: normalizedItem.sourceLink || null,
          format: normalizedItem.format || null,
          review_decision: normalizedItem.reviewDecision,
          review_notes: normalizedItem.reviewNotes || "",
          last_batch_at: normalizedItem.lastBatchAt || null,
          updated_at: normalizedItem.updatedAt || reviewQueue.updatedAt || new Date().toISOString(),
          payload: normalizedItem
        }, { onConflict: "id" });

      if (error) {
        throw new Error(`Falha ao migrar review queue: ${error.message}`);
      }
    }

    for (const item of approvedChannel.items || []) {
      const { error } = await client
        .from(APPROVED_CHANNEL_TABLE)
        .upsert({
          id: item.id,
          workspace_id: defaultWorkspaceId,
          output_file_name: item.outputFileName || `approved-${randomBytes(4).toString("hex")}.md`,
          updated_at: item.updatedAt || approvedChannel.updatedAt || new Date().toISOString(),
          payload: item
        }, { onConflict: "id" });

      if (error) {
        throw new Error(`Falha ao migrar approved channel: ${error.message}`);
      }
    }
  }

  console.log(JSON.stringify({
    ok: true,
    migrated: {
      profiles: supabaseUserIdByLegacyId.size,
      workspaces: authState.workspaces?.length || 0,
      memberships: authState.memberships?.length || 0,
      sessions: authState.sessions?.length || 0,
      reviewQueueItems: reviewQueue.items?.length || 0,
      approvedChannelItems: approvedChannel.items?.length || 0
    },
    warnings
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
