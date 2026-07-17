/**
 * Viewer-side shapes, plus the Graph contract re-exported from the generated module.
 *
 * The viewer must not import core (the report bundle stays browser-only), so it carries its own
 * generated copy of the contract in `model.gen.ts` — same `spec/contract.json`, same output.
 */
import type { Edge, EdgeKind, Graph, Node, NodeKind } from "./model.gen.ts";

export type { NodeKind, EdgeKind, Node, Edge, GraphCounts, GraphMeta, Graph } from "./model.gen.ts";
export { NODE_KINDS, EDGE_KINDS } from "./model.gen.ts";

declare global {
  interface Window {
    __CHOROGRAPH__: Graph;
  }
}

/** What the user has chosen to see. Hiding a kind removes those nodes (and their edges) entirely. */
export interface Filters {
  readonly hiddenNodeKinds: ReadonlySet<NodeKind>;
  readonly hiddenEdgeKinds: ReadonlySet<EdgeKind>;
}

/** A laid-out node with absolute canvas coordinates. */
export interface PlacedNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly node: Node;
  /** Depth in the containment tree; used for paint order. */
  readonly depth: number;
  readonly isContainer: boolean;
}

/** A laid-out edge: an absolute polyline plus the underlying edge. */
export interface PlacedEdge {
  readonly edge: Edge;
  readonly points: readonly { x: number; y: number }[];
}

export interface Scene {
  readonly placed: readonly PlacedNode[];
  readonly byId: ReadonlyMap<string, PlacedNode>;
  readonly edges: readonly PlacedEdge[];
  readonly width: number;
  readonly height: number;
}
