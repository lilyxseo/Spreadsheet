import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || window.__ENV__?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || window.__ENV__?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env belum terpasang: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
