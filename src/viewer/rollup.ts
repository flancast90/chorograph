/**
 * Directed edge roll-up: when a container is collapsed, cross-boundary edges
 * aggregate onto the visible ancestors with summed weight.
 *
 * @chorograph group="Viewer" role=usecase comms=in-proc
 */
import type { GraphIndex } from "./index-graph.ts";
import type { RolledEdge } from "./types.ts";

export function rollupEdges(index: GraphIndex, visible: ReadonlySet<string>): RolledEdge[] {
  const buckets = new Map<string, { from: string; to: string; comms: string; weight: number; underlying: string[] }>();

  for (const e of index.graph.edges) {
    const from = index.visibleAncestor(e.from, visible);
    const to = index.visibleAncestor(e.to, visible);
    if (!from || !to || from === to) continue;

    // Prefer keeping the dominant comms for the bucket key so mixed-comms pairs stay separate.
    const key = `${from}\0${to}\0${e.comms}`;
    const hit = buckets.get(key);
    if (hit) {
      hit.weight += e.weight;
      hit.underlying.push(e.id);
    } else {
      buckets.set(key, { from, to, comms: e.comms, weight: e.weight, underlying: [e.id] });
    }
  }

  const out: RolledEdge[] = [];
  for (const b of buckets.values()) {
    out.push({
      id: `roll:${b.from}->${b.to}:${b.comms}`,
      from: b.from,
      to: b.to,
      comms: b.comms,
      weight: b.weight,
      underlying: b.underlying,
    });
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
