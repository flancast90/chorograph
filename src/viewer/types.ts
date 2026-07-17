/**
 * Viewer-local mirror of the on-disk Graph contract, plus view-side shapes.
 *
 * Keep the Graph half in sync with `src/core/model.ts`; the viewer must not import core so the
 * report bundle stays browser-only.
 */

export type NodeKind =
  | "domain"
  | "service"
  | "endpoint"
  | "job"
  | "database"
  | "table"
  | "cache"
  | "bucket"
  | "queue"
  | "event"
  | "external";

export type EdgeKind = "calls" | "reads" | "writes" | "emits" | "consumes" | "uses";

export const NODE_KINDS: readonly NodeKind[] = [
  "domain",
  "service",
  "endpoint",
  "job",
  "database",
  "table",
  "cache",
  "bucket",
  "queue",
  "event",
  "external",
];

export const EDGE_KINDS: readonly EdgeKind[] = ["calls", "reads", "writes", "emits", "consumes", "uses"];

export interface Node {
  readonly id: string;
  readonly name: string;
  readonly kind: NodeKind;
  readonly parent: string | null;
  readonly description?: string;
  readonly tech?: string;
  readonly tags: readonly string[];
}

export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly label?: string;
}

export interface GraphMeta {
  readonly tool: "chorograph";
  readonly version: string;
  readonly generatedAt: string;
  readonly name: string;
  readonly description?: string;
  readonly counts: {
    readonly nodes: Readonly<Partial<Record<NodeKind, number>>>;
    readonly edges: Readonly<Partial<Record<EdgeKind, number>>>;
  };
}

export interface Graph {
  readonly meta: GraphMeta;
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}

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
