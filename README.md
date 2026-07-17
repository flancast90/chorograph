# chorograph

Architecture declared inside the code. Wrap your functions, decorate your classes, and get a
clear, shareable map of your system — services, databases, events, and how they connect, down to
individual functions.

chorograph deliberately does **not** infer architecture. Import graphs answer “which file requires
which file”, which is rarely the question; an architecture map should answer “what are the parts
of this system and how do they talk”. chorograph gives you a small, typed API for asserting those
facts *next to the code they describe* — the declaration wraps the real implementation, so deleting
the code deletes the node, and edges are imports that break at compile time when they go stale.
(If you want a scanned import graph, that's a different tool — reach for tree-sitter.)

## Quick start

Declare architecture in your real modules:

```ts
// src/architecture.ts — the anchors
import { system, domain, external } from "chorograph";

system("Acme");
export const commerce = domain("Commerce");
export const stripe = external("Stripe");
```

```ts
// src/orders.ts — real code, declared as it's written
import { archRef } from "chorograph";
import { commerce } from "./architecture.ts";

export const orders = commerce.service("orders", { tech: "Node.js" });
export const ordersDb = commerce.database("orders-db", { tech: "PostgreSQL 16" });
export const ordersTable = ordersDb.table("orders");
export const orderPlaced = commerce.event("order.placed");

// The wrapper returns the handler unchanged — callers use placeOrder() like any function.
export const placeOrder = orders.endpoint(
  "POST /orders",
  { writes: [ordersTable], emits: [orderPlaced] },
  async (input: PlaceOrderInput) => {
    /* real implementation */
  },
);
```

Render the map:

```bash
npx chorograph render src
```

That imports your modules, collects the declarations, and writes `.chorograph/graph.json` plus a
self-contained `.chorograph/report.html` (no network dependencies — commit it, attach it to a
design doc, send it to a teammate).

## Two styles, one map

**Function style** — wrappers that return your implementation unchanged, stamped with a node
identity so other declarations can point at it. `service.endpoint(name, opts, impl)`,
`service.fn(…)`, `service.job(…)`.

**Class style** — stage-3 decorators (TypeScript 5, no config needed):

```ts
import { service, endpoint, func, job } from "chorograph";

@service("payments", { domain: commerce, calls: [[stripe, "charge + refund"]] })
export class PaymentsService {
  @endpoint("POST /charge", { writes: [ledgerTable], emits: [paymentCaptured] })
  async charge(orderId: string, amountCents: number) { /* real implementation */ }

  @job("reconcile-payments", { reads: [ledgerTable] })
  async reconcile() { /* … */ }

  @func() // name defaults to the method name
  computeFees(amountCents: number) { /* … */ }
}
```

Mix freely. To point an edge at a decorated class from another module, use
`archRef(PaymentsService)`.

## The vocabulary

**Things** (nodes) — a small closed set; each kind has one icon and one colour everywhere:

| kind | what it is | contains |
| --- | --- | --- |
| `domain` | a bounded context / grouping | anything |
| `service` | a deployable process | endpoints, functions, jobs |
| `endpoint` | an API surface (`"POST /orders"`) | — |
| `function` | an architecturally significant function | — |
| `job` | scheduled or background work | — |
| `database` | a database instance | tables |
| `table` | a table / collection | — |
| `cache` / `bucket` / `queue` | Redis / S3 / SQS and friends | — |
| `event` | a named domain event | — |
| `external` | a third party you don't operate | — |

Every declaration accepts `{ description, tech, tags }` plus edge verbs. Descriptions surface in
the detail panel, so a well-annotated map doubles as onboarding documentation.

**Connections** (edges) — six verbs declared on the node doing the verb, each drawn in its own
colour and line style. Targets are handles (or wrapped functions, or `archRef` of classes) — never
strings — so a typo is a compile error and a stale edge is a broken import:

| verb | meaning |
| --- | --- |
| `calls: [[target, "HTTP"]]` | request/response; label with the protocol |
| `reads: [store]` / `writes: [store]` | store access |
| `emits: [event]` / `consumes: [event]` | event flow (targets must be events) |
| `uses: [thing]` | escape hatch when no verb fits |

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
chorograph render <paths…>   load declarations → graph.json + report.html (default command)
chorograph serve <paths…>    serve the report; re-imports the code on every refresh
```

Paths are files or directories (walked recursively; `node_modules`, `dist`, dotfiles, and
`*.test.*` are skipped). Modules are bundled with esbuild and imported, so declarations must be
importable without side effects — keep server bootstraps behind a `main()` you don't pass in.

| flag | effect |
| --- | --- |
| `--out <dir>` | output directory (default: `.chorograph` next to the first path) |
| `--json` | write `graph.json` only; print meta to stdout; no HTML |
| `--no-open` | don't open the report after rendering |
| `--port <n>` | port for `serve` (default `4123`) |
| `--quiet` | suppress progress output |

## Give your coding agent the skill

[`docs/SKILL.md`](docs/SKILL.md) is an agent skill that teaches an LLM to declare architecture as
it writes code — the vocabulary, both styles, where declarations go, and a granularity rubric for
function-level nodes. Drop it into your skills directory (Cursor, Claude Code, etc.) and code
written in your codebase keeps the map current as a side effect.

## Example

[`examples/streamline/`](examples/streamline/) is a fictional e-commerce platform written the way
a real annotated codebase looks — architecture anchors, infra and event modules, and six services
(five function-style, one decorator class) with working implementations:

```bash
pnpm example   # renders examples/streamline → examples/streamline/.chorograph/
```

## Programmatic API

```ts
import { collectGraph, resetRegistry, type Graph } from "chorograph";

resetRegistry();
await import("./my-annotated-modules.ts");
const graph: Graph = collectGraph({ version: "1.0.0" });
// graph.nodes, graph.edges, graph.meta.counts — the same contract as graph.json
```

`graph.json` is stable and boring on purpose: nodes with `id`/`name`/`kind`/`parent`, edges with
`from`/`to`/`kind`, counts in `meta`. Pipe it wherever you like.

## Design principles

The map is the product — calm, light, typographic; colour only where it carries meaning. See
[`docs/design-principles.md`](docs/design-principles.md).

## License

MIT.
