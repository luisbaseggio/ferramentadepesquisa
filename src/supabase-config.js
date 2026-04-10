export const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || "",
  anonKey: process.env.SUPABASE_ANON_KEY || "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  stateTable: process.env.SUPABASE_STATE_TABLE || "app_state"
};

export function isSupabaseConfigured(config = SUPABASE_CONFIG) {
  return Boolean(config.url && config.serviceRoleKey);
}
