import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_DAYS = 30;

function buildInitialState() {
  return {
    updatedAt: null,
    users: [],
    workspaces: [],
    memberships: [],
    sessions: []
  };
}

async function safeReadJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return buildInitialState();
    }

    throw error;
  }
}

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

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = await scrypt(String(password), salt, 64);
  return {
    salt,
    hash: derived.toString("hex")
  };
}

async function verifyPassword(password, salt, expectedHash) {
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

export function createWorkspaceAuthService({
  stateFile = path.resolve("data", "auth-state.json"),
  now = () => new Date().toISOString(),
  store = null,
  stateKey = "auth_state"
} = {}) {
  async function readState() {
    if (store) {
      try {
        const state = await store.read(stateKey, buildInitialState());
        return {
          updatedAt: state.updatedAt ?? null,
          users: Array.isArray(state.users) ? state.users : [],
          workspaces: Array.isArray(state.workspaces) ? state.workspaces : [],
          memberships: Array.isArray(state.memberships) ? state.memberships : [],
          sessions: Array.isArray(state.sessions) ? state.sessions : []
        };
      } catch {}
    }

    const state = await safeReadJson(stateFile);
    return {
      updatedAt: state.updatedAt ?? null,
      users: Array.isArray(state.users) ? state.users : [],
      workspaces: Array.isArray(state.workspaces) ? state.workspaces : [],
      memberships: Array.isArray(state.memberships) ? state.memberships : [],
      sessions: Array.isArray(state.sessions) ? state.sessions : []
    };
  }

  async function writeState(state) {
    if (store) {
      try {
        return await store.write(stateKey, {
          ...state,
          updatedAt: now()
        });
      } catch {}
    }

    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify({
      ...state,
      updatedAt: now()
    }, null, 2));
    return state;
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

  async function createSession(state, userId, workspaceId) {
    const sessionToken = randomBytes(32).toString("base64url");
    const createdAt = now();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const session = {
      id: `sess_${randomUUID()}`,
      tokenHash: hashSessionToken(sessionToken),
      userId,
      workspaceId,
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

      const state = await readState();

      if (state.users.some((user) => user.email === normalizedEmail)) {
        throw new Error("Ja existe uma conta com este email.");
      }

      const createdAt = now();
      const passwordData = await hashPassword(password);
      const user = {
        id: `usr_${randomUUID()}`,
        name: trimmedName,
        email: normalizedEmail,
        passwordHash: passwordData.hash,
        passwordSalt: passwordData.salt,
        createdAt,
        lastLoginAt: createdAt
      };
      const workspace = {
        id: `ws_${randomUUID()}`,
        name: trimmedWorkspace,
        slug: ensureWorkspaceSlug(trimmedWorkspace, state.workspaces),
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

      state.users.push(user);
      state.workspaces.push(workspace);
      state.memberships.push(membership);

      const { sessionToken } = await createSession(state, user.id, workspace.id);
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
      const state = await readState();
      const user = state.users.find((entry) => entry.email === normalizedEmail);

      if (!user) {
        throw new Error("Email ou senha invalidos.");
      }

      const passwordMatches = await verifyPassword(password, user.passwordSalt, user.passwordHash);

      if (!passwordMatches) {
        throw new Error("Email ou senha invalidos.");
      }

      user.lastLoginAt = now();
      const memberships = listMembershipsForUser(state, user.id);
      const activeWorkspace = memberships[0] || null;

      if (!activeWorkspace) {
        throw new Error("Sua conta ainda nao possui workspace.");
      }

      const { sessionToken } = await createSession(state, user.id, activeWorkspace.id);
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
