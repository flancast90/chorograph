/**
 * Graph indexes for O(1) containment walks, dead lookups, and filter matching.
 *
 * @chorograph group="Viewer" role=usecase comms=in-proc
 */
import type { Edge, Filters, Graph, Node } from "./types.ts";
import { MIN_SEED_VISIBLE, SEED_PREVIEW_CHILDREN, SHALLOW_EXPAND_MAX } from "./theme.ts";

export interface GraphIndex {
  readonly graph: Graph;
  readonly byId: ReadonlyMap<string, Node>;
  readonly children: ReadonlyMap<string, readonly Node[]>;
  readonly roots: readonly Node[];
  readonly orphan: ReadonlySet<string>;
  readonly unreachable: ReadonlySet<string>;
  readonly deprecated: ReadonlySet<string>;
  readonly inbound: ReadonlyMap<string, readonly Edge[]>;
  readonly outbound: ReadonlyMap<string, readonly Edge[]>;
  /** All distinct comms values present on edges or nodes. */
  readonly allComms: readonly string[];
  descendantCount(id: string): number;
  ancestors(id: string): string[];
  /** Walk up until a node in `visible` is found (inclusive of self if visible). */
  visibleAncestor(id: string, visible: ReadonlySet<string>): string | null;
  nodeMatches(node: Node, filters: Filters): boolean;
  /** True if node or any descendant matches filters (for container recession). */
  subtreeMatches(id: string, filters: Filters): boolean;
}

export function buildIndex(graph: Graph): GraphIndex {
  const byId = new Map<string, Node>();
  const children = new Map<string, Node[]>();
  const roots: Node[] = [];

  for (const n of graph.nodes) {
    byId.set(n.id, n);
    if (n.parent === null) roots.push(n);
    else {
      const list = children.get(n.parent);
      if (list) list.push(n);
      else children.set(n.parent, [n]);
    }
  }

  // Stable order: regions first, then modules, symbols, externals; label within.
  const rank = (c: Node["containment"]) =>
    c === "region" ? 0 : c === "module" ? 1 : c === "external" ? 2 : 3;
  for (const list of children.values()) {
    list.sort((a, b) => rank(a.containment) - rank(b.containment) || a.label.localeCompare(b.label));
  }
  roots.sort((a, b) => rank(a.containment) - rank(b.containment) || a.label.localeCompare(b.label));

  const orphan = new Set(graph.dead.orphans);
  const unreachable = new Set(graph.dead.unreachable);
  const deprecated = new Set(graph.dead.deprecated);

  const inbound = new Map<string, Edge[]>();
  const outbound = new Map<string, Edge[]>();
  const commsSet = new Set<string>();
  for (const e of graph.edges) {
    commsSet.add(e.comms);
    const outs = outbound.get(e.from);
    if (outs) outs.push(e);
    else outbound.set(e.from, [e]);
    const ins = inbound.get(e.to);
    if (ins) ins.push(e);
    else inbound.set(e.to, [e]);
  }
  for (const n of graph.nodes) for (const c of n.comms) commsSet.add(c);

  const descCache = new Map<string, number>();
  function descendantCount(id: string): number {
    const hit = descCache.get(id);
    if (hit !== undefined) return hit;
    const kids = children.get(id) ?? [];
    let n = kids.length;
    for (const k of kids) n += descendantCount(k.id);
    descCache.set(id, n);
    return n;
  }

  function ancestors(id: string): string[] {
    const out: string[] = [];
    let cur = byId.get(id)?.parent ?? null;
    while (cur) {
      out.push(cur);
      cur = byId.get(cur)?.parent ?? null;
    }
    return out;
  }

  function visibleAncestor(id: string, visible: ReadonlySet<string>): string | null {
    let cur: string | null = id;
    while (cur) {
      if (visible.has(cur)) return cur;
      cur = byId.get(cur)?.parent ?? null;
    }
    return null;
  }

  function nodeMatches(node: Node, filters: Filters): boolean {
    if (filters.deadOnly) {
      const dead = orphan.has(node.id) || unreachable.has(node.id) || deprecated.has(node.id) || node.status === "deprecated";
      if (!dead) return false;
    }
    if (filters.roles.size > 0) {
      if (!node.roles.some((r) => filters.roles.has(r))) return false;
    }
    if (filters.comms.size > 0) {
      const nodeHit = node.comms.some((c) => filters.comms.has(c));
      if (!nodeHit) {
        // Also match if any incident edge uses the comms.
        const edges = [...(inbound.get(node.id) ?? []), ...(outbound.get(node.id) ?? [])];
        if (!edges.some((e) => filters.comms.has(e.comms))) return false;
      }
    }
    return true;
  }

  const subtreeCache = new Map<string, boolean>();
  let subtreeFilterKey = "";
  function subtreeMatches(id: string, filters: Filters): boolean {
    const key = `${filters.deadOnly}|${[...filters.roles].sort().join(",")}|${[...filters.comms].sort().join(",")}`;
    if (key !== subtreeFilterKey) {
      subtreeCache.clear();
      subtreeFilterKey = key;
    }
    const hit = subtreeCache.get(id);
    if (hit !== undefined) return hit;
    const node = byId.get(id);
    if (!node) return false;
    if (nodeMatches(node, filters)) {
      subtreeCache.set(id, true);
      return true;
    }
    for (const k of children.get(id) ?? []) {
      if (subtreeMatches(k.id, filters)) {
        subtreeCache.set(id, true);
        return true;
      }
    }
    subtreeCache.set(id, false);
    return false;
  }

  return {
    graph,
    byId,
    children,
    roots,
    orphan,
    unreachable,
    deprecated,
    inbound,
    outbound,
    allComms: [...commsSet].sort(),
    descendantCount,
    ancestors,
    visibleAncestor,
    nodeMatches,
    subtreeMatches,
  };
}

