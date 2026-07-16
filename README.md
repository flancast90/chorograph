# chorograph

A visual architecture map for reviewing change.

Agentic coding produces very large PRs. The bottleneck has shifted from writing code to reviewing it — and a big diff is far easier to judge as a picture (what got added, removed, rewired) than as thousands of text lines. chorograph renders a codebase as a nested, directed graph — regions › modules › symbols, with directed edges for imports and declared `talksTo` — and is being extended with a diff mode that overlays a change on that graph.

## Quick start

```bash
npx chorograph scan .
```

Writes `.chorograph/graph.json` and `.chorograph/report.html` under the scan root and opens the report. No config file, no annotations required.

## What you get

**The map.** A collapse-first nested canvas: regions nest arbitrarily deep, modules are source files, symbols are annotated exports. Directed edges show `import` dependencies and declared `talksTo` links; they roll up when a container is collapsed. Edge color encodes `comms` (in-proc, http, sql, …); thickness encodes rolled-up weight.

**The semantics.** Role and comms filters, a dead-code toggle, search (`/`), a persistent detail panel, and keyboard navigation. Precomputed layout (ELK) keeps pan/zoom smooth on large graphs — collapse-first level-of-detail means the viewer never draws every node at once.

**The artifacts.** A self-contained `report.html` (inlined viewer + data) and `graph.json` (the serialisable `Graph` contract). Commit either, share the HTML, or pipe JSON into your own tooling.

## Optional annotations

chorograph is zero-config: structure comes from the directory tree, edges from `import` statements. A `@chorograph` JSDoc tag is optional enrichment — add semantics the code cannot reveal (`role`, `comms`, `talksTo`, `status`), mark entrypoints (`root`), or override a node's `group` when folders do not match the logical architecture.

```ts
/**
 * Persists chat threads and messages.
 * @chorograph repository group="Adapters/Postgres" comms=sql talksTo=Postgres
 */
export class ChatRepo { /* … */ }
```

| key | meaning |
| --- | --- |
| *(bare token)* | shorthand for `role` — `repository`, `usecase`, `agent-tool`, … |
| `group` | slash path overriding directory-derived placement: `group="Domain/Ports"` |
| `role` / `roles` | semantic sub-types for filtering (lists split on `;` or `,`) |
| `comms` | how it talks outward: `in-proc`, `http`, `sql`, `sse`, `queue`, `llm`, … |
| `talksTo` | named external systems or nodes; quote multi-word names |
| `status` | `active` (default) · `deprecated` · `experimental` |
| `root` | bare token marking a legitimate entrypoint (never flagged dead) |
| `tags` / `name` | extra labels · override the display name |

For a mechanical rubric aimed at coding agents, see [`docs/agent-guide.md`](docs/agent-guide.md).

## How it works

1. **Discover** — recurse the scan root for `.ts`/`.tsx`/`.mts`/`.cts` files (skipping `node_modules`, `dist`, and other build dirs). Every source file becomes a `module` node.
2. **Structure** — each module's `group` defaults to its directory path relative to the scan root; assembly builds a nested region tree from those paths. An annotation `group=` overrides when the folder layout and logical architecture diverge.
3. **Edges** — `import` statements are resolved with the TypeScript compiler API (parse-only, no type-checking). Declared `talksTo` in annotations become directed `talks-to` edges.
4. **Assembly** — the core wires containment parents, rolls up cross-boundary edges, and computes deadness on two axes: **orphans** (non-root symbols with zero inbound edges) and **unreachable** (nodes not reachable from any `root` entrypoint by following directed edges). `status=deprecated` is a third dead axis.

Bring your own language by implementing the `Provider` interface; the core (region tree, rollup, deadness, layout, viewer) is language-agnostic. TypeScript/JavaScript ships in the box.

## CLI reference

```
chorograph [scan] <dir>    scan a directory → graph.json + report.html (default)
chorograph serve <dir>     scan, then serve the report with live re-scan
```

| flag | effect |
| --- | --- |
| `--out <dir>` | output directory (default: `<dir>/.chorograph`) |
| `--json` | write `graph.json` only; print `graph.meta` to stdout; no HTML |
| `--no-open` | do not open the report in a browser after scan |
| `--no-annotations` | ignore `@chorograph` tags; folder structure + imports only |
| `--port <n>` | port for `serve` (default: `4123`) |
| `--quiet` | suppress progress output |

Examples:

```bash
npx chorograph scan ./packages
npx chorograph serve ./src --port 5000
npx chorograph scan . --json --no-open
npx chorograph scan . --no-annotations --out build/map
```

### Reviewing changes (coming)

`chorograph diff [base] [head]` will overlay a change on the architecture map — added, removed, and rewired nodes and edges highlighted on the same nested graph. The command is in progress; expect the interface to evolve.

## Programmatic API

```ts
import { scan } from "chorograph";

const graph = await scan("./src", {
  annotations: true,          // default; set false to skip @chorograph tags
  onWarn: (msg) => console.warn(msg),
});

console.log(graph.meta.counts);
console.log(graph.dead.orphans, graph.dead.unreachable);
```

Also exported: `assemble`, `createTypeScriptProvider`, `parseAnnotation`, and the `Graph` / `Provider` types from `src/core/model.ts`.

## Design principles

The map is the product. chorograph is built to read like an instrument a principal engineer reaches for — calm, dense, typographic — not a generated infographic. See [`docs/design-principles.md`](docs/design-principles.md).

## License

MIT.
