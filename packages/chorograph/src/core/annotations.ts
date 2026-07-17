/**
 * The annotation scanner — chorograph's entire input surface.
 *
 * Architecture is declared in ordinary doc comments on ordinary code. chorograph parses the
 * source with the TypeScript compiler (parse only — nothing is imported, bundled, or executed),
 * collects every `@service` / `@endpoint` / `@calls` … tag, and assembles the graph. The code
 * itself is untouched: no imports, no wrappers, no decorators, no side-effect rules.
 *
 * The grammar, in one breath:
 *
 *     /**
 *      * Places an order and charges it synchronously.        ← prose = description
 *      * @endpoint POST /orders                               ← declares a node
 *      * @writes orders-db.orders                             ← edge: target, then free text = why
 *      * @emits order.placed so notifications can react
 *      *∕
 *     export async function placeOrder() { … }
 *
 * One node tag per comment; edge tags attach to it. `@service` / `@database` / `@domain` set the
 * file context, so members declared later in the same file don't need to repeat their parent;
 * `@of <parent>` does the same for files whose parent is declared elsewhere (a routes file in a
 * big service). Containment nests as deep as the design does — functions inside endpoints, jobs,
 * or other functions; endpoint groups; a cache owned by one service — governed by one kind matrix.
 * Targets are referenced by name (`session-cache`), dotted path (`orders-db.orders`), and must
 * resolve uniquely — dangling references are errors, which is what keeps the map honest.
 */
import ts from "typescript";
import type { Edge, EdgeKind, Graph, GraphMeta, Node, NodeKind } from "./model.ts";
import { CONTAINS, EDGE_TAGS, MEMBER_KINDS, NODE_TAGS } from "./model.ts";

/** One source file to scan: a path (used in ids of error messages) and its text. */
export interface SourceInput {
  readonly path: string;
  readonly text: string;
}

/** One `@tag` line (plus any continuation lines) inside a doc comment. */
interface RawTag {
  readonly name: string;
  readonly text: string;
  readonly line: number;
}

/** A doc comment containing chorograph tags. */
interface Block {
  readonly file: string;
  readonly line: number;
  readonly prose?: string;
  /** Name of the declaration the comment documents, when it sits on one. */
  readonly symbol?: string;
  readonly tags: readonly RawTag[];
}

const isChorographTag = (tag: string): boolean =>
  tag === "system" || tag === "of" || tag in NODE_TAGS || EDGE_TAGS.has(tag as EdgeKind);

const canContain = (parent: NodeKind, child: NodeKind): boolean => CONTAINS[parent].includes(child);

const slug = (v: string): string =>
  v
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // camelCase symbol names read as words in ids
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";

// ── comment extraction ──────────────────────────────────────────────────────────────────────

/** Split a comment body into leading prose and `@tag` lines (with continuations). */
function parseComment(raw: string): { prose?: string; tags: { name: string; text: string; line: number }[] } {
  const body = raw.replace(/^\/\*\*?/, "").replace(/\*\/$/, "");
  const lines = body.split("\n").map((l) => l.replace(/^\s*\*+ ?/, ""));
  const proseLines: string[] = [];
  const tags: { name: string; text: string; line: number }[] = [];
  let current: { name: string; text: string; line: number } | null = null;
  lines.forEach((l, i) => {
    const m = /^@([A-Za-z][\w-]*)\s*(.*)$/.exec(l.trim());
    if (m) {
      current = { name: m[1]!.toLowerCase(), text: m[2]!, line: i };
      tags.push(current);
    } else if (current) {
      if (l.trim()) current.text += " " + l.trim();
    } else {
      proseLines.push(l);
    }
  });
  const prose = proseLines.join(" ").replace(/\s+/g, " ").trim();
  return { ...(prose ? { prose } : {}), tags };
}

interface NamedDecl {
  readonly fullStart: number;
  readonly start: number;
  readonly name: string;
}

