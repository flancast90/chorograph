/**
 * The vocabulary chorograph speaks in.
 *
 * A system is a **containment tree** of nodes — domains hold services and databases, services
 * hold endpoints and jobs, databases hold tables — plus a set of directed edges describing how
 * those things talk to each other. Everything is declared explicitly, in doc comments on the real
 * source code, parsed statically by `core/annotations.ts`.
 *
 * Types are generated from `spec/graph.schema.json` (json-schema-to-typescript) and the grammar
 * constants derive from `spec/grammar.json`; this module is the stable import path for both.
 */
export type { NodeKind, EdgeKind, Node, Edge, GraphCounts, GraphMeta, Graph } from "./model.gen.ts";
export { NODE_KINDS, EDGE_KINDS, NODE_TAGS, EDGE_TAGS, CONTAINS, MEMBER_KINDS } from "./grammar.ts";
