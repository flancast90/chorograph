# chorograph

A **chorography** of your codebase — the cartographer's art of mapping regions and how they connect.
Point it at any TypeScript project and get a live, nested map: every layer, service, and function, and
the directed edges showing how they actually talk to each other, the way it flows in production.

- **Drop-in.** No repo layout assumptions, no config file. Recurses whatever directory you point at.
- **Mechanical to adopt.** Structure comes from one-line annotations — trivial for a coding agent to
  add across a codebase, one comment per file.
- **Directed & nested.** Regions nest into regions; edges carry direction and roll up when you collapse.
- **Smooth at scale.** Collapse-first with precomputed layout; stays fluid on very large graphs.
- **Self-contained output.** A single `report.html` you can open, commit, or share. No server required.

## Quickstart

```bash
npx chorograph ./src
```

That writes `.chorograph/graph.json` + `.chorograph/report.html` and opens the map. That's it.

```bash
chorograph scan ./packages        # scan a directory
chorograph serve ./packages       # scan + serve on http://localhost:4123
chorograph ./src --json           # graph only, no HTML (for CI / tooling)
chorograph ./src --out build/map  # choose the output directory
```

## How it maps your code

Two facts drive the map, and only two:

1. **`import` statements** — read straight from the code (a fact, not a convention) to draw directed
   dependency edges. chorograph never guesses meaning from folder names.
2. **`@chorograph` annotations** — a one-line JSDoc comment that says what a thing *is* and where it
   belongs. This is the only place structure comes from.

A file becomes a node the moment it carries an annotation. Annotated declarations inside it become
their own nodes. Everything else is ignored, so you opt in exactly as much as you want.

## The annotation (all you need to learn)

Put a JSDoc comment on a file (top of file) or an export:

```ts
/**
 * Persists chat threads and messages.
 * @chorograph repository group="Adapters/Postgres" comms=sql talksTo=Postgres
 */
export class ChatRepo { /* … */ }
```

| key        | meaning                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| *(bare)*   | the first word with no `=` is the **role** — `repository`, `agent-tool`, `usecase`, …       |
| `group`    | slash path placing it in the tree: `group="Domain/Ports"`. **The only structural key.**     |
| `role` / `roles` | semantic sub-types for filtering (a node keeps its type *and* its roles).              |
| `comms`    | how it talks: `in-proc http sse sql queue temporal oauth llm embedding s3 smtp mcp cron`.    |
| `talksTo`  | things it calls; resolves to a node by name, or becomes an external system.                  |
| `status`   | `active` (default) · `deprecated` · `experimental`.                                          |
| `root`     | bare token marking a legitimate entrypoint (so it's never flagged dead).                     |
| `tags` / `name` | extra labels · override the display name.                                               |

Lists split on `;` or `,`; quote values with spaces: `talksTo=Stripe;"SAM.gov API"`.

`@archmap` is accepted as a legacy alias (its `kind=` maps to `role`, `layer=` to `group`).

### For coding agents

Adopting chorograph is deliberately mechanical: add one module-level annotation per source file with a
`group` and a `role`, and mark entrypoints with `root`. No ordering, no cross-file bookkeeping. See
[`docs/agent-guide.md`](docs/agent-guide.md) for a copy-paste rubric.

## What you get

- **Regions** you can expand and collapse, nested to any depth you declare.
- **Directed edges** colored by `comms`, thickness by rolled-up weight; hover a node to light its wiring.
- **Filters** by role (including things like `agent-tool`), by `comms`, and a dead-code toggle.
- **Dead-code axes:** structural orphans (nothing points at them) and unreachable-from-entrypoints.
- **Search + a detail panel**, keyboard-first.

## Library use

```ts
import { scan } from "chorograph";

const graph = await scan("./src");
console.log(graph.meta.counts, graph.dead.orphans);
```

Bring your own language by implementing the `Provider` interface (`src/core/model.ts`); the core
(region tree, rollup, deadness, layout, viewer) is language-agnostic. TypeScript ships in the box.

## Design

The map is the product. chorograph is built to look like an instrument, not a generated infographic —
see [`docs/design-principles.md`](docs/design-principles.md).

## License

MIT.
