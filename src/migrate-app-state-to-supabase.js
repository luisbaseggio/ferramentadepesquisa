import fs from "node:fs/promises";
import path from "node:path";

import { createSupabaseStateStore } from "./supabase-state-store.js";

const DEFAULT_SOURCE_ROOT = "/Users/luisoliveira/Documents/russinhodagalera /FERRAMENTA DE PESQUISA ";

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function main() {
  const sourceRoot = process.env.MIGRATION_SOURCE_ROOT || DEFAULT_SOURCE_ROOT;
  const authPath = path.join(sourceRoot, "data", "auth-state.json");
  const queuePath = path.join(sourceRoot, "output", "review-queue.json");
  const approvedPath = path.join(sourceRoot, "output", "approved-channel.json");

  const store = createSupabaseStateStore();

  if (!store.isConfigured()) {
    throw new Error("Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  const authState = await readJson(authPath, {
    updatedAt: null,
    users: [],
    workspaces: [],
    memberships: [],
    sessions: []
  });
  const reviewQueue = await readJson(queuePath, {
    updatedAt: null,
    items: []
  });
  const approvedChannel = await readJson(approvedPath, {
    updatedAt: null,
    items: []
  });

  await store.write("auth_state", authState);
  await store.write("review_queue", reviewQueue);
  await store.write("approved_channel", approvedChannel);

  console.log(JSON.stringify({
    ok: true,
    sourceRoot,
    migrated: {
      auth_state: {
        users: authState.users?.length || 0,
        workspaces: authState.workspaces?.length || 0,
        sessions: authState.sessions?.length || 0
      },
      review_queue: {
        items: reviewQueue.items?.length || 0
      },
      approved_channel: {
        items: approvedChannel.items?.length || 0
      }
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
