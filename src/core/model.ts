/**
 * The vocabulary chorograph speaks in.
 *
 * A system is a **containment tree** of {@link Node}s — domains hold services and databases,
 * services hold endpoints and jobs, databases hold tables — plus a set of directed {@link Edge}s
 * describing how those things talk to each other.
 *
 * Everything is declared explicitly, inside the real source code, with the wrappers and decorators
 * in `core/declare.ts`. chorograph never infers structure from imports or folders: the map contains
 * exactly what was written down, which is what makes it trustworthy as an architecture document.
 */

/**
 * What a node *is*. A small closed set, one icon and one colour each.
 *
 * Three kinds are containers: `domain` (holds anything), `service` (holds endpoints and jobs),
 * and `database` (holds tables). Everything else is a leaf.
 */
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

export const NODE_KINDS: readonly NodeKind[] = [
  "domain",
  "service",
  "endpoint",
  "function",
  "job",
  "database",
  "table",
  "cache",
  "bucket",
  "queue",
  "event",
  "external",
];

/**
 * How two nodes are connected. Directed, with one uniform rule: **`from` is the thing doing the
 * verb, `to` is the thing the verb is done to.** “orders *reads* orders-db”, “notifications
 * *consumes* order.placed”. The verb is the edge kind, so every arrow reads as a sentence.
 */
export type EdgeKind = "calls" | "reads" | "writes" | "emits" | "consumes" | "uses";

export const EDGE_KINDS: readonly EdgeKind[] = ["calls", "reads", "writes", "emits", "consumes", "uses"];

/** Descriptive fields accepted by every declaration. */
export interface NodeOptions {
  /** One or two sentences on what this thing is for. Shown in the detail panel. */
  readonly description?: string;
  /** Implementation note: `PostgreSQL 16`, `Go`, `Kafka`. */
  readonly tech?: string;
  readonly tags?: readonly string[];
}

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
}

/** A directed connection between two nodes. */
export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  /** Optional annotation: protocol (`HTTP`, `gRPC`) or a short verb phrase. */
  readonly label?: string;
}

export interface GraphMeta {
  readonly tool: "chorograph";
  readonly version: string;
  readonly generatedAt: string;
  /** The system name passed to `defineSystem`. */
  readonly name: string;
  readonly description?: string;
  readonly counts: {
    readonly nodes: Readonly<Partial<Record<NodeKind, number>>>;
    readonly edges: Readonly<Partial<Record<EdgeKind, number>>>;
  };
}

/** The complete, serialisable map. This is the on-disk `graph.json` contract. */
export interface Graph {
  readonly meta: GraphMeta;
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}
