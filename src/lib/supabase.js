import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to .env.local');
}

// Public client — used in the browser for all authenticated operations
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export default supabase;

// ⚠️ supabaseAdmin (service role) is intentionally NOT exported from this file.
// The service role key must never be in the browser bundle — it bypasses all RLS.
// All admin operations must go through Supabase Edge Functions, which have access
// to SUPABASE_SERVICE_ROLE_KEY as a server-side secret.
