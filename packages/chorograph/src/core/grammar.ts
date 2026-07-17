/**
 * The tag grammar and containment rules, derived from the embedded spec (`grammar.gen.ts`, a
 * verbatim copy of `spec/grammar.json`) and typed against the schema-generated `NodeKind`/
 * `EdgeKind`. The `AssertEqual` guards below make the two spec files fail *compilation* if their
 * kind sets ever disagree — the same invariant codegen checks at generation time.
 */
import grammar from "./grammar.gen.ts";
import type { EdgeKind, NodeKind } from "./model.gen.ts";

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type GrammarNodeKind = (typeof grammar.nodeKinds)[number]["kind"];
type GrammarEdgeKind = (typeof grammar.edgeKinds)[number]["kind"];
true satisfies AssertEqual<GrammarNodeKind, NodeKind>;
true satisfies AssertEqual<GrammarEdgeKind, EdgeKind>;

export const NODE_KINDS: readonly NodeKind[] = grammar.nodeKinds.map((n) => n.kind);
export const EDGE_KINDS: readonly EdgeKind[] = grammar.edgeKinds.map((e) => e.kind);

/** Doc-comment tag → the node kind it declares (`@fn` and `@function` are aliases). */
export const NODE_TAGS: Readonly<Record<string, NodeKind>> = Object.fromEntries(
  grammar.nodeKinds.flatMap((n) => n.tags.map((tag) => [tag, n.kind])),
);

/** Edge tags are the edge kinds themselves: `@calls`, `@reads`, … */
export const EDGE_TAGS: ReadonlySet<EdgeKind> = new Set(EDGE_KINDS);

/** What can live inside what — the whole hierarchy in one table. */
export const CONTAINS: Readonly<Record<NodeKind, readonly NodeKind[]>> = Object.fromEntries(
  grammar.nodeKinds.map((n) => [n.kind, n.contains]),
  // Object.fromEntries widens keys to string; the AssertEqual guard above justifies the cast.
) as unknown as Record<NodeKind, readonly NodeKind[]>;

/** Kinds that make no sense floating free — they must resolve to a parent. */
export const MEMBER_KINDS: ReadonlySet<NodeKind> = new Set(
  grammar.nodeKinds.filter((n) => n.requiresParent).map((n) => n.kind),
);
