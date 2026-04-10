import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { createSupabasePublicClient, createSupabaseServiceClient, isMissingTableError } from "./supabase-relational.js";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_DAYS = 30;
const PROFILES_TABLE = "profiles";
const WORKSPACES_TABLE = "workspaces";
const MEMBERSHIPS_TABLE = "workspace_memberships";
const SESSIONS_TABLE = "workspace_sessions";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}

function hashSessionToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

async function verifyLegacyPassword(password, salt, expectedHash) {
  const derived = await scrypt(String(password), salt, 64);
  const actualBuffer = Buffer.from(derived.toString("hex"), "hex");
  const expectedBuffer = Buffer.from(String(expectedHash), "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null
  };
}

function sanitizeWorkspace(workspace, role = "member") {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    createdAt: workspace.createdAt
  };
}

function buildInitialLegacyState() {
  return {
    updatedAt: null,
    users: [],
    workspaces: [],
    memberships: [],
    sessions: []
  };
}

export function createSupabaseWorkspaceAuthService({
  url,
  anonKey,
  serviceRoleKey,
  store = null,
  stateKey = "auth_state",
  now = () => new Date().toISOString()
}) {
  const publicClient = createSupabasePublicClient({ url, anonKey });
  const adminClient = createSupabaseServiceClient({ url, serviceRoleKey });

  if (!publicClient || !adminClient) {
    throw new Error("Supabase Auth precisa de url, anon key e service role key.");
  }

  async function readLegacyState() {
    if (!store) {
      return buildInitialLegacyState();
    }

    try {
      const state = await store.read(stateKey, buildInitialLegacyState());
      return {
        updatedAt: state.updatedAt ?? null,
        users: Array.isArray(state.users) ? state.users : [],
        workspaces: Array.isArray(state.workspaces) ? state.workspaces : [],
        memberships: Array.isArray(state.memberships) ? state.memberships : [],
        sessions: Array.isArray(state.sessions) ? state.sessions : []
      };
    } catch {
      return buildInitialLegacyState();
    }
  }

  async function writeLegacyState(state) {
    if (!store) {
      return state;
    }

    try {
      return await store.write(stateKey, {
        ...state,
        updatedAt: now()
      });
    } catch {
      return state;
    }
  }

  async function listAllUsersByEmail() {
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

  async function ensureUniqueWorkspaceSlug(name) {
    const baseSlug = slugify(name);
    const { data, error } = await adminClient
      .from(WORKSPACES_TABLE)
      .select("slug");

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase workspaces read failed: ${error.message}`);
    }

    const existingSlugs = new Set((data || []).map((item) => item.slug));
    let slug = baseSlug;
    let counter = 2;

    while (existingSlugs.has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return slug;
  }

  async function ensureProfile(supabaseUser, fallbackName = "") {
    const normalizedEmail = normalizeEmail(supabaseUser.email);
    const profile = {
      id: supabaseUser.id,
      name: String(supabaseUser.user_metadata?.name || fallbackName || normalizedEmail.split("@")[0] || "Usuário").trim(),
      email: normalizedEmail,
      created_at: now(),
      last_login_at: now()
    };

    const { error } = await adminClient
      .from(PROFILES_TABLE)
      .upsert(profile, { onConflict: "id" });

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase profile upsert failed: ${error.message}`);
    }

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      createdAt: profile.created_at,
      lastLoginAt: profile.last_login_at
    };
  }

  async function loadProfile(userId) {
    const { data, error } = await adminClient
      .from(PROFILES_TABLE)
      .select("id, name, email, created_at, last_login_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase profile read failed: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      email: data.email,
      createdAt: data.created_at,
      lastLoginAt: data.last_login_at
    };
  }

  async function listMembershipsForUser(userId) {
    const { data: memberships, error: membershipError } = await adminClient
      .from(MEMBERSHIPS_TABLE)
      .select("workspace_id, role, created_at")
      .eq("user_id", userId);

    if (membershipError) {
      if (isMissingTableError(membershipError)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase memberships read failed: ${membershipError.message}`);
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    const workspaceIds = memberships.map((membership) => membership.workspace_id);
    const { data: workspaces, error: workspaceError } = await adminClient
      .from(WORKSPACES_TABLE)
      .select("id, name, slug, created_at")
      .in("id", workspaceIds);

    if (workspaceError) {
      throw new Error(`Supabase workspaces read failed: ${workspaceError.message}`);
    }

    const workspaceMap = new Map((workspaces || []).map((workspace) => [workspace.id, workspace]));

    return memberships
      .map((membership) => {
        const workspace = workspaceMap.get(membership.workspace_id);

        if (!workspace) {
          return null;
        }

        return sanitizeWorkspace({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          createdAt: workspace.created_at
        }, membership.role);
      })
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  async function ensureDefaultWorkspace(userId, workspaceName = "") {
    const memberships = await listMembershipsForUser(userId);

    if (memberships.length > 0) {
      return {
        workspace: memberships[0],
        membership: { role: memberships[0].role }
      };
    }

    const trimmedName = String(workspaceName || "Meu Workspace").trim();
    const workspace = {
      id: `ws_${randomUUID()}`,
      name: trimmedName,
      slug: await ensureUniqueWorkspaceSlug(trimmedName),
      owner_user_id: userId,
      created_at: now()
    };
    const membership = {
      id: `mbr_${randomUUID()}`,
      user_id: userId,
      workspace_id: workspace.id,
      role: "owner",
      created_at: now()
    };

    const { error: workspaceError } = await adminClient
      .from(WORKSPACES_TABLE)
      .insert(workspace);

    if (workspaceError) {
      throw new Error(`Supabase workspace create failed: ${workspaceError.message}`);
    }

    const { error: membershipError } = await adminClient
      .from(MEMBERSHIPS_TABLE)
      .insert(membership);

    if (membershipError) {
      throw new Error(`Supabase membership create failed: ${membershipError.message}`);
    }

    return {
      workspace: sanitizeWorkspace({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.created_at
      }, "owner"),
      membership: { role: "owner" }
    };
  }

  async function createSessionRecord(userId, workspaceId) {
    const sessionToken = randomBytes(32).toString("base64url");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const session = {
      id: `sess_${randomUUID()}`,
      token_hash: hashSessionToken(sessionToken),
      user_id: userId,
      workspace_id: workspaceId,
      created_at: createdAt,
      last_seen_at: createdAt,
      expires_at: expiresAt
    };

    const { error } = await adminClient
      .from(SESSIONS_TABLE)
      .insert(session);

    if (error) {
      throw new Error(`Supabase session create failed: ${error.message}`);
    }

    return {
      sessionToken,
      session
    };
  }

  async function buildSessionPayloadFromRecord(sessionRecord) {
    const user = await loadProfile(sessionRecord.user_id);

    if (!user) {
      return null;
    }

    const workspaces = await listMembershipsForUser(user.id);
    const activeWorkspace = workspaces.find((workspace) => workspace.id === sessionRecord.workspace_id) || workspaces[0] || null;

    return {
      user: sanitizeUser(user),
      workspaces,
      activeWorkspace,
      session: {
        id: sessionRecord.id,
        createdAt: sessionRecord.created_at,
        expiresAt: sessionRecord.expires_at,
        lastSeenAt: sessionRecord.last_seen_at
      }
    };
  }

  async function findSessionByToken(sessionToken) {
    if (!sessionToken) {
      return null;
    }

    const tokenHash = hashSessionToken(sessionToken);
    const { data, error } = await adminClient
      .from(SESSIONS_TABLE)
      .select("id, user_id, workspace_id, created_at, last_seen_at, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase session read failed: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    if (new Date(data.expires_at).getTime() <= Date.now()) {
      await adminClient.from(SESSIONS_TABLE).delete().eq("id", data.id);
      return null;
    }

    return data;
  }

  async function upgradeLegacyUserIfPossible(normalizedEmail, password) {
    const legacyState = await readLegacyState();
    const legacyUser = legacyState.users.find((entry) => (
      entry.email === normalizedEmail &&
      entry.passwordHash &&
      entry.passwordSalt
    ));

    if (!legacyUser) {
      return null;
    }

    const passwordMatches = await verifyLegacyPassword(password, legacyUser.passwordSalt, legacyUser.passwordHash);

    if (!passwordMatches) {
      return null;
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        name: legacyUser.name
      }
    });

    if (error && !String(error.message || "").toLowerCase().includes("already been registered")) {
      throw new Error(error.message || "Nao foi possivel migrar este usuario para o Supabase Auth.");
    }

    let supabaseUser = data?.user || null;

    if (!supabaseUser) {
      const users = await listAllUsersByEmail();
      supabaseUser = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail) || null;
    }

    if (!supabaseUser) {
      throw new Error("Nao foi possivel localizar o usuario migrado no Supabase Auth.");
    }

    delete legacyUser.passwordHash;
    delete legacyUser.passwordSalt;
    legacyUser.supabaseUserId = supabaseUser.id;
    legacyUser.lastLoginAt = now();
    await writeLegacyState(legacyState);

    return supabaseUser;
  }

  return {
    async getSession(sessionToken) {
      const session = await findSessionByToken(sessionToken);

      if (!session) {
        return null;
      }

      await adminClient
        .from(SESSIONS_TABLE)
        .update({ last_seen_at: now() })
        .eq("id", session.id);

      return buildSessionPayloadFromRecord({
        ...session,
        last_seen_at: now()
      });
    },

    async signup({ name, email, password, workspaceName }) {
      const trimmedName = String(name ?? "").trim();
      const normalizedEmail = normalizeEmail(email);
      const trimmedWorkspace = String(workspaceName ?? "").trim();

      if (trimmedName.length < 2) {
        throw new Error("Informe um nome com pelo menos 2 caracteres.");
      }

      if (!normalizedEmail.includes("@")) {
        throw new Error("Informe um email valido.");
      }

      if (String(password ?? "").length < 8) {
        throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      }

      if (trimmedWorkspace.length < 2) {
        throw new Error("Informe um nome de workspace com pelo menos 2 caracteres.");
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: String(password),
        email_confirm: true,
        user_metadata: {
          name: trimmedName
        }
      });

      if (error) {
        throw new Error(error.message || "Nao foi possivel criar a conta no Supabase Auth.");
      }

      const user = await ensureProfile(data.user, trimmedName);
      const { workspace, membership } = await ensureDefaultWorkspace(user.id, trimmedWorkspace);
      const { sessionToken } = await createSessionRecord(user.id, workspace.id);

      return {
        sessionToken,
        session: {
          user: sanitizeUser(user),
          workspaces: [sanitizeWorkspace(workspace, membership.role)],
          activeWorkspace: sanitizeWorkspace(workspace, membership.role)
        }
      };
    },

    async login({ email, password }) {
      const normalizedEmail = normalizeEmail(email);
      let signIn = await publicClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: String(password)
      });

      if (signIn.error) {
        const migratedUser = await upgradeLegacyUserIfPossible(normalizedEmail, password);

        if (migratedUser) {
          signIn = await publicClient.auth.signInWithPassword({
            email: normalizedEmail,
            password: String(password)
          });
        }
      }

      if (signIn.error || !signIn.data?.user) {
        throw new Error("Email ou senha invalidos.");
      }

      const user = await ensureProfile(signIn.data.user, signIn.data.user.user_metadata?.name || "");
      const { workspace } = await ensureDefaultWorkspace(user.id, "Meu Workspace");
      const memberships = await listMembershipsForUser(user.id);
      const activeWorkspace = memberships.find((entry) => entry.id === workspace.id) || memberships[0] || null;

      if (!activeWorkspace) {
        throw new Error("Sua conta ainda nao possui workspace.");
      }

      const { sessionToken } = await createSessionRecord(user.id, activeWorkspace.id);

      return {
        sessionToken,
        session: {
          user: sanitizeUser(user),
          workspaces: memberships,
          activeWorkspace
        }
      };
    },

    async logout(sessionToken) {
      if (!sessionToken) {
        return;
      }

      const tokenHash = hashSessionToken(sessionToken);
      const { error } = await adminClient
        .from(SESSIONS_TABLE)
        .delete()
        .eq("token_hash", tokenHash);

      if (error && !isMissingTableError(error)) {
        throw new Error(`Supabase session delete failed: ${error.message}`);
      }
    },

    async listWorkspaces(sessionToken) {
      const session = await this.getSession(sessionToken);
      return session?.workspaces ?? [];
    },

    async createWorkspace(sessionToken, { name }) {
      const trimmedName = String(name ?? "").trim();

      if (trimmedName.length < 2) {
        throw new Error("Informe um nome de workspace com pelo menos 2 caracteres.");
      }

      const session = await findSessionByToken(sessionToken);

      if (!session) {
        throw new Error("Sessao invalida.");
      }

      const workspace = {
        id: `ws_${randomUUID()}`,
        name: trimmedName,
        slug: await ensureUniqueWorkspaceSlug(trimmedName),
        owner_user_id: session.user_id,
        created_at: now()
      };
      const membership = {
        id: `mbr_${randomUUID()}`,
        user_id: session.user_id,
        workspace_id: workspace.id,
        role: "owner",
        created_at: now()
      };

      const { error: workspaceError } = await adminClient
        .from(WORKSPACES_TABLE)
        .insert(workspace);

      if (workspaceError) {
        throw new Error(`Supabase workspace create failed: ${workspaceError.message}`);
      }

      const { error: membershipError } = await adminClient
        .from(MEMBERSHIPS_TABLE)
        .insert(membership);

      if (membershipError) {
        throw new Error(`Supabase membership create failed: ${membershipError.message}`);
      }

      const { error: sessionError } = await adminClient
        .from(SESSIONS_TABLE)
        .update({
          workspace_id: workspace.id,
          last_seen_at: now()
        })
        .eq("id", session.id);

      if (sessionError) {
        throw new Error(`Supabase session update failed: ${sessionError.message}`);
      }

      const payload = await buildSessionPayloadFromRecord({
        ...session,
        workspace_id: workspace.id,
        last_seen_at: now()
      });

      return {
        workspace: sanitizeWorkspace({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          createdAt: workspace.created_at
        }, "owner"),
        session: payload
      };
    },

    async selectWorkspace(sessionToken, workspaceId) {
      const session = await findSessionByToken(sessionToken);

      if (!session) {
        throw new Error("Sessao invalida.");
      }

      const memberships = await listMembershipsForUser(session.user_id);

      if (!memberships.some((workspace) => workspace.id === workspaceId)) {
        throw new Error("Workspace nao encontrado para este usuario.");
      }

      const { error } = await adminClient
        .from(SESSIONS_TABLE)
        .update({
          workspace_id: workspaceId,
          last_seen_at: now()
        })
        .eq("id", session.id);

      if (error) {
        throw new Error(`Supabase session update failed: ${error.message}`);
      }

      return buildSessionPayloadFromRecord({
        ...session,
        workspace_id: workspaceId,
        last_seen_at: now()
      });
    }
  };
}
