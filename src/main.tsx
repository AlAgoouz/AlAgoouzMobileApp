import React from "react";
import ReactDOM from "react-dom/client";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles/tokens.css";        // Source of truth for color, typography, spacing, and dual-mode tokens.
import "./index.css";                // Tailwind layers, base accessibility rules, and authentication views.
import "./styles/layout-shell.css";  // Responsive desktop sidebar, tablet bar, mobile nav, modals, and toasts.
import "./styles/components.css";    // Shared cards, dashboard layout, charts, tables, forms, and registers.
import { ScreenLoading } from "./components/ScreenLoading";

const Screen =
  window.location.pathname.replace(/\/$/, "") === "/menu"
    ? React.lazy(() => import("./components/PublicMenuPage"))
    : React.lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <React.Suspense fallback={<ScreenLoading />}>
        <Screen />
      </React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>,
);
