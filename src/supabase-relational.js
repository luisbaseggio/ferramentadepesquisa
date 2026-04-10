import { createClient } from "@supabase/supabase-js";

import { SUPABASE_CONFIG, isSupabaseConfigured } from "./supabase-config.js";

export function createSupabaseServiceClient({
  url = SUPABASE_CONFIG.url,
  serviceRoleKey = SUPABASE_CONFIG.serviceRoleKey
} = {}) {
  if (!isSupabaseConfigured({ url, serviceRoleKey })) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createSupabasePublicClient({
  url = SUPABASE_CONFIG.url,
  anonKey = SUPABASE_CONFIG.anonKey
} = {}) {
  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

export function deriveUpdatedAt(items = []) {
  return items.reduce((latest, item) => {
    const current = String(item?.updatedAt || "");
    return current > latest ? current : latest;
  }, null);
}
