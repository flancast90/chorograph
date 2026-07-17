# Contributing to chorograph

Thanks for wanting to help. This document covers the mechanics (setup, layout, checks) and the
conventions that keep the project coherent. For the taste the project holds itself to, read
[`docs/design-principles.md`](docs/design-principles.md) first; most review feedback traces back
to it. Coding agents should also read [`AGENTS.md`](AGENTS.md), which encodes the same rules in a
form agents follow well.

## Setup

You need Node 18+ and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/flancast90/Chorograph.git
cd Chorograph
pnpm install
pnpm example        # scan examples/streamline and open the report
```

The development loop is short: edit, then re-render the example (or run `pnpm chorograph serve
examples/streamline` and refresh the browser; the scan re-runs on every request).

## Layout

The repo is a pnpm workspace, laid out so more language packages can join later (a Python
package would live at `packages/chorograph-py/`, generated from the same spec).

| path | what lives there |
| --- | --- |
| `spec/graph.schema.json` | **the wire contract**: a standard JSON Schema for `graph.json` — validate a graph in any language |
| `spec/grammar.json` | the tag vocabulary and containment rules, validated by `spec/grammar.schema.json` |
| `scripts/codegen.mjs` | spec → bindings via json-schema-to-typescript + a verbatim grammar embed; `pnpm codegen` regenerates, CI verifies |
| `packages/chorograph/` | the TypeScript package published to npm |
| `packages/chorograph/src/core/annotations.ts` | the scanner: comment extraction, tag grammar, graph assembly |
| `packages/chorograph/src/core/model.ts` | the `Graph` contract (re-exports the generated `model.gen.ts`) |
| `packages/chorograph/src/viewer/` | the React viewer bundled into every report |
| `examples/streamline/` | the reference annotated codebase, used for manual testing |
| `skills/chorograph/` | the agent skill, installable via `npx skills add flancast90/Chorograph` (symlinked into `.agents/` and `.claude/` so cloners get it too) |
| `docs/` | design principles, README assets |

Three invariants worth knowing before you edit:

- **`*.gen.ts` files are generated.** To change kinds, tags, the containment matrix, or the
  `graph.json` shape: edit `spec/graph.schema.json` and/or `spec/grammar.json`, run
  `pnpm codegen`, commit both. CI fails if they drift. Never edit generated files directly.
- **The viewer must not import core** (the report bundle stays browser-only), which is why it has
  its own generated copy of the contract.
- **`dist/viewer.js` is a prebuilt artifact.** `report.ts` prefers it over bundling on the fly,
  so a stale `dist/` can mask viewer changes. `rm -rf packages/chorograph/dist` (or `pnpm build`)
  when the report looks inexplicably old.

## Checks

Everything the CI runs, you can run locally, from the repo root:

```bash
pnpm codegen:check   # spec files are valid and generated code matches them
pnpm typecheck       # tsc, strict, no emit
pnpm test            # vitest; the grammar suite + the graph.json schema conformance test
pnpm build           # dist/: CLI, library, viewer bundle, .d.ts files
```

All three must pass before a PR is mergeable. There is no lint step wired up yet; match the style
of the file you're in.

## Conventions

**Error messages are interface.** The scanner's errors are how users learn the grammar. Every
error carries `file:line`, says what was expected, and where possible suggests a fix
(`did you mean: orders/orders-db/orders?`). All problems report in one pass rather than one at a
time. Hold new errors to that bar, and add a test asserting the message.

**The grammar grows reluctantly.** Every tag and key is something users must learn and agents
must be taught, so the bias is strongly toward zero new surface. If a new tag is genuinely
warranted, it starts in `spec/grammar.json` (and `spec/graph.schema.json` if the wire format
changes), and the same PR updates
`skills/chorograph/SKILL.md`, the README grammar table, and the tests.

**Tests describe behaviour, not implementation.** The suite is organised by what a user would
observe ("nests functions inside endpoints", "rejects targets that match nothing, with
suggestions"). Follow that pattern; avoid tests that reach into internals.

**Comments in this codebase explain why, not what.** Fitting, given what the tool is.

**Viewer changes need eyes.** Render the example and look at it. For anything visual, attach a
screenshot to the PR (headless Chrome against `examples/streamline/.chorograph/report.html`
works well and is what the agents do too).

## Pull requests

- Keep PRs to one idea. Grammar change, viewer change, and docs change are three PRs unless they
  are one feature.
- Write the description for a reviewer who hasn't read the diff: what changed, why, and what you
  looked at to convince yourself it works.
- New behaviour comes with tests; changed behaviour comes with changed tests in the same commit.

## Releases

Publishing is automated. When a commit on `main` carries a `packages/chorograph/package.json`
version that isn't on npm yet, CI builds, tests, publishes with provenance, and tags `v<version>`.
So to release:
bump the version in your PR (patch for fixes, minor for grammar or viewer additions), merge, done.
Never `npm publish` by hand.
