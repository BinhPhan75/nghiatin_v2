import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co').trim();
// Extract origin and ensure it's a clean protocol + host
let supabaseUrl = rawUrl.replace(/\/$/, '');
try {
  const urlObj = new URL(supabaseUrl);
  supabaseUrl = urlObj.origin;
} catch (e) {
  console.warn("Invalid Supabase URL format, using as is:", supabaseUrl);
}

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
  }
});
