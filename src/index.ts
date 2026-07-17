/**
 * chorograph public API.
 *
 * The input surface is doc comments, not code — there is nothing to import into an annotated
 * codebase. What this package exports is for tooling: the scanner itself ({@link buildGraph},
 * {@link loadGraph}) and the serialisable {@link Graph} contract for anyone piping `graph.json`
 * into their own scripts.
 */
export { buildGraph } from "./core/annotations.ts";
export type { SourceInput } from "./core/annotations.ts";
export { loadGraph, expandPaths } from "./load.ts";
export { NODE_KINDS, EDGE_KINDS } from "./core/model.ts";
export type { Graph, GraphMeta, Node, Edge, NodeKind, EdgeKind } from "./core/model.ts";
