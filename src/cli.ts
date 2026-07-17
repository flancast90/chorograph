#!/usr/bin/env node
/**
 * chorograph CLI — point it at any TypeScript directory and get a map.
 *
 *   chorograph [scan] <dir>          scan → .chorograph/graph.json + report.html
 *   chorograph serve <dir>           scan, then serve the report on a local port
 *   chorograph diff [base] [head]    revision overlay for review (see shape of a change)
 *
 * Flags: --out <dir>  --json  --no-open  --no-annotations  --port <n>  --quiet
 *
 * @chorograph group="CLI" role=cli comms=in-proc root
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diffGraphs, scan } from "./index.ts";
import { generateReport } from "./report.ts";
import {
  gitRoot,
  mergeBaseWithDefault,
  scanRef,
  WORKTREE,
} from "./git.ts";
import type { Graph } from "./core/model.ts";

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
  /** Positional refs for `diff` (0–2). */
  readonly refs: readonly string[];
}

function parseArgs(argv: readonly string[]): Args {
  const rest = [...argv];
  let command = "scan";
  if (rest[0] !== undefined && !rest[0].startsWith("-") && ["scan", "serve", "diff"].includes(rest[0])) {
    command = rest.shift() as string;
  }
  let dir = ".";
  let out = "";
  let json = false;
  let open = true;
  let port = 4123;
  let quiet = false;
  let annotations = true;
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--out") out = rest[++i] ?? out;
    else if (a === "--json") json = true;
    else if (a === "--no-open") open = false;
    else if (a === "--no-annotations") annotations = false;
    else if (a === "--port") port = Number(rest[++i] ?? port) || port;
    else if (a === "--quiet") quiet = true;
    else if (a !== undefined && !a.startsWith("-")) positionals.push(a);
  }

  // `diff [base] [head] [dir]` — last positional that looks like a path and exists as cwd-relative
  // is awkward. Convention: dir is only via trailing path when it contains `/` or is `.`,
  // otherwise refs consume positionals. Simpler: for diff, all non-flag args that are not
  // clearly a directory path are refs; if the last arg is an existing directory, treat as dir.
  let refs: string[] = [];
  if (command === "diff") {
    if (positionals.length === 0) {
      dir = ".";
    } else {
      const last = positionals[positionals.length - 1]!;
      const lastAbs = isAbsolute(last) ? last : resolve(process.cwd(), last);
      const looksLikeDir =
        last === "." ||
        last === ".." ||
        last.includes("/") ||
        last.includes("\\") ||
        last.startsWith("~");
      // Prefer: `diff base head path/to/repo` — if ≥1 refs and last looks like path, it's dir.
      if (positionals.length >= 1 && looksLikeDir) {
        dir = last;
        refs = positionals.slice(0, -1);
      } else if (positionals.length <= 2) {
        // `diff`, `diff base`, `diff base head` — dir stays `.`
        refs = positionals;
      } else {
        dir = last;
        refs = positionals.slice(0, -1);
      }
      void lastAbs;
    }
  } else if (positionals[0]) {
    dir = positionals[0];
  }

  return { command, dir, out, json, open, port, quiet, annotations, refs };
}

const abs = (p: string): string => (isAbsolute(p) ? p : resolve(process.cwd(), p));

function shortRef(ref: string): string {
  return ref.length > 12 && /^[0-9a-f]+$/i.test(ref) ? ref.slice(0, 7) : ref;
}

async function runDiff(args: Args, root: string, log: (m: string) => void): Promise<Graph> {
  const repo = gitRoot(root);
  if (!repo) throw new Error(`${root} is not inside a git repository (diff requires git)`);

  let baseRef: string;
  let headRef: string | undefined;
  if (args.refs.length === 0) {
    baseRef = mergeBaseWithDefault(repo);
    headRef = undefined; // worktree
  } else if (args.refs.length === 1) {
    baseRef = args.refs[0]!;
    headRef = undefined;
  } else {
    baseRef = args.refs[0]!;
    headRef = args.refs[1];
  }

  const baseLabel = shortRef(baseRef);
  const headLabel = headRef ? shortRef(headRef) : WORKTREE;
  log(`chorograph ${version()} · diff ${baseLabel}…${headLabel} @ ${root}`);

  const scanOpts = {
    version: version(),
    annotations: args.annotations,
    onWarn: (w: string) => {
      if (!args.quiet) process.stderr.write(`  warn: ${w}\n`);
    },
  };

  const t0 = Date.now();
  const [base, head] = await Promise.all([
    scanRef(root, baseRef, scanOpts),
    scanRef(root, headRef, scanOpts),
  ]);
  const graph = diffGraphs(base, head, { baseLabel, headLabel });
  const ms = Date.now() - t0;
  const d = graph.meta.diff!;
  log("");
  log(
    `  +${d.nodesAdded} nodes · −${d.nodesRemoved} nodes · ~${d.nodesTouched} touched · +${d.edgesAdded} edges · −${d.edgesRemoved} edges  (${ms}ms)`,
  );
  log("");
  return graph;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = abs(args.dir);
  const outDir = args.out ? abs(args.out) : join(root, ".chorograph");
  const log = (msg: string): void => {
    if (!args.quiet) process.stderr.write(msg + "\n");
  };

  let graph: Graph;
  if (args.command === "diff") {
    graph = await runDiff(args, root, log);
  } else {
    log(`chorograph ${version()} · scanning ${root} …`);
    const warnings: string[] = [];
    const t0 = Date.now();
    graph = await scan(root, {
      version: version(),
      annotations: args.annotations,
      onWarn: (w) => warnings.push(w),
    });
    const ms = Date.now() - t0;
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
  }

  mkdirSync(outDir, { recursive: true });
  const graphPath = join(outDir, "graph.json");
  writeFileSync(graphPath, JSON.stringify(graph));

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
