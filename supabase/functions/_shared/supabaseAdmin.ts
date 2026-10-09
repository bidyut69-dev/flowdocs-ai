// Service-role client. Server-side only; bypasses RLS.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Db = SupabaseClient;

export const supabaseAdmin: Db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
