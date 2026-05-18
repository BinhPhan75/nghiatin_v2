import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
let supabaseUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`) : 'https://placeholder.supabase.co';

// Normalize URL: remove trailing slash and common subpaths
if (supabaseUrl.endsWith('/')) {
  supabaseUrl = supabaseUrl.slice(0, -1);
}
if (supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.slice(0, -8);
}
if (supabaseUrl.endsWith('/auth/v1')) {
  supabaseUrl = supabaseUrl.slice(0, -8);
}

const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder').trim();

console.log("[Supabase] Initializing with URL:", supabaseUrl);
if (supabaseUrl.includes('supabase.co')) {
  console.log("[Supabase] URL looks like a standard Supabase domain.");
} else if (supabaseUrl !== 'https://placeholder.supabase.co') {
  console.warn("[Supabase] URL does not look like a standard Supabase domain. Ensure it is correct.");
  
  // Detect self-pointing URL which causes "Invalid path specified in request URL"
  if (typeof window !== 'undefined' && window.location.hostname && supabaseUrl.includes(window.location.hostname)) {
    console.error("CRITICAL: Supabase URL seems to be pointing to THIS APP instead of a Supabase project!");
  }
}

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
