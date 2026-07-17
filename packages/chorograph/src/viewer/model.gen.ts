/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: spec/graph.schema.json (via json-schema-to-typescript). Regenerate with `pnpm codegen` at the repo root.
 */

/**
 * What a node is. A small closed set, one icon and one colour each. Per-kind semantics and the containment rules live in grammar.json.
 */
export type NodeKind =
  | "domain"
  | "service"
  | "module"
  | "endpoint"
  | "function"
  | "job"
  | "database"
  | "table"
  | "cache"
  | "bucket"
  | "queue"
  | "event"
  | "external";
/**
 * How two nodes are connected. `from` is the thing doing the verb, `to` is the thing the verb is done to.
 */
export type EdgeKind = "calls" | "reads" | "writes" | "emits" | "consumes" | "uses";

/**
 * The complete, serialisable chorograph map. This is the on-disk graph.json contract; every chorograph implementation, in any language, emits and consumes documents valid under this schema.
 */
export interface Graph {
  meta: GraphMeta;
  nodes: Node[];
  edges: Edge[];
}
/**
 * Provenance and summary for a generated graph.
 */
export interface GraphMeta {
  tool: "chorograph";
  /**
   * Version of the generator that produced the file.
   */
  version: string;
  /**
   * ISO 8601 timestamp.
   */
  generatedAt: string;
  /**
   * The system name from the `@system` comment.
   */
  name: string;
  description?: string;
  counts: GraphCounts;
}
/**
 * How many of each kind the graph holds; a cheap summary for tooling.
 */
export interface GraphCounts {
  nodes: Readonly<Partial<Record<NodeKind, number>>>;
  edges: Readonly<Partial<Record<EdgeKind, number>>>;
}
/**
 * A single thing on the map.
 */
export interface Node {
  /**
   * Stable slug path derived from names: `commerce/orders/post-orders`.
   */
  id: string;
  name: string;
  kind: NodeKind;
  /**
   * Containment parent id, or null for a top-level node.
   */
  parent: string | null;
  /**
   * One or two sentences on what this thing is for. Shown in the detail panel.
   */
  description?: string;
  /**
   * Implementation note: `PostgreSQL 16`, `Node.js`, `Kafka`.
   */
  tech?: string;
  tags: string[];
  /**
   * Where the declaring comment lives, relative to where chorograph ran.
   */
  file?: string;
  line?: number;
}
/**
 * A directed connection between two nodes.
 */
export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /**
   * Optional annotation: protocol (`HTTP`, `gRPC`) or a short verb phrase — the why.
   */
  label?: string;
}
