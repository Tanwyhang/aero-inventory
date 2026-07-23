import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createServiceRoleClient() {
  const { url, key } = getSupabaseServiceRoleEnv();

  return createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
