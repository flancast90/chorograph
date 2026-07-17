# chorograph

Architecture as code. Declare your services, databases, events, and how they connect — in plain
TypeScript — and get a clear, shareable map.

chorograph deliberately does **not** scan your source code. Import graphs answer “which file
requires which file”, which is rarely the question; an architecture map should answer “what are the
parts of this system and how do they talk”. Those facts live in someone's head until they are
written down, so chorograph gives you a small, typed API for writing them down — and renders
exactly what you wrote, nothing inferred, nothing guessed. (If you want a scanned import graph,
that's a different tool — reach for tree-sitter.)

## Quick start

Create `system.ts`:

```ts
import { defineSystem } from "chorograph";

export default defineSystem("Acme", (s) => {
  const gateway = s.service("api-gateway", { tech: "Node.js" });

  const commerce = s.domain("Commerce");
  const orders = commerce.service("orders");
  const placeOrder = orders.endpoint("POST /orders");
  const db = commerce.database("orders-db", { tech: "PostgreSQL 16" });
  const ordersTable = db.table("orders");
  const placed = commerce.event("order.placed");
  const mailer = s.service("mailer");

  s.calls(gateway, placeOrder, "HTTP");
  s.writes(orders, ordersTable);
  s.emits(orders, placed);
  s.consumes(mailer, placed);
});
```

Render it:

```bash
npx chorograph render system.ts
```

That writes `.chorograph/graph.json` and `.chorograph/report.html` next to the definition and opens
the report — a single self-contained HTML file with no network dependencies. Commit it, attach it
to a design doc, or send it to a teammate.

## The vocabulary

**Things** (nodes) — a small closed set; each kind has one icon and one colour everywhere:

| kind | what it is | created with | contains |
| --- | --- | --- | --- |
| `domain` | a bounded context / grouping | `s.domain(name)` | anything |
| `service` | a deployable process | `s.service(name)` | endpoints, jobs |
| `endpoint` | an API surface a service exposes | `service.endpoint(name)` | — |
| `job` | scheduled or background work | `service.job(name)` | — |
| `database` | a database instance | `s.database(name)` | tables |
| `table` | a table / collection | `database.table(name)` | — |
| `cache` | Redis, Memcached, … | `s.cache(name)` | — |
| `bucket` | S3, GCS, … | `s.bucket(name)` | — |
| `queue` | SQS, Kafka topic, … | `s.queue(name)` | — |
| `event` | a named domain event | `s.event(name)` | — |
| `external` | a third party you don't operate | `s.external(name)` | — |

Every factory accepts `{ description, tech, tags }`. Descriptions surface in the detail panel, so a
well-annotated map doubles as onboarding documentation.

**Connections** (edges) — six verbs, each drawn in its own colour and line style. Every edge reads
as a sentence, `from` doing the verb to `to`:

| verb | meaning |
| --- | --- |
| `s.calls(a, b, label?)` | request/response: `a` invokes `b` (label it `"HTTP"`, `"gRPC"`, …) |
| `s.reads(a, store)` | `a` reads from a store |
| `s.writes(a, store)` | `a` writes to a store |
| `s.emits(a, event)` | `a` publishes the event |
| `s.consumes(a, event)` | `a` subscribes to the event |
| `s.uses(a, b, label?)` | escape hatch when no verb fits |

Connections take the handles returned by the factories — never strings — so a typo is a compile
error and renaming a service updates every edge that touches it.

## The viewer

Everything is always visible — there is no expand/collapse to fight with. The layout is computed
once (ELK, deterministic) and the viewer stays out of your way:

- **Legend = filters.** The sidebar lists every kind present with its icon and count; click to
  show/hide that kind. Hiding re-runs layout so the map re-flows instead of leaving holes.
- **Hover** a node to light up its connections and fade the rest, with the verb labelled on each
  lit edge.
- **Click** a node for the detail panel: description, tech, contents, and every connection in both
  directions as clickable sentences (`reads → orders-db`, `← called by api-gateway`).
- **Search** (`/`) dims non-matches instead of hiding them — spatial memory is the point of a map.
- `f` fits the view, `esc` clears, drag pans, scroll zooms.

## CLI

```
chorograph render <system.ts>   definition → graph.json + report.html (default command)
chorograph serve <system.ts>    serve the report; rebuilds from the definition on every refresh
```

| flag | effect |
| --- | --- |
| `--out <dir>` | output directory (default: `.chorograph` next to the definition) |
| `--json` | write `graph.json` only; print meta to stdout; no HTML |
| `--no-open` | don't open the report after rendering |
| `--port <n>` | port for `serve` (default `4123`) |
| `--quiet` | suppress progress output |

Definition files are bundled with esbuild before loading, so they can import helpers, share
constants, or be split across modules — anything that default-exports `defineSystem(…)` works.

## Example

[`examples/streamline.ts`](examples/streamline.ts) is a fictional e-commerce platform that
exercises every kind and every verb — four domains, seven services, endpoints, jobs, three
databases with tables, a cache, a bucket, a queue, five events, and three third parties:

```bash
pnpm example   # renders examples/streamline.ts and writes examples/.chorograph/
```

## Programmatic API

```ts
import { defineSystem, type Graph } from "chorograph";

const system = defineSystem("Acme", (s) => {
  /* … */
});

const graph: Graph = system.toGraph({ version: "1.0.0" });
// graph.nodes, graph.edges, graph.meta.counts — the same contract as graph.json
```

`graph.json` is stable and boring on purpose: nodes with `id`/`name`/`kind`/`parent`, edges with
`from`/`to`/`kind`, counts in `meta`. Pipe it wherever you like.

## Design principles

The map is the product — calm, light, typographic; colour only where it carries meaning. See
[`docs/design-principles.md`](docs/design-principles.md).

## License

MIT.
