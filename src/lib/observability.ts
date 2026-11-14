/// <reference types="vite/client" />

import type {BrowserOptions} from '@sentry/browser';

type Incident = 'render_failure' | 'stale_application';

const reported = new Set<Incident>();

export function safeSentryOptions(dsn: string, release: string): BrowserOptions {
  const safeRelease = /^[a-f0-9]{7,40}$/i.test(release) ? release : undefined;
  return {
    dsn,
    release: safeRelease,
    environment: import.meta.env.MODE,
    defaultIntegrations: false,
    sendClientReports: false,
    beforeSend(event) {
      if (event.message !== 'render_failure' && event.message !== 'stale_application') return null;
      return {
        type: undefined,
        event_id: event.event_id,
        timestamp: event.timestamp,
        level: 'error',
        message: event.message,
        release: safeRelease,
        environment: import.meta.env.MODE,
        platform: 'javascript',
      };
    },
  };
}

export function reportBrowserIncident(incident: Incident): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || reported.has(incident)) return;

  try {
    const url = new URL(dsn);
    if (
      url.protocol !== 'https:' || url.port || url.password || !/^[a-f0-9]+$/i.test(url.username) ||
      !/^[0-9]+$/.test(url.pathname.slice(1)) || url.search || url.hash ||
      !/^o[0-9]+[.]ingest(?:[.](?:us|de))?[.]sentry[.]io$/.test(url.hostname)
    ) return;
  } catch { return; }

  reported.add(incident);
  void import('@sentry/browser').then(sdk => {
    if (!sdk.getClient()) sdk.init(safeSentryOptions(dsn, import.meta.env.VITE_AGOUZ_RELEASE || ''));
    sdk.captureMessage(incident, 'error');
  }).catch(() => {});
}
