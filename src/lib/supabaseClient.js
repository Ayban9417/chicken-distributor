import { createClient } from "@supabase/supabase-js";

const environment = import.meta.env || globalThis.process?.env || {};
const url = environment.VITE_SUPABASE_URL?.trim();
const key = environment.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigurationError =
  !url || !key ? "Supabase mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." : "";

export const supabase = supabaseConfigurationError
  ? null
  : createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

export function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigurationError);
  return supabase;
}
