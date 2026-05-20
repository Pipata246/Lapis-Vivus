import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../config.js';

let client = null;

export function getSupabase() {
  if (!client) {
    const { supabaseUrl, supabaseServiceRoleKey } = loadConfig();
    client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}
