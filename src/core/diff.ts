/**
 * Diff two assembled graphs into a single merged overlay for review.
 *
 * Match by stable `id`. The result is the head graph plus base-only nodes/edges re-injected and
 * marked `removed`, so the viewer can render additions, deletions, and blast radius from one Graph.
 *
 * @chorograph group="Core" role=usecase comms=in-proc
 */
import { assemble } from "./graph.ts";
import type { DiffMeta, Edge, EdgeDiff, Graph, Node, NodeDiff } from "./model.ts";

export interface DiffOptions {
  readonly baseLabel: string;
  readonly headLabel: string;
}

function eqList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

/** Semantic fingerprint — structural id is already matched; this catches content drift. */
function nodeChanged(a: Node, b: Node): boolean {
  return (
    a.label !== b.label ||
    a.status !== b.status ||
    a.group !== b.group ||
    a.symbolType !== b.symbolType ||
    a.description !== b.description ||
    !eqList(a.roles, b.roles) ||
    !eqList(a.comms, b.comms)
  );
}

function stripDiff(n: Node): Node {
  if (n.diff === undefined) return n;
  const { diff: _d, ...rest } = n;
  return rest;
}

/**
 * Merge `base` → `head` into one annotated graph.
 * Regions are re-assembled from leaf nodes so removed modules still nest under their groups.
 */
export function diffGraphs(base: Graph, head: Graph, opts: DiffOptions): Graph {
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const headNodes = new Map(head.nodes.map((n) => [n.id, n]));
  const baseEdges = new Map(base.edges.map((e) => [e.id, e]));
  const headEdges = new Map(head.edges.map((e) => [e.id, e]));

  const edgeDiffs = new Map<string, EdgeDiff>();
  const changedEndpoints = new Set<string>();

  for (const [id, e] of headEdges) {
    if (!baseEdges.has(id)) {
      edgeDiffs.set(id, "added");
      changedEndpoints.add(e.from);
      changedEndpoints.add(e.to);
    }
  }
  for (const [id, e] of baseEdges) {
    if (!headEdges.has(id)) {
      edgeDiffs.set(id, "removed");
      changedEndpoints.add(e.from);
      changedEndpoints.add(e.to);
    }
  }

  const leafDiff = new Map<string, NodeDiff>();
  const leaves: Node[] = [];

  for (const n of head.nodes) {
    if (n.containment === "region") continue;
    const b = baseNodes.get(n.id);
    let d: NodeDiff | undefined;
    if (!b) d = "added";
    else if (nodeChanged(b, n) || changedEndpoints.has(n.id)) d = "touched";
    if (d) leafDiff.set(n.id, d);
    leaves.push(d ? { ...stripDiff(n), diff: d } : stripDiff(n));
  }

  for (const n of base.nodes) {
    if (n.containment === "region") continue;
    if (headNodes.has(n.id)) continue;
    leafDiff.set(n.id, "removed");
    leaves.push({ ...stripDiff(n), parent: null, diff: "removed" });
  }

  const edges: Edge[] = [];
  for (const e of head.edges) {
    const d = edgeDiffs.get(e.id);
    edges.push(d ? { ...e, diff: d } : e);
  }
  for (const e of base.edges) {
    if (headEdges.has(e.id)) continue;
    edges.push({ ...e, diff: "removed" });
  }

  const assembled = assemble(
    { nodes: leaves.map((n) => ({ ...n, parent: n.containment === "symbol" ? n.parent : null })), edges },
    {
      root: head.meta.root,
      provider: head.meta.provider,
      version: head.meta.version,
    },
  );

  // Re-stamp leaf diffs (assemble may have rebuilt parents) and classify regions.
  const byParent = new Map<string, string[]>();
  for (const n of assembled.nodes) {
    if (n.parent) {
      const arr = byParent.get(n.parent) ?? [];
      arr.push(n.id);
      byParent.set(n.parent, arr);
    }
  }

  const stamped = new Map<string, NodeDiff | undefined>();
  for (const [id, d] of leafDiff) stamped.set(id, d);

  const hasChangedDesc = (id: string): boolean => {
    if (stamped.get(id)) return true;
    for (const c of byParent.get(id) ?? []) {
      if (hasChangedDesc(c)) return true;
    }
    return false;
  };

  const nodes: Node[] = assembled.nodes.map((n) => {
    if (n.containment !== "region") {
      const d = leafDiff.get(n.id);
      return d ? { ...n, diff: d } : n;
    }
    const inHead = headNodes.has(n.id);
    const inBase = baseNodes.has(n.id);
    let d: NodeDiff | undefined;
    if (inHead && !inBase) d = "added";
    else if (!inHead && inBase) d = "removed";
    else if (inHead && inBase && hasChangedDesc(n.id)) d = "touched";
    else if (!inHead && !inBase && hasChangedDesc(n.id)) {
      // Synthesised only for removed/added leaves — mark like its children.
      const kids = byParent.get(n.id) ?? [];
      const kidDiffs = kids.map((k) => stamped.get(k)).filter(Boolean);
      if (kidDiffs.length > 0 && kidDiffs.every((x) => x === "removed")) d = "removed";
      else if (kidDiffs.length > 0 && kidDiffs.every((x) => x === "added")) d = "added";
      else d = "touched";
    }
    if (d) stamped.set(n.id, d);
    return d ? { ...n, diff: d } : n;
  });

  // Preserve edge diffs after assemble (assemble passes edges through).
  const outEdges = assembled.edges.map((e) => {
    const d = edgeDiffs.get(e.id);
    return d ? { ...e, diff: d } : e;
  });

  let nodesAdded = 0;
  let nodesRemoved = 0;
  let nodesTouched = 0;
  for (const n of nodes) {
    if (n.containment === "region") continue; // summary counts leaves (modules/symbols/externals)
    if (n.diff === "added") nodesAdded++;
    else if (n.diff === "removed") nodesRemoved++;
    else if (n.diff === "touched") nodesTouched++;
  }
  let edgesAdded = 0;
  let edgesRemoved = 0;
  for (const e of outEdges) {
    if (e.diff === "added") edgesAdded++;
    else if (e.diff === "removed") edgesRemoved++;
  }

  const diffMeta: DiffMeta = {
    base: opts.baseLabel,
    head: opts.headLabel,
    nodesAdded,
    nodesRemoved,
    nodesTouched,
    edgesAdded,
    edgesRemoved,
  };

  return {
    meta: { ...assembled.meta, root: head.meta.root, diff: diffMeta },
    nodes,
    edges: outEdges,
    dead: assembled.dead,
  };
}
