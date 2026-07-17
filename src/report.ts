/**
 * Report generation — inline the viewer app + graph data into one self-contained `report.html`.
 *
 * The viewer is bundled to a single IIFE (React inlined, no CDN, no network), so the report opens
 * straight off `file://`. A prebuilt `dist/viewer.js` is preferred; in dev we bundle on the fly.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Graph } from "./core/model.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_MARKER = "/*__CHOROGRAPH_DATA__*/";
const APP_MARKER = "/*__CHOROGRAPH_APP__*/";

async function viewerBundle(): Promise<string> {
  const prebuilt = join(__dirname, "..", "dist", "viewer.js");
  if (existsSync(prebuilt)) return readFileSync(prebuilt, "utf8");

  // Dev path: bundle src/viewer/main.tsx with esbuild.
  const esbuild = await import("esbuild");
  const entry = join(__dirname, "viewer", "main.tsx");
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  return result.outputFiles?.[0]?.text ?? "";
}

/** The complete report HTML as a string — used by `serve` to respond without touching disk. */
export async function renderReportHtml(graph: Graph): Promise<string> {
  const template = readFileSync(join(__dirname, "report", "template.html"), "utf8");
  const app = await viewerBundle();
  const data = `window.__CHOROGRAPH__ = ${JSON.stringify(graph)};`;
  // Function replacers: the viewer bundle contains `$` sequences (`$$typeof`, etc.)
  // that String.replace would otherwise interpret as substitution patterns.
  return template.replace(DATA_MARKER, () => data).replace(APP_MARKER, () => app);
}

/** Write a self-contained report.html for the given graph. */
export async function generateReport(graph: Graph, outPath: string): Promise<void> {
  writeFileSync(outPath, await renderReportHtml(graph));
}
