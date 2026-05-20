import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig } from '../config.js';

let client = null;

export function getSupabase() {
  if (!client) {
    const { supabaseUrl, supabaseServiceRoleKey } = loadSupabaseConfig();
    client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}