function declarationName(n: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) return n.name?.text;
  if (ts.isVariableStatement(n)) {
    const d = n.declarationList.declarations[0];
    return d && ts.isIdentifier(d.name) ? d.name.text : undefined;
  }
  if (ts.isMethodDeclaration(n) || ts.isPropertyDeclaration(n)) {
    return ts.isIdentifier(n.name) ? n.name.text : undefined;
  }
  return undefined;
}

/** Every declaration a comment could be documenting, with the trivia range it owns. */
function namedDeclarations(sf: ts.SourceFile): NamedDecl[] {
  const out: NamedDecl[] = [];
  const visit = (n: ts.Node): void => {
    const name = declarationName(n);
    if (name !== undefined) out.push({ fullStart: n.getFullStart(), start: n.getStart(sf), name });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Scan one file for doc comments that mention chorograph tags. Parse only; nothing runs.
 * Comment positions come from the parsed AST's trivia (not a raw token scan), so template
 * literals, regexes, and strings can't confuse what is and isn't a comment.
 */
function extractBlocks(file: string, text: string): Block[] {
  const jsx = /\.[jt]sx$/.test(file);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, jsx ? ts.ScriptKind.TSX : undefined);
  const decls = namedDeclarations(sf);

  // Every comment lives in some node's leading trivia (EOF token included, which is how
  // free-standing comments at the end of a file are found).
  const ranges = new Map<number, ts.CommentRange>();
  const collect = (n: ts.Node): void => {
    for (const r of ts.getLeadingCommentRanges(text, n.getFullStart()) ?? []) ranges.set(r.pos, r);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  for (const r of ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()) ?? []) ranges.set(r.pos, r);

  const blocks: Block[] = [];
  for (const r of [...ranges.values()].sort((a, b) => a.pos - b.pos)) {
    if (r.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const raw = text.slice(r.pos, r.end);
    if (!raw.startsWith("/**")) continue;
    const parsed = parseComment(raw);
    if (!parsed.tags.some((t) => isChorographTag(t.name))) continue;

    // The comment documents the innermost declaration whose leading trivia contains it.
    let symbol: string | undefined;
    let best = -1;
    for (const d of decls) {
      if (d.fullStart <= r.pos && r.end <= d.start && d.fullStart > best) {
        best = d.fullStart;
        symbol = d.name;
      }
    }

    const line = sf.getLineAndCharacterOfPosition(r.pos).line + 1;
    blocks.push({
      file,
      line,
      ...(parsed.prose !== undefined ? { prose: parsed.prose } : {}),
      ...(symbol !== undefined ? { symbol } : {}),
      tags: parsed.tags.map((t) => ({ name: t.name, text: t.text, line: line + t.line })),
    });
  }
  return blocks;
}

// ── tag parsing ─────────────────────────────────────────────────────────────────────────────

/** Split on whitespace, honouring double quotes: `tech:"PostgreSQL 16"` is one token. */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && /\s/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

interface TagKeys {
  in?: string;
  of?: string;
  tech?: string;
  tags?: string;
  tables?: string;
}

const KEY_RE = /^(in|of|tech|tags|tables):(.*)$/s;

function splitNameAndKeys(text: string): { name: string; keys: TagKeys } {
  const nameTokens: string[] = [];
  const keys: Record<string, string> = {};
  for (const tok of tokenize(text)) {
    const m = KEY_RE.exec(tok);
    if (m) keys[m[1]!] = m[2]!;
    else nameTokens.push(tok);
  }
  return { name: nameTokens.join(" ").trim(), keys };
}

// ── assembly ────────────────────────────────────────────────────────────────────────────────

interface PendingEdge {
  readonly kind: EdgeKind;
  readonly target: string;
  readonly reason?: string;
  readonly file: string;
  readonly line: number;
}

interface PendingNode {
  readonly kind: NodeKind;
  readonly name: string;
  readonly description?: string;
  readonly tech?: string;
  readonly tags: readonly string[];
  /** Explicit `in:` / `of:` parent reference, resolved by name after all files are scanned. */
  readonly parentRef?: { readonly text: string; readonly file: string; readonly line: number };
  /** Parent from file context (`@service` / `@database` / `@domain` earlier in the file). */
  readonly ctxParent?: PendingNode;
  readonly file: string;
  readonly line: number;
  readonly edges: PendingEdge[];
  id?: string;
  parent?: PendingNode | null;
  resolving?: boolean;
}

/**
 * Scan the given sources and assemble the graph. Throws with every problem found (dangling
 * references, missing parents, duplicates) rather than rendering a silently wrong map.
 */
export function buildGraph(
  sources: readonly SourceInput[],
  opts: { version?: string; fallbackName?: string } = {},
): Graph {
  const errors: string[] = [];
  const at = (file: string, line: number): string => `${file}:${line}`;

  let system: { name: string; description?: string } | null = null;
  let sawAnnotations = false;
  const pendings: PendingNode[] = [];

  for (const src of sources) {
    const blocks = extractBlocks(src.path, src.text);
    if (blocks.length > 0) sawAnnotations = true;
    // File context: members attach to the nearest preceding container of the right sort, so a
    // service's file never repeats itself. `@of <parent>` covers files whose parent lives
    // elsewhere — the routes/ file of a large service, tables split out of their database's file.
    const ctx: {
      domain?: PendingNode;
      service?: PendingNode;
      module?: PendingNode;
      endpoint?: PendingNode;
      database?: PendingNode;
      fileRef?: { text: string; file: string; line: number };
    } = {};

    for (const block of blocks) {
      const nodeTags = block.tags.filter((t) => t.name in NODE_TAGS);
      const edgeTags = block.tags.filter((t) => EDGE_TAGS.has(t.name as EdgeKind));
      const systemTag = block.tags.find((t) => t.name === "system");
      const ofTag = block.tags.find((t) => t.name === "of");

      if (systemTag) {
        const { name } = splitNameAndKeys(systemTag.text);
        if (!name) {
          errors.push(`${at(block.file, systemTag.line)}: @system needs a name`);
        } else if (system && system.name !== name) {
          errors.push(
            `${at(block.file, systemTag.line)}: @system declared twice ("${system.name}", then "${name}") — declare it once`,
          );
        } else {
          system = { name, ...(block.prose !== undefined ? { description: block.prose } : {}) };
        }
        if (nodeTags.length > 0 || edgeTags.length > 0) {
          errors.push(`${at(block.file, block.line)}: give @system its own comment — other tags found next to it`);
        }
        continue;
      }

      if (ofTag) {
        if (nodeTags.length > 0) {
          errors.push(
            `${at(block.file, ofTag.line)}: @of is a file directive and gets its own comment — on a node, use the of: key instead (@${nodeTags[0]!.name} … of:${ofTag.text.trim() || "<parent>"})`,
          );
        } else if (!ofTag.text.trim()) {
          errors.push(`${at(block.file, ofTag.line)}: @of needs a parent, e.g. @of api-gateway`);
        } else {
          ctx.fileRef = { text: ofTag.text.trim(), file: block.file, line: ofTag.line };
        }
        continue;
      }

      if (nodeTags.length === 0) {
        if (edgeTags.length > 0) {
          errors.push(
            `${at(block.file, block.line)}: @${edgeTags[0]!.name} has nothing to attach to — a comment with edge tags also needs a node tag (@service, @endpoint, @fn, …)`,
          );
        }
        continue;
      }
      if (nodeTags.length > 1) {
        errors.push(
          `${at(block.file, block.line)}: one node per comment — found @${nodeTags.map((t) => t.name).join(", @")}`,
        );
        continue;
      }

      const tag = nodeTags[0]!;
      const kind = NODE_TAGS[tag.name]!;
      const { name: rawName, keys } = splitNameAndKeys(tag.text);

      let name = rawName;
      if (!name) {
        const inferable = kind === "function" || kind === "job" || kind === "module";
        if (inferable && block.symbol !== undefined) {
          name = block.symbol;
        } else {
          errors.push(
            `${at(block.file, tag.line)}: @${tag.name} needs a name` +
              (inferable ? " (or put the comment on a named declaration so the name is inferred)" : ""),
          );
          continue;
        }
      }

      const pending: PendingNode = {
        kind,
        name,
        ...(block.prose !== undefined ? { description: block.prose } : {}),
        ...(keys.tech !== undefined ? { tech: keys.tech } : {}),
        tags: keys.tags !== undefined ? keys.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        file: block.file,
        line: tag.line,
        edges: [],
      };

      // Parent wiring, in fixed precedence: an explicit `in:`/`of:` key beats everything; then
      // the file's own context (the @service above a member, the @database above a table, the
      // @domain above anything a domain holds); then the file's @of directive. Members that end
      // up nowhere are errors — an endpoint floating outside any service is not architecture.
      const explicit = keys.of ?? keys.in;
      const mutable = pending as { parentRef?: PendingNode["parentRef"]; ctxParent?: PendingNode };
      const ctxParentFor = (k: NodeKind): PendingNode | undefined => {
        // Functions nest under the nearest preceding container that can hold them: the class or
        // package's @module, the route file's @endpoint, else the file's @service.
        if (k === "function") return ctx.module ?? ctx.endpoint ?? ctx.service;
        if (k === "job") return ctx.module ?? ctx.service;
        if (k === "endpoint") return ctx.service;
        // Modules never auto-nest in a preceding module (two classes in one file would chain);
        // nesting a module inside a module is always explicit via in:/of:.
        if (k === "module") return ctx.service ?? ctx.domain;
        if (k === "table") return ctx.database;
        if (k === "domain") return undefined; // domains nest only explicitly
        return ctx.service && canContain("service", k) ? ctx.service : ctx.domain;
      };
      const ctxParent = ctxParentFor(kind);
      if (explicit !== undefined) {
        mutable.parentRef = { text: explicit, file: block.file, line: tag.line };
      } else if (ctxParent) {
        mutable.ctxParent = ctxParent;
      } else if (ctx.fileRef && kind !== "domain") {
        mutable.parentRef = { ...ctx.fileRef, line: tag.line };
      } else if (MEMBER_KINDS.has(kind)) {
        const want = kind === "table" ? "@database" : "@service";
        errors.push(
          `${at(block.file, tag.line)}: @${tag.name} "${name}" has no parent — declare ${want} earlier in the file, add of:<parent>, or put a file-level \`@of <parent>\` comment at the top`,
        );
        continue;
      }

      if (kind === "domain") ctx.domain = pending;
      if (kind === "service") ctx.service = pending;
      if (kind === "module") ctx.module = pending;
      if (kind === "endpoint") ctx.endpoint = pending;
      if (kind === "database") ctx.database = pending;

      for (const et of edgeTags) {
        const tokens = tokenize(et.text);
        const target = tokens[0];
        if (!target) {
          errors.push(`${at(block.file, et.line)}: @${et.name} needs a target, e.g. @${et.name} orders-db.orders`);
          continue;
        }
        const reason = tokens.slice(1).join(" ").trim();
        pending.edges.push({
          kind: et.name as EdgeKind,
          target,
          ...(reason ? { reason } : {}),
          file: block.file,
          line: et.line,
        });
      }

      pendings.push(pending);

      // `tables:a,b,c` shorthand on @database — one table node per name.
      if (kind === "database" && keys.tables !== undefined) {
        for (const tn of keys.tables.split(",").map((s) => s.trim()).filter(Boolean)) {
          pendings.push({ kind: "table", name: tn, tags: [], ctxParent: pending, file: block.file, line: tag.line, edges: [] });
        }
      }
    }
  }

  // ── resolve parents and ids ──

  // A parent reference is a name (`api-gateway`) or dotted path (`orders.post-orders`), matched
  // against every node that the containment matrix allows as a parent. Same resolution rules as
  // edge targets, so there is one way to refer to a node everywhere.
  const resolveParent = (p: PendingNode): PendingNode | null => {
    const ref = p.parentRef;
    if (!ref) {
      const ctx = p.ctxParent ?? null;
      if (ctx && !canContain(ctx.kind, p.kind)) {
        errors.push(`${at(p.file, p.line)}: a ${ctx.kind} cannot contain a ${p.kind}`);
        return null;
      }
      return ctx;
    }

    const rawSegments = ref.text.split(/[./]/).filter(Boolean);
    const segments = rawSegments.map(slug);
    const last = segments.at(-1) ?? "";
    const named = pendings.filter((q) => q !== p && slug(q.name) === last);
    let candidates = named.filter((q) => canContain(q.kind, p.kind));
    if (segments.length > 1) {
      const path = segments.join("/");
      candidates = candidates.filter((q) => {
        const id = idOf(q);
        return id === path || id.endsWith("/" + path);
      });
    }
    // Case decides ties: `in:Identity` means the domain Identity, not the service identity.
    if (candidates.length > 1) {
      const exact = candidates.filter((q) => q.name === rawSegments.at(-1));
      if (exact.length === 1) candidates = exact;
    }

    if (candidates.length === 1) return candidates[0]!;
    if (candidates.length === 0) {
      if (named.length > 0) {
        const kinds = [...new Set(named.map((q) => q.kind))].join("/");
        errors.push(
          `${at(ref.file, ref.line)}: "${ref.text}" (${kinds}) cannot contain a ${p.kind}`,
        );
      } else {
        const known = [...new Set(pendings.filter((q) => canContain(q.kind, p.kind)).map((q) => q.name))].slice(0, 8);
        errors.push(
          `${at(ref.file, ref.line)}: no parent named "${ref.text}" for ${p.kind} "${p.name}"` +
            (known.length > 0 ? ` — things that could contain it: ${known.join(", ")}` : ""),
        );
      }
    } else {
      errors.push(
        `${at(ref.file, ref.line)}: parent "${ref.text}" is ambiguous — matches ${candidates
          .map((q) => idOf(q))
          .join(", ")}. Qualify it, e.g. ${idOf(candidates[0]!).split("/").slice(-2).join(".")}`,
      );
    }
    return null;
  };

  const idOf = (p: PendingNode): string => {
    if (p.id !== undefined) return p.id;
    if (p.resolving) {
      errors.push(`${at(p.file, p.line)}: "${p.name}" is contained in itself via its in: chain`);
      p.parent = null;
      p.id = slug(p.name);
      return p.id;
    }
    p.resolving = true;
    p.parent = resolveParent(p);
    p.id = p.parent ? `${idOf(p.parent)}/${slug(p.name)}` : slug(p.name);
    p.resolving = false;
    return p.id;
  };

  for (const p of pendings) idOf(p);

  const byId = new Map<string, PendingNode>();
  for (const p of pendings) {
    const existing = byId.get(p.id!);
    if (existing) {
      errors.push(
        `${at(p.file, p.line)}: duplicate ${p.kind} "${p.name}" — already declared at ${at(existing.file, existing.line)}`,
      );
    } else {
      byId.set(p.id!, p);
    }
  }

  // ── resolve edges ──

  // A target token matches a node when, slugged, it equals the node's id or a trailing path of
  // it. `session-cache` finds identity/session-cache; `orders-db.orders` finds the table even
  // though the db lives inside a domain. Dots in plain names (event names) also work because the
  // whole token is tried un-split first.
  const resolveTarget = (token: string): PendingNode[] => {
    const whole = slug(token);
    const path = token.split(/[./]/).map(slug).filter(Boolean).join("/");
    const forms = whole === path ? [whole] : [whole, path];
    const matches = new Set<PendingNode>();
    for (const q of byId.values()) {
      for (const form of forms) {
        if (q.id === form || q.id!.endsWith("/" + form)) matches.add(q);
      }
    }
    // Case decides ties, same as parent references: `Identity` the domain, `identity` the service.
    if (matches.size > 1) {
      const lastRaw = token.split(/[./]/).filter(Boolean).at(-1) ?? token;
      const exact = [...matches].filter((q) => q.name === lastRaw || q.name === token);
      if (exact.length === 1) return exact;
    }
    return [...matches];
  };

  const edges: Edge[] = [];
  const edgeIds = new Set<string>();
  for (const p of pendings) {
    for (const e of p.edges) {
      const matches = resolveTarget(e.target);
      if (matches.length === 0) {
        const last = slug(e.target.split(/[./]/).filter(Boolean).at(-1) ?? e.target);
        const near = [...byId.keys()].filter((id) => id.split("/").at(-1)?.includes(last)).slice(0, 4);
        errors.push(
          `${at(e.file, e.line)}: @${e.kind} target "${e.target}" doesn't match anything` +
            (near.length > 0 ? ` — did you mean: ${near.join(", ")}?` : ""),
        );
        continue;
      }
      if (matches.length > 1) {
        errors.push(
          `${at(e.file, e.line)}: @${e.kind} target "${e.target}" is ambiguous — matches ${matches
            .map((r) => r.id)
            .join(", ")}. Qualify it, e.g. ${matches[0]!.id!.split("/").slice(-2).join(".")}`,
        );
        continue;
      }
      const target = matches[0]!;
      if ((e.kind === "emits" || e.kind === "consumes") && target.kind !== "event" && target.kind !== "queue") {
        errors.push(
          `${at(e.file, e.line)}: @${e.kind} targets an @event or @queue, but "${e.target}" is a ${target.kind}`,
        );
        continue;
      }
      if (target.id === p.id) {
        errors.push(`${at(e.file, e.line)}: "${p.name}" cannot ${e.kind} itself`);
        continue;
      }
      const base = `${e.kind}:${p.id}->${target.id}`;
      let id = base;
      for (let n = 2; edgeIds.has(id); n++) id = `${base}#${n}`;
      edgeIds.add(id);
      edges.push({ id, from: p.id!, to: target.id!, kind: e.kind, ...(e.reason !== undefined ? { label: e.reason } : {}) });
    }
  }

  if (!sawAnnotations) {
    errors.push(
      `no annotations found in ${sources.length} file${sources.length === 1 ? "" : "s"} — declare architecture in doc comments (@system, @service, @endpoint, …)`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`chorograph found ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n` + errors.map((e) => "  · " + e).join("\n"));
  }

  const nodes: Node[] = [...byId.values()].map((p) => ({
    id: p.id!,
    name: p.name,
    kind: p.kind,
    parent: p.parent ? p.parent.id! : null,
    tags: [...p.tags],
    ...(p.description !== undefined ? { description: p.description } : {}),
    ...(p.tech !== undefined ? { tech: p.tech } : {}),
    file: p.file,
    line: p.line,
  }));

  const nodeCounts: Partial<Record<NodeKind, number>> = {};
  for (const n of nodes) nodeCounts[n.kind] = (nodeCounts[n.kind] ?? 0) + 1;
  const edgeCounts: Partial<Record<EdgeKind, number>> = {};
  for (const e of edges) edgeCounts[e.kind] = (edgeCounts[e.kind] ?? 0) + 1;

  const meta: GraphMeta = {
    tool: "chorograph",
    version: opts.version ?? "0.0.0",
    generatedAt: new Date().toISOString(),
    name: system?.name ?? opts.fallbackName ?? "Architecture",
    ...(system?.description !== undefined ? { description: system.description } : {}),
    counts: { nodes: nodeCounts, edges: edgeCounts },
  };
  return { meta, nodes, edges };
}
