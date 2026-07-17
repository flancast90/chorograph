/**
 * chorograph public API.
 *
 * Declare architecture inside the real code — wrappers for function-style modules, decorators for
 * class-style ones — then render the map with `chorograph render <paths…>`. The serialisable
 * {@link Graph} contract is exported for anyone piping `graph.json` into their own tooling.
 */
export {
  system,
  domain,
  service,
  database,
  cache,
  bucket,
  queue,
  event,
  external,
  endpoint,
  func,
  job,
  archRef,
} from "./core/declare.ts";
export type {
  NodeRef,
  EventRef,
  ArchFn,
  EdgeSpec,
  EdgeOptions,
  DeclareOptions,
  DomainHandle,
  ServiceHandle,
  ServiceClassHandle,
  ServiceDecoratorOptions,
  DatabaseHandle,
} from "./core/declare.ts";
export { collectGraph, resetRegistry } from "./core/registry.ts";
export { NODE_KINDS, EDGE_KINDS } from "./core/model.ts";
export type { Graph, GraphMeta, Node, Edge, NodeKind, EdgeKind, NodeOptions } from "./core/model.ts";