function childDegree(index: GraphIndex, id: string): number {
  return (index.inbound.get(id)?.length ?? 0) + (index.outbound.get(id)?.length ?? 0);
}

/** Prefer heavy / well-connected children when preview-capping a huge region. */
export function rankChildren(index: GraphIndex, kids: readonly Node[]): Node[] {
  return kids.slice().sort((a, b) => {
    const dw = (b.weight ?? 0) - (a.weight ?? 0);
    if (dw) return dw;
    const dd = childDegree(index, b.id) - childDegree(index, a.id);
    if (dd) return dd;
    return a.label.localeCompare(b.label);
  });
}

/** Nodes currently drawn: roots always; children of expanded containers. */
export function visibleFrontier(
  index: GraphIndex,
  expanded: ReadonlySet<string>,
  filters?: Filters,
  childCaps?: ReadonlyMap<string, number>,
): Set<string> {
  const filterActive =
    !!filters && (filters.roles.size > 0 || filters.comms.size > 0 || filters.deadOnly);
  const vis = new Set<string>();
  for (const r of index.roots) vis.add(r.id);
  const queue = [...index.roots.map((r) => r.id)];
  while (queue.length) {
    const id = queue.pop()!;
    if (!expanded.has(id)) continue;
    let kids = index.children.get(id) ?? [];
    if (filterActive && kids.length > SHALLOW_EXPAND_MAX) {
      kids = kids.filter((k) => index.subtreeMatches(k.id, filters!));
    } else {
      const cap = childCaps?.get(id);
      if (cap !== undefined && kids.length > cap) {
        kids = rankChildren(index, kids).slice(0, cap);
      }
    }
    for (const c of kids) {
      vis.add(c.id);
      queue.push(c.id);
    }
  }
  return vis;
}

export function defaultExpanded(index: GraphIndex, maxChildren: number): Set<string> {
  const exp = new Set<string>();
  for (const r of index.roots) {
    const kids = index.children.get(r.id) ?? [];
    if (kids.length > 0 && kids.length <= maxChildren) exp.add(r.id);
  }
  return exp;
}

/**
 * Ensure the initial map isn't empty when one huge region dominates.
 * Expands the largest collapsed roots; huge ones get a top-N child preview cap.
 */
export function seedExpanded(
  index: GraphIndex,
  maxChildren = SHALLOW_EXPAND_MAX,
  minVisible = MIN_SEED_VISIBLE,
  previewN = SEED_PREVIEW_CHILDREN,
): { expanded: Set<string>; childCaps: Map<string, number> } {
  const expanded = defaultExpanded(index, maxChildren);
  const childCaps = new Map<string, number>();

  const countVisible = () => visibleFrontier(index, expanded, undefined, childCaps).size;

  let visible = countVisible();
  const candidates = index.roots
    .filter((r) => !expanded.has(r.id) && (index.children.get(r.id)?.length ?? 0) > 0)
    .sort((a, b) => (index.children.get(b.id)?.length ?? 0) - (index.children.get(a.id)?.length ?? 0));

  for (const r of candidates) {
    if (visible >= minVisible) break;
    const kids = index.children.get(r.id) ?? [];
    expanded.add(r.id);
    if (kids.length > maxChildren) childCaps.set(r.id, previewN);
    visible = countVisible();
  }

  return { expanded, childCaps };
}

export function searchNodes(index: GraphIndex, q: string): Node[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const out: Node[] = [];
  for (const n of index.graph.nodes) {
    const hay = [n.label, n.id, n.group ?? "", n.file ?? "", ...n.roles, ...n.tags].join(" ").toLowerCase();
    if (hay.includes(needle)) out.push(n);
  }
  return out.slice(0, 200);
}

export function expandToReveal(
  index: GraphIndex,
  ids: readonly string[],
  expanded: Set<string>,
  maxAutoExpand = SHALLOW_EXPAND_MAX,
): Set<string> {
  const next = new Set(expanded);
  for (const id of ids) {
    const chain = [...index.ancestors(id)].reverse(); // root → … → parent
    const node = index.byId.get(id);
    if (node?.parent) chain.push(node.parent);
    for (const a of chain) {
      const kids = index.children.get(a)?.length ?? 0;
      // Don't blow open huge ungrouped dumps just to reveal a couple of hits.
      if (kids > maxAutoExpand) continue;
      next.add(a);
    }
  }
  return next;
}
