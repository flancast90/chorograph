/**
 * The declaration API — how architecture is written down, inside the real code.
 *
 * Two styles, one registry, freely mixable:
 *
 * **Function style** — wrappers that return your implementation unchanged (zero runtime cost),
 * stamped with a node identity so other declarations can point at it:
 *
 * ```ts
 * export const orders = commerce.service("orders", { tech: "Node.js" });
 *
 * export const placeOrder = orders.endpoint(
 *   "POST /orders",
 *   { writes: [ordersTable], emits: [orderPlaced] },
 *   async (input: PlaceOrderInput) => { ... real code ... },
 * );
 * ```
 *
 * **Class style** — stage-3 decorators for codebases organised around classes:
 *
 * ```ts
 * @service("payments", { domain: commerce, calls: [stripe] })
 * export class PaymentsService {
 *   @endpoint("POST /charge", { writes: [ledger] })
 *   async charge(req: ChargeRequest) { ... real code ... }
 * }
 * ```
 *
 * Because the declaration wraps (or decorates) the real function, deleting the code deletes the
 * node, and edges reference imported handles — so a stale edge is a compile error, not a lie on
 * the map. Edge verbs read as sentences: the declaring node is always the subject.
 */
import type { EdgeKind, NodeKind, NodeOptions } from "./model.ts";
import { drainPendingMembers, pushPendingMember, registerEdge, registerNode, setSystem } from "./registry.ts";

/** Anything that can sit at the end of an edge: a handle, a wrapped function, a decorated class. */
export interface NodeRef {
  readonly id: string;
  readonly kind: NodeKind;
  readonly name: string;
}

/** An edge target, optionally labelled: `calls: [stripe, [sendgrid, "batched"]]`. */
export type EdgeSpec = NodeRef | readonly [NodeRef, string];

/** Connections declared alongside a node. The declaring node is the subject of every verb. */
export interface EdgeOptions {
  /** Request/response: this node invokes the target. Label with the protocol if useful. */
  readonly calls?: readonly EdgeSpec[];
  readonly reads?: readonly EdgeSpec[];
  readonly writes?: readonly EdgeSpec[];
  /** Targets must be events. */
  readonly emits?: readonly EdgeSpec[];
  /** Targets must be events. */
  readonly consumes?: readonly EdgeSpec[];
  /** Escape hatch when no other verb fits. Prefer the specific verbs. */
  readonly uses?: readonly EdgeSpec[];
}

export interface DeclareOptions extends NodeOptions, EdgeOptions {}

function splitSpec(spec: EdgeSpec): { ref: NodeRef; label?: string } {
  if (Array.isArray(spec)) {
    const [ref, label] = spec as readonly [NodeRef, string];
    return { ref, label };
  }
  return { ref: spec as NodeRef };
}

function declareEdges(fromId: string, fromName: string, options: EdgeOptions): void {
  const verbs: readonly (keyof EdgeOptions & EdgeKind)[] = ["calls", "reads", "writes", "emits", "consumes", "uses"];
  for (const verb of verbs) {
    for (const spec of options[verb] ?? []) {
      const { ref, label } = splitSpec(spec);
      if (!ref || typeof ref.id !== "string") {
        throw new Error(
          `chorograph: "${fromName}" declares ${verb} with something that is not a declared node — pass the handle returned by a chorograph declaration`,
        );
      }
      if ((verb === "emits" || verb === "consumes") && ref.kind !== "event") {
        throw new Error(`chorograph: "${fromName}" ${verb} "${ref.name}", but ${verb} must target an event (got ${ref.kind})`);
      }
      // consumes is stored event → consumer so the layout flows producer → event → consumer.
      if (verb === "consumes") registerEdge("consumes", ref.id, fromId, label);
      else registerEdge(verb, fromId, ref.id, label);
    }
  }
}

/** Name the system on the map. Call once, anywhere in the annotated code. */
export function system(name: string, options: { description?: string } = {}): void {
  setSystem(name, options.description);
}

/**
 * Read the node identity off a decorated class (or any stamped value) as a typed {@link NodeRef}.
 * Useful when a declaration in one module points at a `@service` class from another:
 * `calls: [[archRef(PaymentsService), "gRPC"]]`.
 */
