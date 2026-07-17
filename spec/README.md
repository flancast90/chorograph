# The chorograph contract

Everything a chorograph implementation must agree on lives in two handwritten files:

- [`graph.schema.json`](graph.schema.json) — a standard JSON Schema (2020-12) for the `graph.json`
  wire format: the node/edge kind enums and the record shapes. Validate a graph from any language
  with any off-the-shelf validator.
- [`grammar.json`](grammar.json) — the doc-comment tag vocabulary (including aliases like `@fn`),
  what each kind may contain, and which kinds require a parent. Validated by
  [`grammar.schema.json`](grammar.schema.json).

`pnpm codegen` (at the repo root) turns the spec into language bindings using standard tooling —
no bespoke type languages, no custom emitters:

| output | produced by | consumed by |
| --- | --- | --- |
| `packages/chorograph/src/{core,viewer}/model.gen.ts` | [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript) | the scanner and the report viewer (the viewer can't import core, so it gets its own copy) |
| `packages/chorograph/src/{core,viewer}/grammar.gen.ts` | verbatim embed of `grammar.json` as a typed `const` | `core/grammar.ts` and `viewer/types.ts`, which derive the tag maps and containment table from it |

The codegen also enforces the cross-file invariants: `grammar.json` must validate against its
schema, `graph.schema.json` must compile as a 2020-12 schema, and the kind sets in both files
must be identical. On top of that, `core/grammar.ts` carries compile-time `AssertEqual` guards,
and a conformance test validates real scanner output against the schema with ajv.

CI runs `pnpm codegen:check`; generated files (`*.gen.ts`) are never edited by hand.

## Changing the contract

1. Edit `graph.schema.json` (wire format) and/or `grammar.json` (vocabulary and rules).
2. Run `pnpm codegen`.
3. Fix whatever the compiler and tests now point at (a new kind also needs an icon and a colour
   in the viewer, plus docs — `AGENTS.md` has the full checklist).
4. Commit the spec and the generated files together.

## Adding a language

A Python (or Go, or Rust) package is a new directory under `packages/` plus that language's
standard generator pointed at the same spec — for Python,
[datamodel-code-generator](https://github.com/koxudaxi/datamodel-code-generator) emits pydantic
models straight from `graph.schema.json`, and `grammar.json` ships as package data. The
`graph.json` format is the interoperability boundary: any implementation that emits or consumes
documents valid under `graph.schema.json`, using the vocabulary and containment rules from
`grammar.json`, is a correct chorograph.
