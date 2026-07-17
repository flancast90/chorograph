/**
 * Layout — the whole map, laid out once, everything visible.
 *
 * There is no expand/collapse: declared maps are small enough (tens to a few hundred nodes) that
 * the honest answer is to always draw everything. The algorithm is a recursive ELK pass:
 *
 *  1. Filter the graph (hidden kinds disappear entirely, along with their subtrees and edges).
 *  2. Depth-first, lay out each container's children with ELK layered. Edges are "lifted" to the
 *     deepest container that holds both endpoints, so a call from `orders` to `payments-db.charges`
 *     still pulls those containers next to each other.
 *  3. Compose absolute coordinates, then route each real edge: ELK's route when both endpoints
 *     share a parent, an orthogonal elbow between box edges otherwise.
 */
import ELK from "elkjs/lib/elk.bundled.js";
import { GEOM, headerWidth, leafWidth } from "./theme.ts";
import type { Edge, Filters, Graph, Node, PlacedEdge, PlacedNode, Scene } from "./types.ts";

const elk = new ELK();

export interface ViewGraph {
  readonly nodes: readonly Node[];
  readonly byId: ReadonlyMap<string, Node>;
  readonly children: ReadonlyMap<string, readonly Node[]>;
  readonly roots: readonly Node[];
  readonly edges: readonly Edge[];
}

/** Apply filters: a hidden node takes its whole subtree with it; edges need both endpoints alive. */
export function applyFilters(graph: Graph, filters: Filters): ViewGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const hidden = (n: Node): boolean => {
    for (let cur: Node | undefined = n; cur; cur = cur.parent ? byId.get(cur.parent) : undefined) {
      if (filters.hiddenNodeKinds.has(cur.kind)) return true;
    }
    return false;
  };

  const nodes = graph.nodes.filter((n) => !hidden(n));
  const alive = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) => !filters.hiddenEdgeKinds.has(e.kind) && alive.has(e.from) && alive.has(e.to),
  );

  const children = new Map<string, Node[]>();
  const roots: Node[] = [];
  for (const n of nodes) {
    if (n.parent === null || !alive.has(n.parent)) roots.push(n);
    else {
      const list = children.get(n.parent);
      if (list) list.push(n);
      else children.set(n.parent, [n]);
    }
  }
  return { nodes, byId: new Map(nodes.map((n) => [n.id, n])), children, roots, edges };
}

/** Walk up from `id` to the node that is a direct child of `container` (null = top level). */
function liftTo(view: ViewGraph, id: string, container: string | null): string | null {
  let cur = view.byId.get(id);
  while (cur) {
    if ((cur.parent ?? null) === container) return cur.id;
    cur = cur.parent ? view.byId.get(cur.parent) : undefined;
  }
  return null;
}

interface LocalEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

/** Edges lifted into `container`'s coordinate space, deduplicated per (from,to). */
function localEdges(view: ViewGraph, container: string | null): LocalEdge[] {
  const seen = new Map<string, LocalEdge>();
  for (const e of view.edges) {
    const from = liftTo(view, e.from, container);
    const to = liftTo(view, e.to, container);
    if (!from || !to || from === to) continue;
    const key = `${from}>${to}`;
    if (!seen.has(key)) seen.set(key, { id: `local:${container ?? "root"}:${key}`, from, to });
  }
  return [...seen.values()];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContainerLayout {
  readonly boxes: ReadonlyMap<string, Box>;
  readonly routes: ReadonlyMap<string, { x: number; y: number }[]>;
  readonly width: number;
  readonly height: number;
}

function isContainer(view: ViewGraph, n: Node): boolean {
  return (view.children.get(n.id)?.length ?? 0) > 0;
}

async function layoutChildren(
  view: ViewGraph,
  container: string | null,
  sizes: ReadonlyMap<string, { w: number; h: number }>,
): Promise<ContainerLayout> {
  const kids = container === null ? view.roots : view.children.get(container) ?? [];
  const edges = localEdges(view, container);

  const result = await elk.layout({
    id: container ?? "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "26",
      "elk.layered.spacing.nodeNodeBetweenLayers": "54",
      "elk.layered.spacing.edgeNodeBetweenLayers": "22",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      "elk.randomSeed": "1",
    },
    children: kids.map((k) => {
      const s = sizes.get(k.id)!;
      return { id: k.id, width: s.w, height: s.h };
    }),
    edges: edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  });

  const boxes = new Map<string, Box>();
  for (const c of result.children ?? []) {
    boxes.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 });
  }
  const routes = new Map<string, { x: number; y: number }[]>();
  for (const e of result.edges ?? []) {
    const sec = e.sections?.[0];
    if (!sec) continue;
    routes.set(e.id, [
      { x: sec.startPoint.x, y: sec.startPoint.y },
      ...(sec.bendPoints ?? []),
      { x: sec.endPoint.x, y: sec.endPoint.y },
    ]);
  }
  return { boxes, routes, width: result.width ?? 0, height: result.height ?? 0 };
}