export function archRef(value: unknown): NodeRef {
  const v = value as Partial<NodeRef> | null;
  if (!v || typeof v.id !== "string" || typeof v.kind !== "string") {
    throw new Error("chorograph: archRef() got a value with no node identity — was it declared with chorograph?");
  }
  return { id: v.id, kind: v.kind, name: String(v.name ?? v.id) };
}

// ── Handles ───────────────────────────────────────────────────────────────

export interface DomainHandle extends NodeRef {
  readonly kind: "domain";
  domain(name: string, options?: DeclareOptions): DomainHandle;
  service(name: string, options?: DeclareOptions): ServiceHandle;
  database(name: string, options?: DeclareOptions): DatabaseHandle;
  cache(name: string, options?: DeclareOptions): NodeRef;
  bucket(name: string, options?: DeclareOptions): NodeRef;
  queue(name: string, options?: DeclareOptions): NodeRef;
  event(name: string, options?: DeclareOptions): EventRef;
  external(name: string, options?: DeclareOptions): NodeRef;
}

export interface EventRef extends NodeRef {
  readonly kind: "event";
}

/** A function stamped with its node identity — what the endpoint/fn/job wrappers return. */
export type ArchFn<F> = F & NodeRef;

export interface ServiceHandle extends NodeRef {
  readonly kind: "service";
  /** Declare + wrap: returns `impl` unchanged, stamped with the node identity. */
  endpoint<F extends (...args: never[]) => unknown>(name: string, options: DeclareOptions, impl: F): ArchFn<F>;
  endpoint(name: string, options?: DeclareOptions): NodeRef;
  /** An architecturally significant function inside this service. */
  fn<F extends (...args: never[]) => unknown>(name: string, options: DeclareOptions, impl: F): ArchFn<F>;
  fn(name: string, options?: DeclareOptions): NodeRef;
  /** Scheduled or background work owned by this service. */
  job<F extends (...args: never[]) => unknown>(name: string, options: DeclareOptions, impl: F): ArchFn<F>;
  job(name: string, options?: DeclareOptions): NodeRef;
}

export interface DatabaseHandle extends NodeRef {
  readonly kind: "database";
  table(name: string, options?: DeclareOptions): NodeRef;
}

function ref(id: string, kind: NodeKind, name: string): NodeRef {
  return { id, kind, name };
}

function stamp<F extends (...args: never[]) => unknown>(impl: F, r: NodeRef): ArchFn<F> {
  Object.defineProperty(impl, "id", { value: r.id, enumerable: false });
  Object.defineProperty(impl, "kind", { value: r.kind, enumerable: false });
  Object.defineProperty(impl, "name", { value: r.name, enumerable: false });
  return impl as ArchFn<F>;
}

function declare(parent: string | null, kind: NodeKind, name: string, options: DeclareOptions = {}): NodeRef {
  const node = registerNode(parent, kind, name, options);
  declareEdges(node.id, name, options);
  return ref(node.id, kind, name);
}

/** A service child that may wrap an implementation function. */
function memberFactory(parentId: string, kind: "endpoint" | "function" | "job") {
  function member(name: string, options?: DeclareOptions): NodeRef;
  function member<F extends (...args: never[]) => unknown>(name: string, options: DeclareOptions, impl: F): ArchFn<F>;
  function member<F extends (...args: never[]) => unknown>(
    name: string,
    options: DeclareOptions = {},
    impl?: F,
  ): NodeRef | ArchFn<F> {
    const r = declare(parentId, kind, name, options);
    return impl ? stamp(impl, r) : r;
  }
  return member;
}

function serviceHandle(id: string, name: string): ServiceHandle {
  return {
    ...ref(id, "service", name),
    kind: "service",
    endpoint: memberFactory(id, "endpoint"),
    fn: memberFactory(id, "function"),
    job: memberFactory(id, "job"),
  };
}

function databaseHandle(id: string, name: string): DatabaseHandle {
  return {
    ...ref(id, "database", name),
    kind: "database",
    table: (n, o) => declare(id, "table", n, o),
  };
}

function domainHandle(id: string, name: string): DomainHandle {
  return {
    ...ref(id, "domain", name),
    kind: "domain",
    domain: (n, o) => {
      const r = declare(id, "domain", n, o);
      return domainHandle(r.id, r.name);
    },
    service: (n, o) => {
      const r = declare(id, "service", n, o);
      return serviceHandle(r.id, r.name);
    },
    database: (n, o) => {
      const r = declare(id, "database", n, o);
      return databaseHandle(r.id, r.name);
    },
    cache: (n, o) => declare(id, "cache", n, o),
    bucket: (n, o) => declare(id, "bucket", n, o),
    queue: (n, o) => declare(id, "queue", n, o),
    event: (n, o) => declare(id, "event", n, o) as EventRef,
    external: (n, o) => declare(id, "external", n, o),
  };
}

