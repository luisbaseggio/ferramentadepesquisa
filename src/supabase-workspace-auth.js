import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_DAYS = 30;

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

function ensureWorkspaceSlug(name, workspaces) {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 2;

  while (workspaces.some((workspace) => workspace.slug === slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
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

function buildInitialState() {
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
  store,
  stateKey = "auth_state",
  now = () => new Date().toISOString()
}) {
  if (!url || !anonKey || !serviceRoleKey || !store) {
    throw new Error("Supabase Auth precisa de url, anon key, service role key e store.");
  }

  const publicClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  async function readState() {
    const state = await store.read(stateKey, buildInitialState());
    return {
      updatedAt: state.updatedAt ?? null,
      users: Array.isArray(state.users) ? state.users : [],
      workspaces: Array.isArray(state.workspaces) ? state.workspaces : [],
      memberships: Array.isArray(state.memberships) ? state.memberships : [],
      sessions: Array.isArray(state.sessions) ? state.sessions : []
    };
  }

  async function writeState(state) {
    return store.write(stateKey, {
      ...state,
      updatedAt: now()
    });
  }

  function listMembershipsForUser(state, userId) {
    return state.memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => {
        const workspace = state.workspaces.find((entry) => entry.id === membership.workspaceId);

        if (!workspace) {
          return null;
        }

        return sanitizeWorkspace(workspace, membership.role);
      })
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  async function createSession(state, userId, workspaceId, supabaseUserId) {
    const sessionToken = randomBytes(32).toString("base64url");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const session = {
      id: `sess_${randomUUID()}`,
      tokenHash: hashSessionToken(sessionToken),
      userId,
      workspaceId,
      supabaseUserId: supabaseUserId || null,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt
    };
    state.sessions.push(session);

    return {
      session,
      sessionToken
    };
  }

  async function cleanupExpiredSessions(state) {
    const nextSessions = state.sessions.filter((session) => (
      new Date(session.expiresAt).getTime() > Date.now()
    ));

    if (nextSessions.length === state.sessions.length) {
      return state;
    }

    const nextState = {
      ...state,
      sessions: nextSessions
    };
    await writeState(nextState);
    return nextState;
  }

  async function buildSessionPayload(state, session) {
    const user = state.users.find((entry) => entry.id === session.userId);

    if (!user) {
      return null;
    }

    const workspaces = listMembershipsForUser(state, user.id);
    const activeWorkspace = workspaces.find((workspace) => workspace.id === session.workspaceId) || workspaces[0] || null;

    return {
      user: sanitizeUser(user),
      workspaces,
      activeWorkspace,
      session: {
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt
      }
    };
  }

  async function ensureLocalUserForSupabaseUser(state, supabaseUser, fallbackName = "") {
    const email = normalizeEmail(supabaseUser.email);
    let user = state.users.find((entry) => entry.supabaseUserId === supabaseUser.id);

    if (!user) {
      user = state.users.find((entry) => entry.email === email);
    }

    if (!user) {
      const createdAt = now();
      user = {
        id: `usr_${randomUUID()}`,
        supabaseUserId: supabaseUser.id,
        name: String(supabaseUser.user_metadata?.name || fallbackName || email.split("@")[0] || "Usuário").trim(),
        email,
        createdAt,
        lastLoginAt: createdAt
      };
      state.users.push(user);
    } else {
      user.supabaseUserId = supabaseUser.id;
      user.name = user.name || String(supabaseUser.user_metadata?.name || fallbackName || email.split("@")[0] || "Usuário").trim();
      user.email = email;
      user.lastLoginAt = now();
    }

    return user;
  }

  async function ensureDefaultWorkspace(state, user, workspaceName = "") {
    const memberships = state.memberships.filter((entry) => entry.userId === user.id);
    const existingWorkspace = memberships
      .map((membership) => state.workspaces.find((entry) => entry.id === membership.workspaceId))
      .find(Boolean);

    if (existingWorkspace) {
      const membership = memberships.find((entry) => entry.workspaceId === existingWorkspace.id);
      return {
        workspace: existingWorkspace,
        membership
      };
    }

    const createdAt = now();
    const workspace = {
      id: `ws_${randomUUID()}`,
      name: String(workspaceName || "Meu Workspace").trim(),
      slug: ensureWorkspaceSlug(String(workspaceName || "Meu Workspace").trim(), state.workspaces),
      ownerUserId: user.id,
      createdAt
    };
    const membership = {
      id: `mbr_${randomUUID()}`,
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
      createdAt
    };

    state.workspaces.push(workspace);
    state.memberships.push(membership);

    return {
      workspace,
      membership
    };
  }

  async function upgradeLegacyUserIfPossible(state, normalizedEmail, password) {
    const legacyUser = state.users.find((entry) => (
      entry.email === normalizedEmail &&
      entry.passwordHash &&
      entry.passwordSalt &&
      !entry.supabaseUserId
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
      const listed = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });
      supabaseUser = listed.data?.users?.find((entry) => normalizeEmail(entry.email) === normalizedEmail) || null;
    }

    if (!supabaseUser) {
      throw new Error("Nao foi possivel localizar o usuario migrado no Supabase Auth.");
    }

    legacyUser.supabaseUserId = supabaseUser.id;
    legacyUser.lastLoginAt = now();
    delete legacyUser.passwordHash;
    delete legacyUser.passwordSalt;
    await writeState(state);

    return supabaseUser;
  }

  return {
    async getSession(sessionToken) {
      if (!sessionToken) {
        return null;
      }

      const state = await cleanupExpiredSessions(await readState());
      const tokenHash = hashSessionToken(sessionToken);
      const session = state.sessions.find((entry) => entry.tokenHash === tokenHash);

      if (!session) {
        return null;
      }

      return buildSessionPayload(state, session);
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

      const supabaseUser = data.user;
      const state = await readState();
      const user = await ensureLocalUserForSupabaseUser(state, supabaseUser, trimmedName);
      const { workspace, membership } = await ensureDefaultWorkspace(state, user, trimmedWorkspace);
      const { sessionToken } = await createSession(state, user.id, workspace.id, supabaseUser.id);
      await writeState(state);

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
        const state = await readState();
        const migratedUser = await upgradeLegacyUserIfPossible(state, normalizedEmail, password);

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

      const supabaseUser = signIn.data.user;
      const state = await readState();
      const user = await ensureLocalUserForSupabaseUser(state, supabaseUser, supabaseUser.user_metadata?.name || "");
      const { workspace } = await ensureDefaultWorkspace(state, user, "Meu Workspace");
      const memberships = listMembershipsForUser(state, user.id);
      const activeWorkspace = memberships.find((entry) => entry.id === workspace.id) || memberships[0] || null;

      if (!activeWorkspace) {
        throw new Error("Sua conta ainda nao possui workspace.");
      }

      const { sessionToken } = await createSession(state, user.id, activeWorkspace.id, supabaseUser.id);
      await writeState(state);

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

      const state = await readState();
      const tokenHash = hashSessionToken(sessionToken);
      const nextSessions = state.sessions.filter((entry) => entry.tokenHash !== tokenHash);

      if (nextSessions.length === state.sessions.length) {
        return;
      }

      await writeState({
        ...state,
        sessions: nextSessions
      });
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

      const state = await readState();
      const tokenHash = hashSessionToken(sessionToken);
      const session = state.sessions.find((entry) => entry.tokenHash === tokenHash);

      if (!session) {
        throw new Error("Sessao invalida.");
      }

      const user = state.users.find((entry) => entry.id === session.userId);

      if (!user) {
        throw new Error("Usuario nao encontrado.");
      }

      const createdAt = now();
      const workspace = {
        id: `ws_${randomUUID()}`,
        name: trimmedName,
        slug: ensureWorkspaceSlug(trimmedName, state.workspaces),
        ownerUserId: user.id,
        createdAt
      };
      const membership = {
        id: `mbr_${randomUUID()}`,
        userId: user.id,
        workspaceId: workspace.id,
        role: "owner",
        createdAt
      };

      state.workspaces.push(workspace);
      state.memberships.push(membership);
      session.workspaceId = workspace.id;
      session.lastSeenAt = createdAt;
      await writeState(state);

      const payload = await buildSessionPayload(state, session);
      return {
        workspace: sanitizeWorkspace(workspace, membership.role),
        session: payload
      };
    },

    async selectWorkspace(sessionToken, workspaceId) {
      const state = await readState();
      const tokenHash = hashSessionToken(sessionToken);
      const session = state.sessions.find((entry) => entry.tokenHash === tokenHash);

      if (!session) {
        throw new Error("Sessao invalida.");
      }

      const membership = state.memberships.find((entry) => (
        entry.userId === session.userId && entry.workspaceId === workspaceId
      ));

      if (!membership) {
        throw new Error("Voce nao tem acesso a esse workspace.");
      }

      session.workspaceId = workspaceId;
      session.lastSeenAt = now();
      await writeState(state);

      return buildSessionPayload(state, session);
    }
  };
}
