import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client using the ANON key.
 * Subject to Row Level Security — safe to use in Client Components.
 * Used exclusively for Realtime subscriptions.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase public env vars. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  return createBrowserClient(url, key);
}
