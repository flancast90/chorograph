/**
 * The vocabulary chorograph speaks in.
 *
 * A system is a **containment tree** of nodes — domains hold services and databases, services
 * hold endpoints and jobs, databases hold tables — plus a set of directed edges describing how
 * those things talk to each other. Everything is declared explicitly, in doc comments on the real
 * source code, parsed statically by `core/annotations.ts`.
 *
 * The definitions themselves are generated from `spec/contract.json` (the cross-language source
 * of truth) into `model.gen.ts`; this module is the stable import path.
 */
export type { NodeKind, EdgeKind, Node, Edge, GraphCounts, GraphMeta, Graph } from "./model.gen.ts";
export { NODE_KINDS, EDGE_KINDS, NODE_TAGS, EDGE_TAGS, CONTAINS, MEMBER_KINDS } from "./model.gen.ts";
