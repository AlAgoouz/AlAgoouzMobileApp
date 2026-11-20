import React from "react";
import ReactDOM from "react-dom/client";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ScreenLoading } from "./components/ScreenLoading";
import { applyThemeMeta, getStoredThemePreference } from "./lib/theme";

export function mountScreen(screen: Promise<{ default: React.ComponentType }>) {
  applyThemeMeta(getStoredThemePreference());
  const Screen = React.lazy(() => screen);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <React.Suspense fallback={<ScreenLoading />}>
          <Screen />
        </React.Suspense>
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}
