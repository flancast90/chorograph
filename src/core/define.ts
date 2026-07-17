/**
 * `defineSystem` — the way a chorograph map is authored.
 *
 * You describe the system in plain TypeScript: create nodes through factory methods (which return
 * typed handles), then connect handles with verb methods (`calls`, `reads`, `writes`, `emits`,
 * `consumes`, `uses`). Because connections take handles rather than strings, a typo is a compile
 * error and a renamed service updates every edge that touches it.
 *
 * ```ts
 * export default defineSystem("Streamline", (s) => {
 *   const commerce = s.domain("Commerce");
 *   const orders = commerce.service("orders", { tech: "Node.js" });
 *   const db = commerce.database("orders-db", { tech: "PostgreSQL 16" });
 *   const placed = commerce.event("order.placed");
 *
 *   s.writes(orders, db.table("orders"));
 *   s.emits(orders, placed);
 * });
 * ```
 */
import type { Edge, EdgeKind, Graph, GraphMeta, Node, NodeKind } from "./model.ts";

/** Anything that can sit at one end of an edge. All handles satisfy this. */
export interface NodeRef {
  readonly id: string;
  readonly kind: NodeKind;
  readonly name: string;
}

export interface NodeOptions {
  readonly description?: string;
  /** Implementation note shown in the detail panel: `PostgreSQL 16`, `Go`, `Kafka`. */
  readonly tech?: string;
  readonly tags?: readonly string[];
}

/** Factories available at the top level and inside a domain. */
export interface ContainerApi {
  domain(name: string, options?: NodeOptions): DomainHandle;
  service(name: string, options?: NodeOptions): ServiceHandle;
  database(name: string, options?: NodeOptions): DatabaseHandle;
  cache(name: string, options?: NodeOptions): NodeRef;
  bucket(name: string, options?: NodeOptions): NodeRef;
  queue(name: string, options?: NodeOptions): NodeRef;
  event(name: string, options?: NodeOptions): EventHandle;
  external(name: string, options?: NodeOptions): NodeRef;
}

export interface DomainHandle extends NodeRef, ContainerApi {
  readonly kind: "domain";
}

export interface ServiceHandle extends NodeRef {
  readonly kind: "service";
  endpoint(name: string, options?: NodeOptions): NodeRef;
  job(name: string, options?: NodeOptions): NodeRef;
}

export interface DatabaseHandle extends NodeRef {
  readonly kind: "database";
  table(name: string, options?: NodeOptions): NodeRef;
}

export interface EventHandle extends NodeRef {
  readonly kind: "event";
}

/**
 * The root builder. Node factories come from {@link ContainerApi}; the verb methods declare edges.
 *
 * Edge direction follows the flow of data and control, which is what makes the layout read
 * left-to-right: `calls` caller→callee, `reads`/`writes` actor→store, `emits` producer→event,
 * `consumes` event→consumer (you write `consumes(service, event)` — the natural sentence — and
 * chorograph stores the flow direction for you).
 */
export interface SystemBuilder extends ContainerApi {
  /** Request/response dependency: `from` invokes `to`. Label it with the protocol if useful. */
  calls(from: NodeRef, to: NodeRef, label?: string): void;
  reads(reader: NodeRef, store: NodeRef, label?: string): void;
  writes(writer: NodeRef, store: NodeRef, label?: string): void;
  emits(producer: NodeRef, event: EventHandle, label?: string): void;
  consumes(consumer: NodeRef, event: EventHandle, label?: string): void;
  /** Escape hatch when no other verb fits. Prefer the specific verbs. */
  uses(from: NodeRef, to: NodeRef, label?: string): void;
}

export interface SystemOptions {
  readonly description?: string;
}

/** The value a definition module exports. The CLI calls {@link System.toGraph} to render it. */
export interface System {
  readonly __chorograph: "system";
  readonly name: string;
  toGraph(opts?: { version?: string }): Graph;
}

/** Structural check for a value produced by `defineSystem` — survives bundling across packages. */
export function isSystem(value: unknown): value is System {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __chorograph?: unknown }).__chorograph === "system" &&
    typeof (value as { toGraph?: unknown }).toGraph === "function"
  );
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";

