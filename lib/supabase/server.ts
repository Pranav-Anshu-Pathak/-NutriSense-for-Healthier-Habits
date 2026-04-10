import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * Bypasses Row Level Security — safe ONLY inside app/api/* Route Handlers.
 * Never import this in a Client Component.
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
  }

  return createClient(url, key, {
    auth: {
      // Disable automatic token refresh — this is a server client
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}
