#!/usr/bin/env node
/**
 * chorograph CLI — render a system definition into a shareable map.
 *
 *   chorograph render <system.ts>    definition → .chorograph/graph.json + report.html (default)
 *   chorograph serve <system.ts>     watch the definition and serve the report with live rebuild
 *
 * Flags: --out <dir>  --json  --no-open  --port <n>  --quiet
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Graph } from "./core/model.ts";
import { loadSystem } from "./load.ts";
import { generateReport } from "./report.ts";
import { serve } from "./serve.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

interface Args {
  readonly command: "render" | "serve";
  readonly file: string;
  readonly out: string;
  readonly json: boolean;
  readonly open: boolean;
  readonly port: number;
  readonly quiet: boolean;
}

const USAGE = `usage:
  chorograph render <system.ts>   write graph.json + report.html and open it
  chorograph serve <system.ts>    watch the definition, serve with live rebuild

flags:
  --out <dir>   output directory (default: .chorograph next to the definition)
  --json        write graph.json only, print meta to stdout
  --no-open     don't open the report in a browser
  --port <n>    port for serve (default: 4123)
  --quiet       suppress progress output
`;

function parseArgs(argv: readonly string[]): Args {
  const rest = [...argv];
  let command: Args["command"] = "render";
  if (rest[0] === "render" || rest[0] === "serve") command = rest.shift() as Args["command"];

  let file = "";
  let out = "";
  let json = false;
  let open = true;
  let port = 4123;
  let quiet = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--out") out = rest[++i] ?? out;
    else if (a === "--json") json = true;
    else if (a === "--no-open") open = false;
    else if (a === "--port") port = Number(rest[++i] ?? port) || port;
    else if (a === "--quiet") quiet = true;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a !== undefined && !a.startsWith("-") && !file) file = a;
  }
  if (!file) {
    process.stderr.write(USAGE);
    process.exit(1);
  }
  return { command, file, out, json, open, port, quiet };
}

const abs = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

export async function buildGraph(file: string): Promise<Graph> {
  const system = await loadSystem(file);
  return system.toGraph({ version: version() });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = abs(args.file);
  if (!existsSync(file)) throw new Error(`no such file: ${file}`);
  const outDir = args.out ? abs(args.out) : join(dirname(file), ".chorograph");
  const log = (msg: string): void => {
    if (!args.quiet) process.stderr.write(msg + "\n");
  };

  const t0 = Date.now();
  const graph = await buildGraph(file);
  const nodeTotal = Object.values(graph.meta.counts.nodes).reduce((a, b) => a + b, 0);
  const edgeTotal = Object.values(graph.meta.counts.edges).reduce((a, b) => a + b, 0);
  log(`chorograph ${version()} · ${graph.meta.name}`);
  log(`  ${nodeTotal} nodes · ${edgeTotal} edges  (${Date.now() - t0}ms)`);

  mkdirSync(outDir, { recursive: true });
  const graphPath = join(outDir, "graph.json");
  writeFileSync(graphPath, JSON.stringify(graph, null, 2));

  if (args.json) {
    log(`  → ${graphPath}`);
    process.stdout.write(JSON.stringify(graph.meta) + "\n");
    return;
  }

  const reportPath = join(outDir, "report.html");
  await generateReport(graph, reportPath);
  log(`  → ${graphPath}`);
  log(`  → ${reportPath}`);

  if (args.command === "serve") {
    await serve({ file, port: args.port, version: version(), log });
    return;
  }
  if (args.open) openInBrowser(reportPath);
}

function openInBrowser(path: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [path], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* opening is best-effort */
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`chorograph: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
