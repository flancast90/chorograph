/**
 * Build for publishing: bundle the CLI + library to `dist/`, prebuild the viewer to `dist/viewer.js`
 * (so installed users never bundle at runtime), and copy the report template.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "report"), { recursive: true });

// Node entrypoints: bundle app code, keep heavy runtime deps external (resolved from node_modules).
const external = ["typescript", "elkjs", "esbuild"];

await build({
  entryPoints: [join(root, "src/cli.ts"), join(root, "src/index.ts")],
  outdir: dist,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  external,
  banner: { js: "" },
  logLevel: "info",
});

// Browser viewer: fully self-contained IIFE (React inlined), read by report.ts at scan time.
await build({
  entryPoints: [join(root, "src/viewer/main.tsx")],
  outfile: join(dist, "viewer.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

cpSync(join(root, "src/report/template.html"), join(dist, "report/template.html"));

console.log("built → dist/ (cli.js, index.js, viewer.js, report/template.html)");
