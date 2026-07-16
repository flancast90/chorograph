#!/usr/bin/env node
/**
 * chorograph CLI — point it at any TypeScript directory and get a map.
 *
 *   chorograph [scan] <dir>   scan a directory → .chorograph/graph.json + report.html (and open it)
 *   chorograph serve <dir>    scan, then serve the report on a local port with live re-scan
 *
 * Flags: --out <dir>  --json (graph only, no html)  --no-open  --no-annotations  --port <n>  --quiet
 *
 * @chorograph group="CLI" role=cli comms=in-proc root
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "./index.ts";
import { generateReport } from "./report.ts";

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
  readonly command: string;
  readonly dir: string;
  readonly out: string;
  readonly json: boolean;
  readonly open: boolean;
  readonly port: number;
  readonly quiet: boolean;
  readonly annotations: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const rest = [...argv];
  let command = "scan";
  if (rest[0] !== undefined && !rest[0].startsWith("-") && ["scan", "serve"].includes(rest[0])) {
    command = rest.shift() as string;
  }
  let dir = ".";
  let out = "";
  let json = false;
  let open = true;
  let port = 4123;
  let quiet = false;
  let annotations = true;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--out") out = rest[++i] ?? out;
    else if (a === "--json") json = true;
    else if (a === "--no-open") open = false;
    else if (a === "--no-annotations") annotations = false;
    else if (a === "--port") port = Number(rest[++i] ?? port) || port;
    else if (a === "--quiet") quiet = true;
    else if (a !== undefined && !a.startsWith("-")) dir = a;
  }
  return { command, dir, out, json, open, port, quiet, annotations };
}

const abs = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = abs(args.dir);
  const outDir = args.out ? abs(args.out) : join(root, ".chorograph");
  const log = (msg: string): void => {
    if (!args.quiet) process.stderr.write(msg + "\n");
  };

  log(`chorograph ${version()} · scanning ${root} …`);
  const warnings: string[] = [];
  const t0 = Date.now();
  const graph = await scan(root, {
    version: version(),
    annotations: args.annotations,
    onWarn: (w) => warnings.push(w),
  });
  const ms = Date.now() - t0;

  mkdirSync(outDir, { recursive: true });
  const graphPath = join(outDir, "graph.json");
  writeFileSync(graphPath, JSON.stringify(graph));

  const c = graph.meta.counts;
  log("");
  log(
    `  ${c.regions} regions · ${c.modules} modules · ${c.symbols} symbols · ${c.externals} externals · ${c.edges} edges  (${ms}ms)`,
  );
  const roleList = Object.entries(graph.meta.roles)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r}=${n}`)
    .join("  ");
  if (roleList) log(`  roles:  ${roleList}`);
  log(
    `  dead:   ${graph.dead.orphans.length} orphans · ${graph.dead.unreachable.length} unreachable · ${graph.dead.deprecated.length} deprecated`,
  );
  if (warnings.length > 0) log(`  ${warnings.length} warning(s)`);
  log("");

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
    const { serve } = await import("./serve.ts");
    await serve({ root, outDir, port: args.port, version: version(), log });
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
