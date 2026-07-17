# The chorograph contract

Everything a chorograph implementation must agree on lives in [`contract.json`](contract.json):

- the **node kinds** (what a thing can be), each with its doc-comment tags, what it may contain,
  and whether it must have a parent
- the **edge kinds** (how things connect)
- the **records** that make up the `graph.json` wire format

From that one file, `pnpm codegen` (at the repo root) generates:

| output | consumed by |
| --- | --- |
| `packages/chorograph/src/core/model.gen.ts` | the scanner |
| `packages/chorograph/src/viewer/model.gen.ts` | the report viewer (it can't import core, so it gets its own copy) |
| [`graph.schema.json`](graph.schema.json) | anyone, in any language — it's a standard JSON Schema (2020-12) for `graph.json` |

CI runs `pnpm codegen:check`, so generated code can't drift from the spec, and a conformance test
validates real scanner output against the schema. Never edit generated files by hand.

## Changing the contract

1. Edit `contract.json`.
2. Run `pnpm codegen`.
3. Fix whatever the compiler and tests now point at (a new kind also needs an icon and a colour
   in the viewer, plus docs — `AGENTS.md` has the full checklist).
4. Commit the spec and the generated files together.

## Adding a language

A Python (or Go, or Rust) package is a new directory under `packages/` plus a new emitter in
`scripts/codegen.mjs` that writes that language's types and constants from this same spec. The
`graph.json` format is the interoperability boundary: any implementation that emits or consumes
documents valid under `graph.schema.json`, using the kinds and containment rules from
`contract.json`, is a correct chorograph.

The record shapes in `contract.json` use a small type language: `string`, `int`, `X[]`,
`NodeKind`/`EdgeKind`/record references, `countmap:<enum>` (a partial map from enum values to
counts), `const:<value>`, and `optional`/`nullable` flags. If a new shape needs more than that,
extend the codegen and this note in the same PR.
