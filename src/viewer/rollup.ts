/**
 * Directed edge roll-up: when a container is collapsed, cross-boundary edges
 * aggregate onto the visible ancestors with summed weight.
 *
 * @chorograph group="Viewer" role=usecase comms=in-proc
 */
import type { GraphIndex } from "./index-graph.ts";
import type { EdgeDiff, RolledEdge } from "./types.ts";

function mergeDiff(a: EdgeDiff | undefined, b: EdgeDiff | undefined): EdgeDiff | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return undefined; // mixed added+removed → neutral (comms color)
}

export function rollupEdges(index: GraphIndex, visible: ReadonlySet<string>): RolledEdge[] {
  const buckets = new Map<
    string,
    { from: string; to: string; comms: string; weight: number; underlying: string[]; diff?: EdgeDiff }
  >();

  for (const e of index.graph.edges) {
    const from = index.visibleAncestor(e.from, visible);
    const to = index.visibleAncestor(e.to, visible);
    if (!from || !to || from === to) continue;

    // Keep comms + diff separate so added/removed don't collapse into one line.
    const key = `${from}\0${to}\0${e.comms}\0${e.diff ?? ""}`;
    const hit = buckets.get(key);
    if (hit) {
      hit.weight += e.weight;
      hit.underlying.push(e.id);
      const merged = mergeDiff(hit.diff, e.diff);
      if (merged) hit.diff = merged;
      else delete hit.diff;
    } else {
      const entry: {
        from: string;
        to: string;
        comms: string;
        weight: number;
        underlying: string[];
        diff?: EdgeDiff;
      } = { from, to, comms: e.comms, weight: e.weight, underlying: [e.id] };
      if (e.diff) entry.diff = e.diff;
      buckets.set(key, entry);
    }
  }

  const out: RolledEdge[] = [];
  for (const b of buckets.values()) {
    const edge: RolledEdge = {
      id: `roll:${b.from}->${b.to}:${b.comms}:${b.diff ?? ""}`,
      from: b.from,
      to: b.to,
      comms: b.comms,
      weight: b.weight,
      underlying: b.underlying,
    };
    out.push(b.diff ? { ...edge, diff: b.diff } : edge);
  }
  return out;
}

/** Edges whose endpoints are both direct children of `containerId` (after rollup to visible set). */
export function localRolledEdges(
  rolled: readonly RolledEdge[],
  index: GraphIndex,
  containerId: string | null,
): RolledEdge[] {
  return rolled.filter((e) => {
    const a = index.byId.get(e.from);
    const b = index.byId.get(e.to);
    if (!a || !b) return false;
    return a.parent === containerId && b.parent === containerId;
  });
}
