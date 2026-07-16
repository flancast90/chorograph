/**
 * The `@chorograph` annotation grammar — optional metadata authors hand-write to *refine* the map.
 *
 * chorograph works with zero annotations: structure comes from the filesystem and edges from imports.
 * An annotation upgrades a node with semantics the code can't reveal on its own — that a function is
 * an `agent-tool`, that a client `talksTo` Stripe over `http`, that something is `deprecated`.
 *
 *   @chorograph <role> group="Layer/Service" role=<role> roles=a;b comms=http;sql \
 *               talksTo=Stripe;"SAM.gov API" status=deprecated tags=x;y name=Foo root
 *
 * · the first bare token (no `=`) is shorthand for `role`
 * · `group` is a slash-delimited containment path (`Domain/Ports`) — the ONLY structural key, and
 *   the only thing that places a node in the layer › service › function hierarchy. No folder names
 *   are ever read for structure. Omit it and the node lands under an `Ungrouped` region.
 * · the bare token `root` marks a legitimate entrypoint (never flagged as dead)
 * · list values (`roles`, `comms`, `talksTo`, `tags`) split on `;` or `,`
 * · values may be "double quoted" to include spaces
 * · `@archmap` is accepted as a legacy alias, and its `kind=` maps to `role`
 *
 * @chorograph role=domain-model group="Core" comms=in-proc
 */
import type { Comms, Role, Status } from "./model.ts";

export const ANNOTATION_TAGS = ["chorograph", "archmap"] as const;

const STATUS_SET = new Set<Status>(["active", "deprecated", "experimental"]);

export interface ParsedAnnotation {
  readonly roles: readonly Role[];
  readonly comms: readonly Comms[];
  readonly talksTo: readonly string[];
  readonly status?: Status;
  readonly tags: readonly string[];
  readonly name?: string;
  readonly root: boolean;
  /** Slash-delimited containment path (`Domain/Ports`); the only structural key. */
  readonly group?: string;
}

const unquote = (v: string): string =>
  v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;

/** Split a list value on `;`/`,` but never inside `"quotes"`, then unquote/trim each item. */
function splitList(v: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of v) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if ((ch === ";" || ch === ",") && !inQuotes) {
      if (cur.trim()) out.push(unquote(cur.trim()));
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(unquote(cur.trim()));
  return out.filter(Boolean);
}

/** Tokenise into `key=value` / bare tokens on whitespace, keeping `"quoted runs"` intact. */
function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /(?:"[^"]*"|[^\s"])+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) out.push(m[0]);
  return out;
}

/** Parse the text following `@chorograph` / `@archmap`. Never throws; roles/comms are open-ended. */
export function parseAnnotation(raw: string): ParsedAnnotation {
  const roles: Role[] = [];
  const comms: Comms[] = [];
  const talksTo: string[] = [];
  const tags: string[] = [];
  let status: Status | undefined;
  let name: string | undefined;
  let group: string | undefined;
  let root = false;

  const addRole = (r: string): void => {
    if (r && !roles.includes(r)) roles.push(r);
  };

  for (const token of tokenize(raw.trim())) {
    const eq = token.indexOf("=");
    if (eq === -1) {
      if (token === "root") root = true;
      else addRole(token); // bare token → a role (first is the primary)
      continue;
    }
    const key = token.slice(0, eq).trim();
    const value = unquote(token.slice(eq + 1).trim());
    switch (key) {
      case "kind": // legacy @archmap alias
      case "role":
        addRole(value);
        break;
      case "roles":
        for (const r of splitList(value)) addRole(r);
        break;
      case "comms":
        for (const c of splitList(value)) comms.push(c as Comms);
        break;
      case "talksTo":
        talksTo.push(...splitList(value));
        break;
      case "tags":
        tags.push(...splitList(value));
        break;
      case "status":
        if (STATUS_SET.has(value as Status)) status = value as Status;
        break;
      case "name":
        name = value;
        break;
      case "group":
        group = value.replace(/^\/+|\/+$/g, "").trim() || undefined;
        break;
      case "layer": // legacy @archmap key → outermost group segment when no explicit group is set.
        if (group === undefined && value.trim()) group = value.trim();
        break;
      case "root":
        root = value !== "false";
        break;
      default:
        tags.push(`${key}:${value}`);
    }
  }

  return {
    roles,
    comms,
    talksTo,
    tags,
    root,
    ...(status !== undefined ? { status } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(group !== undefined ? { group } : {}),
  };
}
