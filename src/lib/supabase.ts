import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`) : 'https://placeholder.supabase.co';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder').trim();

console.log("Initializing Supabase with URL:", supabaseUrl);

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error('CRITICAL: Supabase environment variables are missing! The app will not function correctly until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in settings.');
}

// Client initialization with safety defaults
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    fetch: async (...args: any[]) => {
      try {
        return await (globalThis.fetch as any)(...args);
      } catch (err: any) {
        if (err.message?.includes('Failed to fetch')) {
          console.error("Critical Network Error (Failed to fetch): Check Supabase URL visibility or internet connection.");
        }
        throw err;
      }
    }
  }
});
