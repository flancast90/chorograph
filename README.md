# chorograph

Architecture declared in doc comments. Annotate your services, databases, and events in the
comments you'd write anyway, and get a clear, shareable map of your system — down to individual
functions — without importing anything, wrapping anything, or executing anything.

```ts
/**
 * Places an order and charges it synchronously.
 * @endpoint POST /orders
 * @writes orders-db.orders
 * @emits order.placed so notifications and analytics can react
 * @calls payments.post-charge charge at checkout, in-process for now
 */
export async function placeOrder(items: OrderItem[]): Promise<Order> {
  // your real code, exactly as it was
}
```

```bash
npx chorograph render src
```

chorograph deliberately does **not** infer architecture. Import graphs answer “which file requires
which file”, which is rarely the question; an architecture map should answer “what are the parts
of this system, how do they talk, and *why*”. So the input is the doc comment: the one place that
already sits next to the code, already gets updated with it, and can carry intent (“so
notifications can react”) that no scanner could ever infer. (If you want a scanned import graph,
that's a different tool — reach for tree-sitter.)

The scanner parses your source with the TypeScript compiler — **parse only, nothing runs**.
Annotated code doesn't need to be side-effect free, importable, or even type-correct.

## Quick start

Anchor the map once, anywhere (free-standing comments are fine):

```ts
// src/architecture.ts
/**
 * Storefront traffic in, orders and emails out.
 * @system Acme
 */

/** @domain Commerce */

/** @external Stripe in:Commerce */
export {};
```

Annotate infrastructure where it's configured:

```ts
/** @database orders-db in:Commerce tech:"PostgreSQL 16" tables:orders,order_items */
export const db = createPool(process.env.ORDERS_DB_URL);

/** @event order.placed in:Commerce */
export const ORDER_PLACED = "order.placed";
```

Annotate each service at the top of its file — members below attach to it automatically:

```ts
/**
 * Owns the order lifecycle from cart to fulfilment.
 * @service orders in:Commerce tech:Node.js
 * @consumes payment.captured marks the order paid
 */

/**
 * The single source of truth for order arithmetic.
 * @fn
 */
export function calculateTotal(items: readonly OrderItem[]): number { … }
```

Then render:

```bash
npx chorograph render src
```

That scans the comments and writes `.chorograph/graph.json` plus a self-contained
`.chorograph/report.html` (no network dependencies — commit it, attach it to a design doc, send
it to a teammate).

## The grammar

One comment declares one node; the prose becomes its description; edge tags below it declare its
connections, with free text after the target becoming the edge label — the *why*.

**Node tags** — a small closed set; each kind has one icon and one colour everywhere:

| tag | what it declares | contains |
| --- | --- | --- |
| `@system Name` | the map's title (once per codebase) | — |
| `@domain Name` | a bounded context | anything |
| `@service name` | a deployable process | endpoints, functions, jobs |
| `@endpoint POST /orders` | an API surface | — |
| `@fn [name]` | an architecturally significant function | — |
| `@job [name]` | scheduled or background work | — |
| `@database name` | a database (`tables:a,b` declares its tables inline) | tables |
| `@table name` | a table / collection | — |
| `@cache` / `@bucket` / `@queue` | Redis / S3 / SQS and friends | — |
| `@event order.placed` | a named domain event | — |
| `@external Stripe` | a third party you don't operate | — |

Keys on any node tag: `in:`/`of:` (both mean "my parent is" — write whichever reads better),
`tech:"PostgreSQL 16"`, `tags:critical,pci`. `@fn` and `@job` take their name from the function
they document when you don't give one.

**Hierarchy nests as deep as the design does.** Domains hold domains, services, and shared
infrastructure; services hold endpoints, functions, jobs, and their *private* databases, caches,
and queues; endpoints hold functions (and endpoints, for resource groups); functions and jobs
decompose into functions. Three ways a node finds its parent, in precedence order:

1. An explicit `in:`/`of:` key — a name, or a dotted path (`of:orders.post-orders`) when the
   name isn't unique. Case decides ties: `in:Identity` is the domain, `identity` the service.
2. File context — the `@service` declared above a member, the `@database` above a table, the
   `@domain` above anything a domain holds.
3. A file-level `@of` directive — `/** @of api-gateway */` in its own comment, for files whose
   parent is declared elsewhere. That's how a large service splits into `routes/*.ts` files:
   declare the service once, give each routes file one `@of` line.

So a rule that belongs to one endpoint renders inside it, a cache only one service touches
renders inside that service, and a monorepo with hundreds of surfaces stays one map with real
depth instead of a flat sea of boxes.

**Edge tags** — six verbs, declared on the node doing the verb, each drawn in its own colour and
line style:

| tag | meaning |
| --- | --- |
| `@calls target [why]` | request/response |
| `@reads target [why]` / `@writes target [why]` | store access |
| `@emits event [why]` / `@consumes event [why]` | event flow (target must be an event or queue) |
| `@uses target [why]` | escape hatch when no verb fits |

Targets are names: bare when unique (`session-cache`, `Stripe`, `order.placed`), dot-qualified
when not (`orders-db.orders`, `payments.post-charge`). Every target must resolve to exactly one
node — a typo, a rename, or a deleted table fails the render with `file:line` and suggestions.
That error is the freshness mechanism: the map refuses to build from stale facts.

## The viewer

Everything is always visible — there is no expand/collapse to fight with. The layout is computed
once (ELK, deterministic) and the viewer stays out of your way:

- **Legend = filters.** The sidebar lists every kind present with its icon and count; click to
  show/hide that kind. Hiding re-runs layout so the map re-flows instead of leaving holes.
- **Hover** a node to light up its connections and fade the rest, with the verb labelled on each
  lit edge.
- **Click** a node for the detail panel: description, tech, contents, every connection in both
  directions as clickable sentences (`reads → orders-db`, `← called by api-gateway`), and the
  `file:line` where it was declared.
- **Search** (`/`) dims non-matches instead of hiding them — spatial memory is the point of a map.
- `f` fits the view, `esc` clears, drag pans, scroll zooms.

## CLI

```
chorograph render <paths…>   scan doc comments → graph.json + report.html (default command)
chorograph serve <paths…>    serve the report; re-scans the code on every refresh
```

Paths are files or directories (walked recursively; `node_modules`, `dist`, dotfiles, and
`*.test.*` are skipped). `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts` and friends are scanned.

| flag | effect |
| --- | --- |
| `--out <dir>` | output directory (default: `.chorograph` next to the first path) |
| `--json` | write `graph.json` only; print meta to stdout; no HTML |
| `--no-open` | don't open the report after rendering |
| `--port <n>` | port for `serve` (default `4123`) |
| `--quiet` | suppress progress output |

## Give your coding agent the skill

[`docs/SKILL.md`](docs/SKILL.md) is an agent skill that teaches an LLM to annotate architecture
as it writes code — the grammar, where annotations go, and a granularity rubric for
function-level nodes. Drop it into your skills directory (Cursor, Claude Code, etc.) and code
written in your codebase keeps the map current as a side effect of normal documentation.

## Example

[`examples/streamline/`](examples/streamline/) is a fictional e-commerce platform written the way
a real annotated codebase looks — an architecture anchor, infra and event modules, and seven
services (including a class-based one) with working implementations and zero chorograph imports:

```bash
pnpm example   # renders examples/streamline → examples/streamline/.chorograph/
```

## Programmatic API

```ts
import { loadGraph, buildGraph, type Graph } from "chorograph";

const graph: Graph = loadGraph(["src"]);            // scan files on disk
const same = buildGraph([{ path: "a.ts", text }]);  // or bring your own sources
// graph.nodes, graph.edges, graph.meta.counts — the same contract as graph.json
```

`graph.json` is stable and boring on purpose: nodes with `id`/`name`/`kind`/`parent`/`file`,
edges with `from`/`to`/`kind`/`label`, counts in `meta`. Pipe it wherever you like.

## Design principles

The map is the product — calm, light, typographic; colour only where it carries meaning. See
[`docs/design-principles.md`](docs/design-principles.md).

## License

MIT.
