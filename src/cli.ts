#!/usr/bin/env node
/**
 * chorograph CLI — render the architecture declared inside a codebase.
 *
 *   chorograph render <paths…>    load source files → .chorograph/graph.json + report.html (default)
 *   chorograph serve <paths…>     serve the report; re-imports the code on every refresh
 *
 * Paths are files or directories (directories are walked for source files, skipping
 * node_modules/dist/tests). Flags: --out <dir>  --json  --no-open  --port <n>  --quiet
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "./load.ts";
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
  readonly paths: readonly string[];
  readonly out: string;
  readonly json: boolean;
  readonly open: boolean;
  readonly port: number;
  readonly quiet: boolean;
}

const USAGE = `usage:
  chorograph render <paths…>   load declarations → graph.json + report.html, open it
  chorograph serve <paths…>    serve the report, re-importing the code on every refresh

paths are source files or directories (walked recursively, skipping node_modules/dist/tests)

flags:
  --out <dir>   output directory (default: .chorograph next to the first path)
  --json        write graph.json only, print meta to stdout
  --no-open     don't open the report in a browser
  --port <n>    port for serve (default: 4123)
  --quiet       suppress progress output
`;

function parseArgs(argv: readonly string[]): Args {
  const rest = [...argv];
  let command: Args["command"] = "render";
  if (rest[0] === "render" || rest[0] === "serve") command = rest.shift() as Args["command"];

  const paths: string[] = [];
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
    } else if (a !== undefined && !a.startsWith("-")) paths.push(a);
  }
  if (paths.length === 0) {
    process.stderr.write(USAGE);
    process.exit(1);
  }
  return { command, paths, out, json, open, port, quiet };
}

const abs = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

/** `.chorograph` next to the first path (its directory when the path is a file). */
function defaultOutDir(firstPath: string): string {
  const full = abs(firstPath);
  const base = statSync(full).isDirectory() ? full : dirname(full);
  return join(base, ".chorograph");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  for (const p of args.paths) {
    if (!existsSync(abs(p))) throw new Error(`no such file or directory: ${p}`);
  }
  const outDir = args.out ? abs(args.out) : defaultOutDir(args.paths[0]!);
  const log = (msg: string): void => {
    if (!args.quiet) process.stderr.write(msg + "\n");
  };

  const fallbackName = basename(abs(args.paths[0]!)).replace(/\.[^.]+$/, "");
  const t0 = Date.now();
  const graph = await loadGraph(args.paths, { version: version(), fallbackName });
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
    await serve({ paths: args.paths, fallbackName, port: args.port, version: version(), log });
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
