/**
 * Lazy, deterministic ELK layouts per expanded container. Cached by
 * (containerId + sorted child ids + local edge signature).
 *
 * @chorograph group="Viewer" role=usecase comms=in-proc talksTo=elkjs
 */
import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphIndex } from "./index-graph.ts";
import { localRolledEdges } from "./rollup.ts";
import { NODE_H, NODE_W } from "./theme.ts";
import type { AbsBox, ContainerLayout, LayoutBox, LayoutEdge, Node, RolledEdge } from "./types.ts";

const elk = new ELK();

const cache = new Map<string, ContainerLayout>();

function leafSize(node: Node, childCount: number, expanded: boolean): { w: number; h: number } {
  if (node.containment === "region") {
    if (!expanded) return { w: NODE_W.region, h: NODE_H.regionCollapsed };
    // Expanded size comes from ELK of children; placeholder for parent pass.
    return { w: NODE_W.region, h: NODE_H.regionCollapsed };
  }
  if (node.containment === "module") {
    if (expanded && childCount > 0) return { w: NODE_W.module + 40, h: NODE_H.module };
    return { w: NODE_W.module, h: NODE_H.module };
  }
  if (node.containment === "external") return { w: NODE_W.external, h: NODE_H.external };
  return { w: NODE_W.symbol, h: NODE_H.symbol };
}

function cacheKey(containerId: string, childIds: string[], edgeSig: string): string {
  return `${containerId}|${childIds.join(",")}|${edgeSig}`;
}