export function defineSystem(name: string, define: (s: SystemBuilder) => void): System;
export function defineSystem(name: string, options: SystemOptions, define: (s: SystemBuilder) => void): System;
export function defineSystem(
  name: string,
  optionsOrDefine: SystemOptions | ((s: SystemBuilder) => void),
  maybeDefine?: (s: SystemBuilder) => void,
): System {
  const options = typeof optionsOrDefine === "function" ? {} : optionsOrDefine;
  const define = typeof optionsOrDefine === "function" ? optionsOrDefine : maybeDefine!;

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const ids = new Set<string>();

  function addNode(parent: string | null, kind: NodeKind, nodeName: string, opts: NodeOptions = {}): Node {
    if (!nodeName.trim()) throw new Error(`chorograph: a ${kind} needs a non-empty name`);
    const id = parent ? `${parent}/${slug(nodeName)}` : slug(nodeName);
    if (ids.has(id)) {
      throw new Error(
        `chorograph: duplicate ${kind} "${nodeName}"${parent ? ` under "${parent}"` : ""} — names must be unique within their parent`,
      );
    }
    ids.add(id);
    const node: Node = {
      id,
      name: nodeName,
      kind,
      parent,
      tags: opts.tags ?? [],
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      ...(opts.tech !== undefined ? { tech: opts.tech } : {}),
    };
    nodes.push(node);
    return node;
  }

  function addEdge(kind: EdgeKind, from: NodeRef, to: NodeRef, label?: string): void {
    if (!ids.has(from.id) || !ids.has(to.id)) {
      throw new Error(`chorograph: edge ${kind} references a node from a different system`);
    }
    if (from.id === to.id) {
      throw new Error(`chorograph: "${from.name}" cannot ${kind} itself`);
    }
    const base = `${kind}:${from.id}->${to.id}`;
    let id = base;
    for (let n = 2; edges.some((e) => e.id === id); n++) id = `${base}#${n}`;
    edges.push({ id, from: from.id, to: to.id, kind, ...(label !== undefined ? { label } : {}) });
  }

  function requireEvent(ref: NodeRef, verb: string): void {
    if (ref.kind !== "event") {
      throw new Error(`chorograph: ${verb} must target an event, got ${ref.kind} "${ref.name}"`);
    }
  }

  function leafHandle(node: Node): NodeRef {
    return { id: node.id, kind: node.kind, name: node.name };
  }

  function containerApi(parent: string | null): ContainerApi {
    return {
      domain(n, o) {
        const node = addNode(parent, "domain", n, o);
        return { ...leafHandle(node), ...containerApi(node.id) } as DomainHandle;
      },
      service(n, o) {
        const node = addNode(parent, "service", n, o);
        return {
          ...leafHandle(node),
          endpoint: (en: string, eo?: NodeOptions) => leafHandle(addNode(node.id, "endpoint", en, eo)),
          job: (jn: string, jo?: NodeOptions) => leafHandle(addNode(node.id, "job", jn, jo)),
        } as ServiceHandle;
      },
      database(n, o) {
        const node = addNode(parent, "database", n, o);
        return {
          ...leafHandle(node),
          table: (tn: string, to?: NodeOptions) => leafHandle(addNode(node.id, "table", tn, to)),
        } as DatabaseHandle;
      },
      cache: (n, o) => leafHandle(addNode(parent, "cache", n, o)),
      bucket: (n, o) => leafHandle(addNode(parent, "bucket", n, o)),
      queue: (n, o) => leafHandle(addNode(parent, "queue", n, o)),
      event: (n, o) => leafHandle(addNode(parent, "event", n, o)) as EventHandle,
      external: (n, o) => leafHandle(addNode(parent, "external", n, o)),
    };
  }

  const builder: SystemBuilder = {
    ...containerApi(null),
    calls: (from, to, label) => addEdge("calls", from, to, label),
    reads: (reader, store, label) => addEdge("reads", reader, store, label),
    writes: (writer, store, label) => addEdge("writes", writer, store, label),
    emits: (producer, event, label) => {
      requireEvent(event, "emits");
      addEdge("emits", producer, event, label);
    },
    // Stored event → consumer so the layout flows producer → event → consumer.
    consumes: (consumer, event, label) => {
      requireEvent(event, "consumes");
      addEdge("consumes", event, consumer, label);
    },
    uses: (from, to, label) => addEdge("uses", from, to, label),
  };

  define(builder);

  return {
    __chorograph: "system",
    name,
    toGraph({ version = "0.0.0" } = {}): Graph {
      const meta: GraphMeta = {
        tool: "chorograph",
        version,
        generatedAt: new Date().toISOString(),
        name,
        ...(options.description !== undefined ? { description: options.description } : {}),
        counts: {
          nodes: countBy(nodes, (n) => n.kind),
          edges: countBy(edges, (e) => e.kind),
        },
      };
      return { meta, nodes: [...nodes], edges: [...edges] };
    },
  };
}

function countBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}
