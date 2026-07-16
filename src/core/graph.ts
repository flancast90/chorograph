/**
 * Graph assembly — the language-agnostic core that turns a {@link ProviderResult} into a {@link Graph}.
 *
 * It synthesises the region tree from each node's `group` path (derived from the directory tree by
 * default, or an annotation override), wires every node to its containment parent, computes deadness
 * on two axes (structural orphans and reachability from declared entrypoints), and stamps metadata.
 * Providers stay dumb; this is where the shape is made.
 *
 * @chorograph group="Core" role=usecase comms=in-proc
 */
import type { Dead, Edge, Graph, GraphMeta, Node, ProviderResult } from "./model.ts";

const UNGROUPED = "Ungrouped";
const EXTERNAL_GROUP = "External Systems";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const regionId = (segments: readonly string[]): string => `region:${segments.map(slug).join("/")}`;

/** Ensure a region chain exists for a slash path, returning the deepest region's id. */
function ensureRegionChain(path: string, regions: Map<string, Node>): string {
  const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return ensureRegionChain(UNGROUPED, regions);
  let parent: string | null = null;
  let acc: string[] = [];
  let lastId = "";
  for (const seg of segments) {
    acc = [...acc, seg];
    const id = regionId(acc);
    if (!regions.has(id)) {
      regions.set(id, {
        id,
        label: seg,
        containment: "region",
        parent,
        roles: [],
        comms: [],
        status: "active",
        tags: [],
        weight: 0,
      });
    }
    parent = id;
    lastId = id;
  }
  return lastId;
}

export interface AssembleOptions {
  readonly root: string;
  readonly provider: string;
  readonly version: string;
}

/** Assemble the final graph from a provider's flat result. */
export function assemble(result: ProviderResult, opts: AssembleOptions): Graph {
  const regions = new Map<string, Node>();
  const leaves = new Map<string, Node>();
  for (const n of result.nodes) leaves.set(n.id, n);

  // A file with no module-level group inherits the group of its first grouped symbol.
  const groupOfModule = new Map<string, string>();
  for (const n of result.nodes) {
    if (n.containment === "module" && n.group !== undefined) groupOfModule.set(n.id, n.group);
  }
  for (const n of result.nodes) {
    if (n.containment === "symbol" && n.parent && n.group !== undefined && !groupOfModule.has(n.parent)) {
      groupOfModule.set(n.parent, n.group);
    }
  }

  // Wire parents: modules → region(group); symbols keep module parent; externals → External region.
  const wired: Node[] = result.nodes.map((n) => {
    if (n.containment === "module") {
      const group = groupOfModule.get(n.id) ?? UNGROUPED;
      return { ...n, parent: ensureRegionChain(group, regions) };
    }
    if (n.containment === "external") {
      return { ...n, parent: ensureRegionChain(EXTERNAL_GROUP, regions) };
    }
    if (n.containment === "symbol" && (n.parent === null || !leaves.has(n.parent))) {
      // A symbol whose file produced no module node (rare) lands directly in its region.
      return { ...n, parent: ensureRegionChain(n.group ?? UNGROUPED, regions) };
    }
    return n;
  });

  const nodes: Node[] = [...regions.values(), ...wired];
  const edges = result.edges;

  // Region weights = descendant leaf count, rolled up.
  const byParent = new Map<string, Node[]>();
  for (const n of nodes) {
    if (n.parent === null) continue;
    const arr = byParent.get(n.parent) ?? [];
    arr.push(n);
    byParent.set(n.parent, arr);
  }
  const weightOf = (id: string): number => {
    const children = byParent.get(id) ?? [];
    if (children.length === 0) return 1;
    return children.reduce((sum, c) => sum + (c.containment === "region" ? weightOf(c.id) : 1), 0);
  };
  const withWeights: Node[] = nodes.map((n) =>
    n.containment === "region" ? { ...n, weight: weightOf(n.id) } : n,
  );

  const dead = computeDead(withWeights, edges, byParent);
  const meta = computeMeta(withWeights, edges, opts);
  return { meta, nodes: withWeights, edges, dead };
}

function computeDead(nodes: readonly Node[], edges: readonly Edge[], byParent: Map<string, Node[]>): Dead {
  const inbound = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1);
    const arr = adjacency.get(e.from) ?? [];
    arr.push(e.to);
    adjacency.set(e.from, arr);
  }

  // Effective inbound for a module folds in edges landing on its symbols.
  const effectiveInbound = (n: Node): number => {
    let sum = inbound.get(n.id) ?? 0;
    if (n.containment === "module") {
      for (const child of byParent.get(n.id) ?? []) sum += inbound.get(child.id) ?? 0;
    }
    return sum;
  };

  const orphans = nodes
    .filter((n) => (n.containment === "module" || n.containment === "symbol") && !n.root && effectiveInbound(n) === 0)
    .map((n) => n.id);

  const deprecated = nodes.filter((n) => n.status === "deprecated").map((n) => n.id);

  // Reachability from declared entrypoints — only meaningful if any roots were declared.
  const roots = nodes.filter((n) => n.root).map((n) => n.id);
  let unreachable: string[] = [];
  if (roots.length > 0) {
    const seen = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const next of adjacency.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    unreachable = nodes
      .filter((n) => (n.containment === "module" || n.containment === "symbol") && !seen.has(n.id))
      .map((n) => n.id);
  }

  return { orphans, unreachable, deprecated };
}

function computeMeta(nodes: readonly Node[], edges: readonly Edge[], opts: AssembleOptions): GraphMeta {
  const counts = { regions: 0, modules: 0, symbols: 0, externals: 0, edges: edges.length };
  const roles: Record<string, number> = {};
  for (const n of nodes) {
    if (n.containment === "region") counts.regions++;
    else if (n.containment === "module") counts.modules++;
    else if (n.containment === "symbol") counts.symbols++;
    else if (n.containment === "external") counts.externals++;
    for (const r of n.roles) roles[r] = (roles[r] ?? 0) + 1;
  }
  return {
    tool: "chorograph",
    version: opts.version,
    generatedAt: new Date().toISOString(),
    root: opts.root,
    provider: opts.provider,
    counts,
    roles,
  };
}