export async function layoutContainer(
  containerId: string,
  children: readonly Node[],
  localEdges: readonly RolledEdge[],
  childSizes: ReadonlyMap<string, { w: number; h: number }>,
): Promise<ContainerLayout> {
  const childIds = children.map((c) => c.id);
  const edgeSig = localEdges.map((e) => `${e.from}>${e.to}:${e.comms}:${e.weight}`).join(";");
  const key = cacheKey(containerId, childIds, edgeSig + "|" + [...childSizes.entries()].map(([id, s]) => `${id}:${s.w}x${s.h}`).join(","));
  const hit = cache.get(key);
  if (hit) return hit;

  if (children.length === 0) {
    const empty: ContainerLayout = { boxes: new Map(), edges: new Map(), width: NODE_W.region, height: NODE_H.regionCollapsed };
    cache.set(key, empty);
    return empty;
  }

  // Dense leaf grids skip ELK when there are no intra-edges — much faster for huge ungrouped dumps.
  if (localEdges.length === 0 && children.length > 80) {
    const laid = gridLayout(children, childSizes);
    cache.set(key, laid);
    return laid;
  }

  const graph = {
    id: containerId,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.padding": "[top=12,left=12,bottom=12,right=12]",
      "elk.layered.nodePlacement.strategy": children.length > 120 ? "SIMPLE" : "BRANDES_KOEPF",
      // Deterministic tie-break.
      "elk.randomSeed": "1",
    },
    children: children.map((c) => {
      const s = childSizes.get(c.id) ?? leafSize(c, 0, false);
      return { id: c.id, width: s.w, height: s.h };
    }),
    edges: localEdges.map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    })),
  };

  const result = await elk.layout(graph);
  const boxes = new Map<string, LayoutBox>();
  for (const c of result.children ?? []) {
    boxes.set(c.id, {
      id: c.id,
      x: c.x ?? 0,
      y: c.y ?? 0,
      width: c.width ?? 0,
      height: c.height ?? 0,
    });
  }
  const edges = new Map<string, LayoutEdge>();
  for (const e of result.edges ?? []) {
    const sections = (e.sections ?? []).map((s) => ({
      points: [
        { x: s.startPoint.x, y: s.startPoint.y },
        ...(s.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
        { x: s.endPoint.x, y: s.endPoint.y },
      ],
    }));
    edges.set(e.id, { id: e.id, sections });
  }

  const laid: ContainerLayout = {
    boxes,
    edges,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
  cache.set(key, laid);
  return laid;
}

function gridLayout(
  children: readonly Node[],
  childSizes: ReadonlyMap<string, { w: number; h: number }>,
): ContainerLayout {
  const cols = Math.ceil(Math.sqrt(children.length));
  const gap = 16;
  const boxes = new Map<string, LayoutBox>();
  let maxW = 0;
  let maxH = 0;
  let rowH = 0;
  let x = 12;
  let y = 12;
  let col = 0;
  for (const c of children) {
    const s = childSizes.get(c.id) ?? leafSize(c, 0, false);
    if (col >= cols) {
      x = 12;
      y += rowH + gap;
      rowH = 0;
      col = 0;
    }
    boxes.set(c.id, { id: c.id, x, y, width: s.w, height: s.h });
    x += s.w + gap;
    rowH = Math.max(rowH, s.h);
    maxW = Math.max(maxW, x);
    maxH = Math.max(maxH, y + s.h);
    col++;
  }
  return { boxes, edges: new Map(), width: maxW + 12, height: maxH + 12 };
}

export interface Scene {
  readonly boxes: AbsBox[];
  readonly byId: ReadonlyMap<string, AbsBox>;
  readonly edgePaths: ReadonlyMap<string, string>;
  readonly width: number;
  readonly height: number;
}

/**
 * Recursively lay out the expanded frontier and compose absolute coordinates.
 * Local ELK edge routes are preferred; cross-container edges get orthogonal elbows.
 */
export async function buildScene(
  index: GraphIndex,
  expanded: ReadonlySet<string>,
  visible: ReadonlySet<string>,
  rolled: readonly RolledEdge[],
): Promise<Scene> {
  const sizeCache = new Map<string, { w: number; h: number }>();
  const layoutCache = new Map<string, ContainerLayout>();

  async function measure(id: string | null): Promise<{ w: number; h: number }> {
    const kids = (id === null ? index.roots : index.children.get(id) ?? []).filter((n) => visible.has(n.id));
    if (id !== null && !expanded.has(id)) {
      const node = index.byId.get(id);
      if (!node) return { w: NODE_W.region, h: NODE_H.regionCollapsed };
      const s = leafSize(node, index.children.get(id)?.length ?? 0, false);
      sizeCache.set(id, s);
      return s;
    }

    // Expanded (or root): size children first (depth-first), then lay out.
    for (const k of kids) {
      if (expanded.has(k.id)) await measure(k.id);
      else {
        const s = leafSize(k, index.children.get(k.id)?.length ?? 0, false);
        sizeCache.set(k.id, s);
      }
    }

    const childSizes = new Map<string, { w: number; h: number }>();
    for (const k of kids) {
      childSizes.set(k.id, sizeCache.get(k.id) ?? leafSize(k, 0, false));
    }
    const local = localRolledEdges(rolled, index, id);
    const containerKey = id ?? "__root__";
    const laid = await layoutContainer(containerKey, kids, local, childSizes);
    layoutCache.set(containerKey, laid);

    if (id === null) {
      return { w: laid.width, h: laid.height };
    }

    const header = NODE_H.header;
    const pad = NODE_H.pad;
    const w = Math.max(NODE_W.region, laid.width + pad * 2);
    const h = Math.max(NODE_H.regionCollapsed, laid.height + header + pad);
    const s = { w, h };
    sizeCache.set(id, s);
    return s;
  }

  await measure(null);

  const absBoxes: AbsBox[] = [];
  const byId = new Map<string, AbsBox>();

  function place(containerId: string | null, ox: number, oy: number): void {
    const key = containerId ?? "__root__";
    const laid = layoutCache.get(key);
    if (!laid) return;
    const kids = (containerId === null ? index.roots : index.children.get(containerId) ?? []).filter((n) =>
      visible.has(n.id),
    );
    const header = containerId === null ? 0 : NODE_H.header;
    const pad = containerId === null ? 0 : NODE_H.pad;

    for (const k of kids) {
      const box = laid.boxes.get(k.id);
      if (!box) continue;
      const size = sizeCache.get(k.id) ?? { w: box.width, h: box.height };
      const abs: AbsBox = {
        id: k.id,
        x: ox + pad + box.x,
        y: oy + header + pad + box.y,
        width: size.w,
        height: size.h,
        node: k,
        childCount: index.children.get(k.id)?.length ?? 0,
        expanded: expanded.has(k.id),
      };
      absBoxes.push(abs);
      byId.set(k.id, abs);
      if (expanded.has(k.id)) place(k.id, abs.x, abs.y);
    }
  }

  place(null, 0, 0);

  const rootLaid = layoutCache.get("__root__");
  const width = Math.max(rootLaid?.width ?? 800, ...absBoxes.map((b) => b.x + b.width)) + 48;
  const height = Math.max(rootLaid?.height ?? 600, ...absBoxes.map((b) => b.y + b.height)) + 48;

  // Build edge paths: prefer ELK sections (translated to absolute), else orthogonal.
  const edgePaths = new Map<string, string>();
  for (const e of rolled) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;

    // Same parent → look for ELK route in that container.
    const fromNode = index.byId.get(e.from);
    const toNode = index.byId.get(e.to);
    const parent = fromNode?.parent ?? null;
    if (fromNode && toNode && fromNode.parent === toNode.parent) {
      const laid = layoutCache.get(parent ?? "__root__");
      const local = laid?.edges.get(e.id);
      if (local && local.sections.length > 0) {
        const parentBox = parent ? byId.get(parent) : null;
        const ox = parentBox ? parentBox.x + NODE_H.pad : 0;
        const oy = parentBox ? parentBox.y + NODE_H.header + NODE_H.pad : 0;
        const d = local.sections
          .map((sec) => {
            const pts = sec.points;
            if (pts.length === 0) return "";
            let s = `M ${pts[0]!.x + ox} ${pts[0]!.y + oy}`;
            for (let i = 1; i < pts.length; i++) s += ` L ${pts[i]!.x + ox} ${pts[i]!.y + oy}`;
            return s;
          })
          .join(" ");
        if (d) {
          edgePaths.set(e.id, d);
          continue;
        }
      }
    }

    edgePaths.set(e.id, orthogonalPath(from, to));
  }

  return { boxes: absBoxes, byId, edgePaths, width, height };
}

function orthogonalPath(from: AbsBox, to: AbsBox): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  // Leave from right center, arrive at left center, with a mid elbow.
  if (x2 >= x1 + 16) {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
  }
  // Back-edge: route above.
  const midY = Math.min(from.y, to.y) - 20;
  return `M ${x1} ${y1} L ${x1 + 16} ${y1} L ${x1 + 16} ${midY} L ${x2 - 16} ${midY} L ${x2 - 16} ${y2} L ${x2} ${y2}`;
}

export function clearLayoutCache(): void {
  cache.clear();
}
