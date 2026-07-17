/**
 * The architecture registry — where declarations land as the annotated code is imported.
 *
 * Declarations run inside real application modules, and those modules may be bundled with their
 * own copy of chorograph. To make every copy write to the same map, the store is a plain object
 * hung off `globalThis` under a versioned key, and every function here operates on that shared
 * store by duck type — never on module-local state or class instances.
 */
import type { Edge, EdgeKind, Graph, GraphMeta, Node, NodeKind, NodeOptions } from "./model.ts";

/** A decorated class member waiting for its enclosing `@service` class decorator to claim it. */
export interface PendingMember {
  readonly kind: "endpoint" | "function" | "job";
  readonly name: string;
  readonly options: NodeOptions;
}

interface Store {
  systemName: string | null;
  systemDescription: string | null;
  nodes: Node[];
  edges: Edge[];
  ids: Set<string>;
  pending: PendingMember[];
}

const KEY = "__chorograph_registry_v1__";

function store(): Store {
  const g = globalThis as Record<string, unknown>;
  if (!g[KEY]) {
    g[KEY] = {
      systemName: null,
      systemDescription: null,
      nodes: [],
      edges: [],
      ids: new Set<string>(),
      pending: [],
    } satisfies Store;
  }
  return g[KEY] as Store;
}

/** Clear all declarations. Used by the CLI before loading a codebase, and by tests. */
export function resetRegistry(): void {
  delete (globalThis as Record<string, unknown>)[KEY];
}

export function setSystem(name: string, description?: string): void {
  const s = store();
  if (s.systemName !== null && s.systemName !== name) {
    throw new Error(`chorograph: system() called twice ("${s.systemName}", then "${name}") — declare it once`);
  }
  s.systemName = name;
  s.systemDescription = description ?? null;
}

const slug = (v: string): string =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";

export function registerNode(
  parent: string | null,
  kind: NodeKind,
  name: string,
  options: NodeOptions = {},
): Node {
  if (!name.trim()) throw new Error(`chorograph: a ${kind} needs a non-empty name`);
  const s = store();
  const id = parent ? `${parent}/${slug(name)}` : slug(name);
  if (s.ids.has(id)) {
    throw new Error(
      `chorograph: duplicate ${kind} "${name}"${parent ? ` under "${parent}"` : ""} — names must be unique within their parent`,
    );
  }
  s.ids.add(id);
  const node: Node = {
    id,
    name,
    kind,
    parent,
    tags: options.tags ?? [],
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.tech !== undefined ? { tech: options.tech } : {}),
  };
  s.nodes.push(node);
  return node;
}

export function registerEdge(kind: EdgeKind, fromId: string, toId: string, label?: string): void {
  const s = store();
  if (fromId === toId) throw new Error(`chorograph: a node cannot ${kind} itself (${fromId})`);
  const base = `${kind}:${fromId}->${toId}`;
  let id = base;
  for (let n = 2; s.edges.some((e) => e.id === id); n++) id = `${base}#${n}`;
  s.edges.push({ id, from: fromId, to: toId, kind, ...(label !== undefined ? { label } : {}) });
}

export function pushPendingMember(member: PendingMember): void {
  store().pending.push(member);
}

/** Claim members decorated since the last claim — called by the `@service` class decorator. */
export function drainPendingMembers(): PendingMember[] {
  const s = store();
  const drained = s.pending;
  s.pending = [];
  return drained;
}

/** Assemble the current declarations into the serialisable Graph contract. */
export function collectGraph(opts: { version?: string; fallbackName?: string } = {}): Graph {
  const s = store();
  if (s.pending.length > 0) {
    const orphaned = s.pending.map((p) => `${p.kind} "${p.name}"`).join(", ");
    throw new Error(
      `chorograph: ${orphaned} decorated but never claimed — @endpoint/@func/@job methods need a @service(…) decorator on their class`,
    );
  }
  if (s.nodes.length === 0) {
    throw new Error("chorograph: no declarations found — did the loaded files import and call the chorograph API?");
  }
  const nodeCounts: Partial<Record<NodeKind, number>> = {};
  for (const n of s.nodes) nodeCounts[n.kind] = (nodeCounts[n.kind] ?? 0) + 1;
  const edgeCounts: Partial<Record<EdgeKind, number>> = {};
  for (const e of s.edges) edgeCounts[e.kind] = (edgeCounts[e.kind] ?? 0) + 1;

  const meta: GraphMeta = {
    tool: "chorograph",
    version: opts.version ?? "0.0.0",
    generatedAt: new Date().toISOString(),
    name: s.systemName ?? opts.fallbackName ?? "Architecture",
    ...(s.systemDescription !== null ? { description: s.systemDescription } : {}),
    counts: { nodes: nodeCounts, edges: edgeCounts },
  };
  return { meta, nodes: [...s.nodes], edges: [...s.edges] };
}
