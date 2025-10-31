import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL!;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

// Cliente sin tipos para consultar tablas que no están en `Database`
export const supabaseLoose: SupabaseClient<any> = createClient(url, anon);
