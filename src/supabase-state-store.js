import { createClient } from "@supabase/supabase-js";

import { SUPABASE_CONFIG, isSupabaseConfigured } from "./supabase-config.js";

function cloneFallback(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createSupabaseStateStore({
  url = SUPABASE_CONFIG.url,
  serviceRoleKey = SUPABASE_CONFIG.serviceRoleKey,
  table = SUPABASE_CONFIG.stateTable
} = {}) {
  const configured = isSupabaseConfigured({
    url,
    serviceRoleKey
  });

  const client = configured
    ? createClient(url, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : null;

  return {
    isConfigured() {
      return Boolean(client);
    },

    async read(key, fallbackValue) {
      if (!client) {
        return cloneFallback(fallbackValue);
      }

      const { data, error } = await client
        .from(table)
        .select("value")
        .eq("key", key)
        .maybeSingle();

      if (error) {
        throw new Error(`Supabase read failed for ${key}: ${error.message}`);
      }

      if (!data?.value) {
        return cloneFallback(fallbackValue);
      }

      return data.value;
    },

    async write(key, value) {
      if (!client) {
        return value;
      }

      const { error } = await client
        .from(table)
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "key"
        });

      if (error) {
        throw new Error(`Supabase write failed for ${key}: ${error.message}`);
      }

      return value;
    }
  };
}
