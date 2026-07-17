/**
 * Load a codebase's architecture declarations.
 *
 * Declarations live inside real source modules and register themselves when the module is
 * imported. So loading is: gather the requested files, bundle them together with esbuild (one
 * bundle → one module graph → declarations run once), import the bundle, and read the shared
 * registry off `globalThis`.
 *
 * Modules with chorograph declarations must be importable without side effects — which is just
 * ordinary module hygiene (define things at top level, do things inside functions). Keep server
 * bootstraps behind a `main()` you don't pass to chorograph.
 */
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectGraph, resetRegistry } from "./core/registry.ts";
import type { Graph } from "./core/model.ts";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git"]);

const isSource = (name: string): boolean =>
  (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".mts") || name.endsWith(".js") || name.endsWith(".mjs")) &&
  !name.endsWith(".d.ts") &&
  !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name);

/** Expand files/directories into the list of source modules to import. */
export function expandPaths(paths: readonly string[]): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (isSource(entry.name)) {
        files.push(full);
      }
    }
  };
  for (const p of paths) {
    const full = resolve(p);
    if (!existsSync(full)) throw new Error(`no such file or directory: ${p}`);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
  files.sort();
  if (files.length === 0) throw new Error(`no source files found under: ${paths.join(", ")}`);
  return files;
}

/** Import the given modules and collect their declarations into a Graph. */
export async function loadGraph(
  paths: readonly string[],
  opts: { version?: string; fallbackName?: string } = {},
): Promise<Graph> {
  const files = expandPaths(paths);
  const entry = files.map((f) => `import ${JSON.stringify(f)};`).join("\n");

  const esbuild = await import("esbuild");
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles?.[0]?.text;
  if (!code) throw new Error("could not bundle the given files");

  const dir = mkdtempSync(join(tmpdir(), "chorograph-"));
  const out = join(dir, "architecture.mjs");
  writeFileSync(out, code);
  try {
    // The bundle's chorograph copy and ours share the registry via globalThis, so resetting here
    // clears the slate for the declarations the import is about to run.
    resetRegistry();
    await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
    return collectGraph(opts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