export async function buildScene(graph: Graph, filters: Filters): Promise<Scene> {
  const view = applyFilters(graph, filters);
  const sizes = new Map<string, { w: number; h: number }>();
  const layouts = new Map<string, ContainerLayout>();

  // Depth-first measure: leaves have fixed sizes, containers wrap their laid-out children.
  async function measure(id: string | null): Promise<void> {
    const kids = id === null ? view.roots : view.children.get(id) ?? [];
    for (const k of kids) {
      if (isContainer(view, k)) await measure(k.id);
      else sizes.set(k.id, { w: leafWidth(k.name), h: GEOM.leafHeight });
    }
    const laid = await layoutChildren(view, id, sizes);
    layouts.set(id ?? "__root__", laid);
    if (id !== null) {
      const pad = GEOM.containerPad;
      const node = view.byId.get(id);
      sizes.set(id, {
        w: Math.max(headerWidth(node?.name ?? "", node?.tech), laid.width + pad * 2),
        h: laid.height + GEOM.headerHeight + pad * 2,
      });
    }
  }
  await measure(null);

  // Compose absolute coordinates.
  const placed: PlacedNode[] = [];
  const byId = new Map<string, PlacedNode>();
  function place(container: string | null, ox: number, oy: number, depth: number): void {
    const laid = layouts.get(container ?? "__root__");
    if (!laid) return;
    const kids = container === null ? view.roots : view.children.get(container) ?? [];
    for (const k of kids) {
      const box = laid.boxes.get(k.id);
      if (!box) continue;
      const p: PlacedNode = {
        id: k.id,
        x: ox + box.x,
        y: oy + box.y,
        width: box.width,
        height: box.height,
        node: k,
        depth,
        isContainer: isContainer(view, k),
      };
      placed.push(p);
      byId.set(k.id, p);
      if (p.isContainer) {
        place(k.id, p.x + GEOM.containerPad, p.y + GEOM.headerHeight + GEOM.containerPad, depth + 1);
      }
    }
  }
  place(null, 0, 0, 0);

  // Route real edges.
  const placedEdges: PlacedEdge[] = [];
  const routeUsed = new Set<string>();
  for (const e of view.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;

    const fromNode = view.byId.get(e.from)!;
    const toNode = view.byId.get(e.to)!;
    if ((fromNode.parent ?? null) === (toNode.parent ?? null)) {
      const container = fromNode.parent ?? null;
      const laid = layouts.get(container ?? "__root__");
      const routeId = `local:${container ?? "root"}:${e.from}>${e.to}`;
      const route = laid?.routes.get(routeId);
      // ELK draws one route per node pair; parallel edges of other kinds fall through to the elbow.
      if (route && !routeUsed.has(routeId)) {
        routeUsed.add(routeId);
        const parent = container ? byId.get(container) : null;
        const ox = parent ? parent.x + GEOM.containerPad : 0;
        const oy = parent ? parent.y + GEOM.headerHeight + GEOM.containerPad : 0;
        placedEdges.push({ edge: e, points: route.map((p) => ({ x: p.x + ox, y: p.y + oy })) });
        continue;
      }
    }
    placedEdges.push({ edge: e, points: elbow(from, to, placedEdges.length) });
  }

  const width = Math.max(320, ...placed.map((p) => p.x + p.width)) + 8;
  const height = Math.max(240, ...placed.map((p) => p.y + p.height)) + 8;
  return { placed, byId, edges: placedEdges, width, height };
}

/** Orthogonal elbow between two boxes, leaving/arriving on the facing sides. */
function elbow(from: PlacedNode, to: PlacedNode, salt: number): { x: number; y: number }[] {
  const jitter = ((salt % 5) - 2) * 6; // spread parallel elbows so they don't overdraw
  const fromCx = from.x + from.width / 2;
  const toCx = to.x + to.width / 2;

  if (to.x >= from.x + from.width + 24) {
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const mx = (x1 + x2) / 2 + jitter;
    return [
      { x: x1, y: y1 },
      { x: mx, y: y1 },
      { x: mx, y: y2 },
      { x: x2, y: y2 },
    ];
  }
  if (from.x >= to.x + to.width + 24) {
    const x1 = from.x;
    const y1 = from.y + from.height / 2;
    const x2 = to.x + to.width;
    const y2 = to.y + to.height / 2;
    const mx = (x1 + x2) / 2 + jitter;
    return [
      { x: x1, y: y1 },
      { x: mx, y: y1 },
      { x: mx, y: y2 },
      { x: x2, y: y2 },
    ];
  }
  // Vertically stacked or overlapping: route top/bottom.
  const goingDown = to.y > from.y + from.height;
  const y1 = goingDown ? from.y + from.height : from.y;
  const y2 = goingDown ? to.y : to.y + to.height;
  const my = (y1 + y2) / 2 + jitter;
  return [
    { x: fromCx, y: y1 },
    { x: fromCx, y: my },
    { x: toCx, y: my },
    { x: toCx, y: y2 },
  ];
}
