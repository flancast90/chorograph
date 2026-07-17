/**
 * chorograph public API.
 *
 * Author a map with {@link defineSystem}, export it as the default export of a TypeScript file,
 * and render it with `chorograph render <file>`. The serialisable {@link Graph} contract is
 * exported for anyone piping `graph.json` into their own tooling.
 */
export { defineSystem, isSystem } from "./core/define.ts";
export type {
  System,
  SystemBuilder,
  SystemOptions,
  ContainerApi,
  NodeRef,
  NodeOptions,
  DomainHandle,
  ServiceHandle,
  DatabaseHandle,
  EventHandle,
} from "./core/define.ts";
export { NODE_KINDS, EDGE_KINDS } from "./core/model.ts";
export type { Graph, GraphMeta, Node, Edge, NodeKind, EdgeKind } from "./core/model.ts";
