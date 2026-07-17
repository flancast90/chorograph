/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: spec/contract.json. Regenerate with `pnpm codegen` at the repo root.
 * Node/edge kinds, the tag grammar, the containment matrix, and the graph.json wire format all
 * live in the spec so every language package ships the identical contract.
 */

/** What a node *is*. A small closed set, one icon and one colour each. */
export type NodeKind =
  | "domain" // a bounded context / grouping — the only kind that exists purely to contain others
  | "service" // a deployable process: API server, worker, consumer
  | "endpoint" // an API surface a service exposes: HTTP route, RPC method, GraphQL field
  | "function" // a function inside a service that is architecturally significant
  | "job" // scheduled or background work owned by a service
  | "database" // a database instance or cluster
  | "table" // a table / collection inside a database
  | "cache" // an in-memory store: Redis, Memcached
  | "bucket" // blob storage: S3, GCS
  | "queue" // a queue or topic: SQS, Kafka, Rabbit
  | "event" // a named domain event that flows between services
  | "external"; // a third-party system you don't operate: Stripe, SendGrid

export const NODE_KINDS: readonly NodeKind[] = ["domain","service","endpoint","function","job","database","table","cache","bucket","queue","event","external"];

/** How two nodes are connected. `from` is the thing doing the verb, `to` is the thing the verb is done to. */
export type EdgeKind =
  | "calls" // synchronous invocation: HTTP, RPC, an in-process call
  | "reads" // reads state from a store
  | "writes" // writes state to a store
  | "emits" // publishes an event
  | "consumes" // subscribes to an event
  | "uses"; // depends on, when no sharper verb fits: an external API, a cache

export const EDGE_KINDS: readonly EdgeKind[] = ["calls","reads","writes","emits","consumes","uses"];

/** Doc-comment tag → the node kind it declares (`@fn` and `@function` are aliases). */
export const NODE_TAGS: Readonly<Record<string, NodeKind>> = {
  domain: "domain",
  service: "service",
  endpoint: "endpoint",
  fn: "function",
  function: "function",
  job: "job",
  database: "database",
  table: "table",
  cache: "cache",
  bucket: "bucket",
  queue: "queue",
  event: "event",
  external: "external",
};

/** Edge tags are the edge kinds themselves: `@calls`, `@reads`, … */
export const EDGE_TAGS: ReadonlySet<EdgeKind> = new Set(EDGE_KINDS);

/** What can live inside what — the whole hierarchy in one table. */
export const CONTAINS: Readonly<Record<NodeKind, readonly NodeKind[]>> = {
  domain: ["domain","service","database","cache","bucket","queue","event","external"],
  service: ["endpoint","function","job","database","cache","bucket","queue"],
  endpoint: ["endpoint","function"],
  function: ["function"],
  job: ["function"],
  database: ["table"],
  table: [],
  cache: [],
  bucket: [],
  queue: [],
  event: [],
  external: [],
};

/** Kinds that make no sense floating free — they must resolve to a parent. */
export const MEMBER_KINDS: ReadonlySet<NodeKind> = new Set(["endpoint","function","job","table"]);

/** A single thing on the map. */
export interface Node {
  /** Stable slug path derived from names: `commerce/orders/post-orders`. */
  readonly id: string;
  readonly name: string;
  readonly kind: NodeKind;
  /** Containment parent id, or `null` for a top-level node. */
  readonly parent: string | null;
  /** One or two sentences on what this thing is for. Shown in the detail panel. */
  readonly description?: string;
  /** Implementation note: `PostgreSQL 16`, `Node.js`, `Kafka`. */
  readonly tech?: string;
  readonly tags: readonly string[];
  /** Where the declaring comment lives, relative to where chorograph ran. */
  readonly file?: string;
  readonly line?: number;
}

/** A directed connection between two nodes. `from` is the thing doing the verb, `to` is the thing the verb is done to. */
export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  /** Optional annotation: protocol (`HTTP`, `gRPC`) or a short verb phrase — the why. */
  readonly label?: string;
}

/** How many of each kind the graph holds; a cheap summary for tooling. */
export interface GraphCounts {
  readonly nodes: Readonly<Partial<Record<NodeKind, number>>>;
  readonly edges: Readonly<Partial<Record<EdgeKind, number>>>;
}

/** Provenance and summary for a generated graph. */
export interface GraphMeta {
  readonly tool: "chorograph";
  /** Version of the generator that produced the file. */
  readonly version: string;
  /** ISO 8601 timestamp. */
  readonly generatedAt: string;
  /** The system name from the `@system` comment. */
  readonly name: string;
  readonly description?: string;
  readonly counts: GraphCounts;
}

/** The complete, serialisable map. This is the on-disk `graph.json` contract. */
export interface Graph {
  readonly meta: GraphMeta;
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}
