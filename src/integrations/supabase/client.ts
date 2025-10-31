// src/integrations/supabase/client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
// Si ya tienes tu tipo Database generado, impórtalo aquí.
// import type { Database } from "@/integrations/supabase/types";

const url = import.meta.env.VITE_SUPABASE_URL!;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

// Cliente tipado (si tienes Database). Si no, deja 'any'.
export const supabase = createClient<any>(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Cliente “flexible” para RPC no tipadas (evita: Argument of type 'never')
export const supabaseFx: SupabaseClient<any> = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

