export const dataMode = (import.meta.env.VITE_DATA_MODE || "local").trim().toLowerCase();
export const isSupabaseMode = dataMode === "supabase";
