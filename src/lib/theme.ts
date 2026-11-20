import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'bon_elagouz_color_scheme';

function readSystemDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore blocked storage */
  }
  return 'system';
}

export function applyThemeMeta(pref: ThemePreference): 'light' | 'dark' {
  const effective: 'light' | 'dark' = pref === 'system' ? (readSystemDark() ? 'dark' : 'light') : pref;
  if (typeof document !== 'undefined') {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (meta) {
      meta.content = pref === 'system' ? 'light dark' : pref;
    }
    const themeMetas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    themeMetas.forEach((m) => {
      if (!m.media || (effective === 'dark' && m.media.includes('dark')) || (effective === 'light' && m.media.includes('light'))) {
        m.content = effective === 'dark' ? '#14100D' : '#FBF9F5';
      }
    });
  }
  return effective;
}

export function setThemePreference(pref: ThemePreference): void {
  if (typeof window !== 'undefined') {
    try {
      if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* ignore blocked storage */
    }
  }
  applyThemeMeta(pref);
}

/**
 * React hook for 3-state color-scheme management (system / light / dark)
 * with cross-tab sync and live prefers-color-scheme updates.
 */
export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredThemePreference);
  const [systemDark, setSystemDark] = useState<boolean>(readSystemDark);

  useEffect(() => {
    applyThemeMeta(preference);
  }, [preference, systemDark]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        setPreference(getStoredThemePreference());
      }
    };
    window.addEventListener('storage', onStorage);

    const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const onMediaChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql?.addEventListener?.('change', onMediaChange);

    return () => {
      window.removeEventListener('storage', onStorage);
      mql?.removeEventListener?.('change', onMediaChange);
    };
  }, []);

  const effective: 'light' | 'dark' = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  const updatePreference = (next: ThemePreference) => {
    setThemePreference(next);
    setPreference(next);
  };

  /** Quick 2-state comfort toggle matching system/opposite model without pinning the OS value. */
  const toggleComfortScheme = () => {
    const target: 'light' | 'dark' = effective === 'dark' ? 'light' : 'dark';
    const currentSystem: 'light' | 'dark' = systemDark ? 'dark' : 'light';
    updatePreference(target === currentSystem ? 'system' : target);
  };

  return {
    preference,
    effective,
    systemScheme: (systemDark ? 'dark' : 'light') as 'light' | 'dark',
    setPreference: updatePreference,
    toggleComfortScheme,
  };
}
