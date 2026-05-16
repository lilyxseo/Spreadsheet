import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta?.env?.VITE_SUPABASE_URL || window?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY || window?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
