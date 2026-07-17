/**
 * Build for publishing: bundle the CLI + library to `dist/`, prebuild the viewer to `dist/viewer.js`
 * (so installed users never bundle the viewer at runtime), and copy the report template.
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "report"), { recursive: true });

// Node entrypoints: bundle app code. typescript (the parser, the one runtime dependency) stays
// external; esbuild too — report.ts only dynamic-imports it on the dev path, never when the
// prebuilt dist/viewer.js ships alongside.
await build({
  entryPoints: [join(root, "src/cli.ts"), join(root, "src/index.ts")],
  outdir: dist,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  external: ["typescript", "esbuild"],
  logLevel: "info",
});

// Browser viewer: fully self-contained IIFE (React + ELK inlined), read by report.ts at render time.
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

// Type declarations for the public API (`import { buildGraph } from "chorograph"`).
execSync("npx tsc -p tsconfig.build.json", { cwd: root, stdio: "inherit" });
// Source uses explicit `.ts` specifiers (allowImportingTsExtensions); consumers need `.js`.
for (const f of ["index.d.ts", "load.d.ts", "core/annotations.d.ts", "core/model.d.ts"]) {
  const p = join(dist, f);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll('.ts"', '.js"'));
}

console.log("built → dist/ (cli.js, index.js, index.d.ts, viewer.js, report/template.html)");
