/**
 * Viewer entry — esbuild IIFE target. Reads `window.__CHOROGRAPH__`, mounts on `#root`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import type { Graph } from "./types.ts";

const graph: Graph | undefined = typeof window !== "undefined" ? window.__CHOROGRAPH__ : undefined;
const el = document.getElementById("root");

if (el && graph) {
  createRoot(el).render(
    <StrictMode>
      <App graph={graph} />
    </StrictMode>,
  );
} else if (el) {
  el.textContent = "no graph data (window.__CHOROGRAPH__ missing)";
}
