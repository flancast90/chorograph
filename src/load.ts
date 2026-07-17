/**
 * Load a codebase's architecture annotations.
 *
 * Loading is just reading: gather the requested files, hand their text to the annotation scanner,
 * get a graph back. Nothing is imported, bundled, or executed — annotated code never needs to be
 * runnable, side-effect free, or even type-correct for the map to build.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { buildGraph } from "./core/annotations.ts";
import type { Graph } from "./core/model.ts";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git"]);

const isSource = (name: string): boolean =>
  /\.[cm]?[jt]sx?$/.test(name) && !name.endsWith(".d.ts") && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name);

/** Expand files/directories into the list of source files to scan. */
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

/** Scan the given files' doc comments and assemble the Graph. */
export function loadGraph(paths: readonly string[], opts: { version?: string; fallbackName?: string } = {}): Graph {
  const cwd = process.cwd();
  const sources = expandPaths(paths).map((file) => ({
    path: relative(cwd, file),
    text: readFileSync(file, "utf8"),
  }));
  return buildGraph(sources, opts);
}
