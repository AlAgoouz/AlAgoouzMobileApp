import React from "react";
import ReactDOM from "react-dom/client";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles/tokens.css";        // Source of truth for color, typography, spacing, and dual-mode tokens.
import "./index.css";                // Tailwind layers, base accessibility rules, and authentication views.
import "./styles/layout-shell.css";  // Responsive desktop sidebar, tablet bar, mobile nav, modals, and toasts.
import "./styles/components.css";    // Shared cards, dashboard layout, charts, tables, forms, and registers.
import { ScreenLoading } from "./components/ScreenLoading";
import { applyThemeMeta, getStoredThemePreference } from "./lib/theme";

applyThemeMeta(getStoredThemePreference());

const screenModule =
  window.location.pathname.replace(/\/$/, "") === "/menu"
    ? import("./components/PublicMenuPage")
    : import("./App");

const root = ReactDOM.createRoot(document.getElementById("root")!);

function renderScreen(screen: React.ReactNode) {
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <React.Suspense fallback={<ScreenLoading />}>{screen}</React.Suspense>
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}

function ScreenLoadError({ error }: { error: unknown }): never {
  throw error;
}

// Render the route as soon as its module is ready, without waiting for a
// Suspense retry of the loading screen. Nested screens can still suspend.
renderScreen(<ScreenLoading />);
void screenModule.then(
  ({ default: Screen }) => renderScreen(<Screen />),
  error => renderScreen(<ScreenLoadError error={error} />),
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registerOfflinePage = () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is optional when browser policy blocks registration.
    });
  };
  if (document.readyState === 'complete') registerOfflinePage();
  else window.addEventListener('load', registerOfflinePage, {once: true});
}
