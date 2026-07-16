/**
 * Scan a git revision by detaching it into a temporary worktree, then tearing the worktree down.
 * Ref `"WORKTREE"` (or undefined) means "scan the live working directory" (uncommitted changes included).
 *
 * @chorograph group="CLI" role=usecase comms=in-proc
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { scan, type ScanOptions } from "./index.ts";
import type { Graph } from "./core/model.ts";

const WORKTREE = "WORKTREE";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Absolute path of the enclosing git repository, or null if `dir` is not inside one. */
export function gitRoot(dir: string): string | null {
  try {
    return git(dir, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

/** Default remote branch tip name (`main` / `master` / …). */
export function defaultBranch(repoRoot: string): string {
  try {
    const sym = git(repoRoot, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
    // refs/remotes/origin/main → main
    const m = sym.match(/refs\/remotes\/origin\/(.+)$/);
    if (m?.[1]) return m[1];
  } catch {
    /* fall through */
  }
  for (const name of ["main", "master"] as const) {
    try {
      git(repoRoot, ["rev-parse", "--verify", `refs/heads/${name}`]);
      return name;
    } catch {
      /* try next */
    }
  }
  return "main";
}

/** Merge-base of HEAD and the default branch (for bare `chorograph diff`). */
export function mergeBaseWithDefault(repoRoot: string): string {
  const branch = defaultBranch(repoRoot);
  try {
    return git(repoRoot, ["merge-base", "HEAD", branch]);
  } catch {
    try {
      return git(repoRoot, ["merge-base", "HEAD", `origin/${branch}`]);
    } catch {
      return git(repoRoot, ["rev-parse", "HEAD~1"]);
    }
  }
}

/**
 * Scan `scanRoot` as it existed at `ref`.
 * Paths in the resulting graph stay relative to `scanRoot`'s counterpart inside the worktree,
 * so node ids match across revisions.
 */
export async function scanRef(
  scanRoot: string,
  ref: string | undefined,
  opts: ScanOptions = {},
): Promise<Graph> {
  const absRoot = resolve(scanRoot);
  if (!ref || ref === WORKTREE) {
    return scan(absRoot, opts);
  }

  const repo = gitRoot(absRoot);
  if (!repo) throw new Error(`${absRoot} is not inside a git repository`);

  const rel = relative(repo, absRoot);
  if (rel.startsWith("..")) throw new Error(`${absRoot} is outside the git root ${repo}`);

  const tmp = mkdtempSync(join(tmpdir(), "chorograph-wt-"));
  try {
    git(repo, ["worktree", "add", "--detach", tmp, ref]);
    const target = rel ? join(tmp, rel) : tmp;
    return await scan(target, opts);
  } finally {
    try {
      git(repo, ["worktree", "remove", "--force", tmp]);
    } catch {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

export { WORKTREE };
