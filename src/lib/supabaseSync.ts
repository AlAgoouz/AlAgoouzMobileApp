import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'bon_elagouz_supabase_url';
const STORAGE_ANON_KEY = 'bon_elagouz_supabase_anon_key';

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '';
  const savedUrl = localStorage.getItem(STORAGE_URL_KEY) || envUrl;
  const savedKey = localStorage.getItem(STORAGE_ANON_KEY) || envKey;
  return { url: savedUrl.trim(), anonKey: savedKey.trim() };
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  localStorage.setItem(STORAGE_URL_KEY, url.trim());
  localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
}

let clientInstance: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) return null;
  if (clientInstance && lastUrl === url && lastKey === anonKey) {
    return clientInstance;
  }
  try {
    clientInstance = createClient(url, anonKey);
    lastUrl = url;
    lastKey = anonKey;
    return clientInstance;
  } catch {
    return null;
  }
}
