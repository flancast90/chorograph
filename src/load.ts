/**
 * Load a system definition file.
 *
 * Definitions are plain TypeScript (or JavaScript) modules whose default export is the value
 * returned by `defineSystem`. Node can't import TypeScript directly, so the file is bundled with
 * esbuild to a temporary ESM module first — which also lets a definition import helpers, share
 * constants, or be split across files.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isSystem, type System } from "./core/define.ts";

export async function loadSystem(file: string): Promise<System> {
  const esbuild = await import("esbuild");
  const result = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    write: false,
    logLevel: "silent",
    // Node builtins stay external automatically; everything else (including `chorograph` itself)
    // is bundled, so the loaded module has zero resolution requirements.
  });
  const code = result.outputFiles?.[0]?.text;
  if (!code) throw new Error(`could not bundle ${file}`);

  const dir = mkdtempSync(join(tmpdir(), "chorograph-"));
  const out = join(dir, "system.mjs");
  writeFileSync(out, code);
  try {
    const mod = (await import(`${pathToFileURL(out).href}?t=${Date.now()}`)) as { default?: unknown };
    if (!isSystem(mod.default)) {
      throw new Error(
        `${file} does not default-export a system — expected \`export default defineSystem(…)\``,
      );
    }
    return mod.default;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
