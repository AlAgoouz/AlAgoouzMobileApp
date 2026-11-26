import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'bon_elagouz_supabase_url';
const STORAGE_ANON_KEY = 'bon_elagouz_supabase_anon_key';

function environmentCredentials() {
  const env = (import.meta as unknown as {env?: Record<string, string>}).env;
  return {
    url: env?.VITE_SUPABASE_URL?.trim() || '',
    anonKey: env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env?.VITE_SUPABASE_ANON_KEY?.trim() || '',
  };
}

export function getSupabaseSettings() {
  const environment = environmentCredentials();
  return {
    url: environment.url || localStorage.getItem(STORAGE_URL_KEY)?.trim() || '',
    anonKey: environment.anonKey || localStorage.getItem(STORAGE_ANON_KEY)?.trim() || '',
    urlFromEnvironment: Boolean(environment.url),
    keyFromEnvironment: Boolean(environment.anonKey),
  };
}

export function getSupabaseCredentials() {
  const {url, anonKey} = getSupabaseSettings();
  return {url, anonKey};
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  const environment = environmentCredentials();
  if (!environment.url) localStorage.setItem(STORAGE_URL_KEY, url.trim());
  if (!environment.anonKey) localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
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
    clientInstance = createClient(url, anonKey, {
      auth: {
        storage: {
          getItem(key) {
            return sessionStorage.getItem(key) ?? localStorage.getItem(key);
          },
          setItem(key, value) {
            const persistent =
              localStorage.getItem('bon_elagouz_remember_auth') === 'yes';
            (persistent ? sessionStorage : localStorage).removeItem(key);
            (persistent ? localStorage : sessionStorage).setItem(key, value);
          },
          removeItem(key) {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
          },
        },
      },
    });
    lastUrl = url;
    lastKey = anonKey;
    return clientInstance;
  } catch {
    return null;
  }
}
