import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <React.Suspense
        fallback={
          <div role="status" className="p-8 text-center">
            جارٍ تحميل الشاشة…
          </div>
        }
      >
        <App />
      </React.Suspense>
    </AppErrorBoundary>
  </React.StrictMode>,
);
