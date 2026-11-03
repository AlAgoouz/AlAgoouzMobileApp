import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";
import "./visual-system.css";
import {ScreenLoading} from './components/ScreenLoading';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <React.Suspense
        fallback={
          <ScreenLoading/>
        }
      >
        <App />
      </React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>,
);