// ── Top-level factories ───────────────────────────────────────────────────────

export function domain(name: string, options?: DeclareOptions): DomainHandle {
  const r = declare(null, "domain", name, options);
  return domainHandle(r.id, r.name);
}

export interface ServiceDecoratorOptions extends DeclareOptions {
  /** Place the service inside a domain (decorators cannot nest, so the parent is an option). */
  readonly domain?: DomainHandle;
}

/**
 * Declare a service. Usable two ways:
 *
 * - **Factory**: `const orders = service("orders", { domain: commerce })` — returns a handle with
 *   `.endpoint()` / `.fn()` / `.job()` wrappers.
 * - **Class decorator**: `@service("payments", { domain: commerce }) class PaymentsService {}` —
 *   claims any `@endpoint` / `@func` / `@job` members and stamps the class as a {@link NodeRef}.
 */
export function service(name: string, options: ServiceDecoratorOptions = {}): ServiceClassHandle {
  const { domain: parent, ...rest } = options;
  const r = declare(parent?.id ?? null, "service", name, rest);
  const handle = serviceHandle(r.id, r.name);

  const callable = ((target: abstract new (...args: never[]) => unknown, context: ClassDecoratorContext): void => {
    if (context.kind !== "class") throw new Error(`chorograph: @service("${name}") must decorate a class`);
    for (const member of drainPendingMembers()) {
      declare(r.id, member.kind, member.name, member.options);
    }
    stamp(target as unknown as (...args: never[]) => unknown, r);
  }) as unknown as ServiceClassHandle;

  // `name` on a function is non-writable, so copy it with defineProperty rather than assign.
  const { name: _handleName, ...handleRest } = handle;
  Object.assign(callable, handleRest);
  Object.defineProperty(callable, "name", { value: r.name });
  return callable;
}

/** The dual-use value returned by {@link service}: a handle that also works as a class decorator. */
export type ServiceClassHandle = ServiceHandle &
  ((target: abstract new (...args: never[]) => unknown, context: ClassDecoratorContext) => void);

export function database(name: string, options?: DeclareOptions): DatabaseHandle {
  const r = declare(null, "database", name, options);
  return databaseHandle(r.id, r.name);
}

export const cache = (name: string, options?: DeclareOptions): NodeRef => declare(null, "cache", name, options);
export const bucket = (name: string, options?: DeclareOptions): NodeRef => declare(null, "bucket", name, options);
export const queue = (name: string, options?: DeclareOptions): NodeRef => declare(null, "queue", name, options);
export const event = (name: string, options?: DeclareOptions): EventRef =>
  declare(null, "event", name, options) as EventRef;
export const external = (name: string, options?: DeclareOptions): NodeRef => declare(null, "external", name, options);

// ── Method decorators ────────────────────────────────────────────────────────
// Stage-3 decorators evaluate method decorators before the class decorator, so members queue up
// in the registry and the enclosing @service(…) claims them. No metadata polyfill required.

type MethodDecorator = (method: (...args: never[]) => unknown, context: ClassMethodDecoratorContext) => void;

function memberDecorator(kind: "endpoint" | "function" | "job", name: string | undefined, options: DeclareOptions): MethodDecorator {
  return (_method, context) => {
    if (context.kind !== "method") throw new Error(`chorograph: @${kind === "function" ? "func" : kind} must decorate a method`);
    pushPendingMember({ kind, name: name ?? String(context.name), options });
  };
}

/** Declare a method as an API endpoint of the enclosing `@service` class. Name it after the route. */
export function endpoint(name: string, options: DeclareOptions = {}): MethodDecorator {
  return memberDecorator("endpoint", name, options);
}

/** Declare a method as an architecturally significant function. Defaults to the method name. */
export function func(name?: string, options: DeclareOptions = {}): MethodDecorator {
  return memberDecorator("function", name, options);
}

/** Declare a method as scheduled/background work. Defaults to the method name. */
export function job(name?: string, options: DeclareOptions = {}): MethodDecorator {
  return memberDecorator("job", name, options);
}
