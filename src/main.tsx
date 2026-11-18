import React from "react";
import ReactDOM from "react-dom/client";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles/tokens.css";   // Source of truth for every design value. Must stay first.
import "./index.css";
import "./visual-system.css";
import "./card-surfaces.css";
import "./section-system.css";
import "./record-system.css";
import "./interaction-design.css";
import "./styles/operations.css";
import {ScreenLoading} from './components/ScreenLoading';

const Screen = window.location.pathname.replace(/\/$/, '') === '/menu'
  ? React.lazy(() => import('./components/PublicMenuPage'))
  : React.lazy(() => import('./App'));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <React.Suspense
        fallback={
          <ScreenLoading/>
        }
      >
        <Screen />
      </React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>,
);
