import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { isSupabaseMode } from "./lib/dataMode.js";
import "./index.css";

const ModeApp = lazy(() => isSupabaseMode ? import("./SupabaseApp.jsx") : import("./App.jsx"));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<p className="p-6 text-slate-500">Loading application...</p>}><ModeApp /></Suspense>
    </ErrorBoundary>
  </StrictMode>
);
