<p align="center">
  <img src="https://raw.githubusercontent.com/flancast90/Chorograph/main/docs/assets/hero.png" width="760" alt="An abstract architecture map drawn as a technical illustration">
</p>

<h1 align="center">chorograph</h1>

<p align="center">Architecture maps drawn from your doc comments.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/chorograph"><img src="https://img.shields.io/npm/v/chorograph?color=2e6f6a" alt="npm version"></a>
  <a href="https://github.com/flancast90/Chorograph/actions/workflows/ci.yml"><img src="https://github.com/flancast90/Chorograph/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/flancast90/Chorograph/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/chorograph?color=555" alt="MIT license"></a>
</p>

Annotate services, databases, and events in the comments you already write. chorograph parses those comments (the TypeScript compiler, parse only, nothing executed) and renders a self-contained HTML map of your system, down to individual functions. No imports. No wrappers. No config. Your code stays exactly as it was.

```ts
/**
 * Places an order and charges it synchronously.
 * @endpoint POST /orders
 * @writes orders-db.orders
 * @emits order.placed so notifications and analytics can react
 * @calls payments.post-charge charge at checkout, in-process for now
 */
export async function placeOrder(items: OrderItem[]): Promise<Order> {
  // your real code, untouched
}
```

```bash
npx chorograph render src
```

<p align="center">
  <img src="https://raw.githubusercontent.com/flancast90/Chorograph/main/docs/assets/map.png" width="820" alt="The rendered report: four domains containing services, endpoints, functions, databases, and events, with typed edges between them">
</p>

## Why comments

Import scanners answer "which file requires which file". That is rarely the question. An architecture map should say what the parts are, how they talk, and why. The doc comment is the one place that already sits next to the code, already gets updated with it, and can hold intent that no scanner could infer: `@emits order.placed so notifications can react`.

Because the input is comments, the scanner never runs your code. Annotated files don't have to be importable, side-effect free, or even type-correct. And because every reference has to resolve, the map can't quietly rot: rename a table and the next render fails with the file and line of every comment still pointing at the old name.

<p align="center">
  <img src="https://raw.githubusercontent.com/flancast90/Chorograph/main/docs/assets/comments-to-map.png" width="700" alt="A source file with a highlighted comment block flowing into a small architecture map">
</p>

## Quick start

Anchor the map once, in any file. Free-standing comments are fine:

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

Declare each service at the top of its file. Everything below attaches to it automatically:

```ts
/**
 * Owns the order lifecycle from cart to fulfilment.
 * @service orders in:Commerce tech:Node.js
 * @consumes payment.captured marks the order paid
 */
```

Then render. You get `.chorograph/graph.json` plus a `report.html` with zero network dependencies, so you can commit it, attach it to a design doc, or send it to a teammate:

```bash
npx chorograph render src
```

## The grammar

One comment declares one node. The prose becomes its description. Edge tags below it declare connections, and free text after a target becomes the edge label:

| tag | declares |
| --- | --- |
| `@system Name` | the map's title, once per codebase |
| `@domain Name` | a bounded context |
| `@service name` | a deployable process |
| `@endpoint POST /orders` | an API surface |
| `@fn [name]` | a function that matters architecturally |
| `@job [name]` | scheduled or background work |
| `@database name` | a database; `tables:a,b` declares its tables inline |
| `@table name` | a table or collection |
| `@cache` / `@bucket` / `@queue` | Redis, S3, SQS, and friends |
| `@event order.placed` | a named domain event |
| `@external Stripe` | a third party you don't operate |
| `@of parent` | file directive: everything below attaches to `parent` |

Six edge verbs, declared on the node doing the verb: `@calls`, `@reads`, `@writes`, `@emits`, `@consumes`, `@uses`. Targets are names, bare when unique (`session-cache`, `Stripe`), dotted when not (`orders-db.orders`). Node tags also accept `tech:"PostgreSQL 16"` and `tags:critical,pci`. `@fn` and `@job` take the documented function's name when you leave theirs out.

## Hierarchy

Containment nests as deep as the design does. Domains hold services and shared infrastructure. Services hold endpoints, jobs, functions, and their private databases, caches, and queues. Endpoints group into resources and hold the functions that implement them. Functions decompose into functions.

A node finds its parent three ways, in order:

1. An explicit `in:` / `of:` key (they're the same key; write whichever reads better). Use a dotted path when a bare name is ambiguous: `of:orders.post-orders`. Case settles ties between a domain `Identity` and a service `identity`.
2. File context: the `@service` above a member, the `@database` above a table, the `@domain` above the rest.
3. A file-level `@of` directive. Large services split across `routes/*.ts` files declare the service once; each file carries a single `/** @of api-gateway */` comment.

So a pricing rule renders inside the endpoint that owns it, a cache one service touches renders inside that service, and a monorepo with hundreds of surfaces stays one map with real depth.

<p align="center">
  <img src="https://raw.githubusercontent.com/flancast90/Chorograph/main/docs/assets/detail.png" width="820" alt="The detail panel for an endpoint, listing what it contains, its connections in both directions, and the file and line where it was declared">
</p>

## The viewer

Everything is always visible. No expand-and-collapse to fight with, and the layout is deterministic (ELK, fixed seed), so the same code produces the same picture every run.

- The legend is the filter: click a kind to show or hide it, and the map re-flows.
- Hover a node to light up its connections with the verb labelled on each edge.
- Click for the detail panel: description, contents, every connection in both directions as clickable sentences, and the `file:line` of the declaring comment.
- Search (`/`) dims non-matches instead of hiding them. `f` fits the view, `esc` clears.

## CLI

```
chorograph render <paths…>   scan doc comments, write graph.json + report.html
chorograph serve <paths…>    serve the report, re-scanning on every refresh
```

| flag | effect |
| --- | --- |
| `--out <dir>` | output directory (default: `.chorograph` next to the first path) |
| `--json` | write `graph.json` only, print meta to stdout |
| `--no-open` | don't open the report after rendering |
| `--port <n>` | port for `serve` (default `4123`) |
| `--quiet` | suppress progress output |

Paths are files or directories, walked recursively. `node_modules`, `dist`, dotfiles, and test files are skipped.

## Working with coding agents

[`docs/SKILL.md`](docs/SKILL.md) teaches an LLM the grammar, the hierarchy rules, and a rubric for when a function deserves an `@fn`. Drop it into your skills directory (Cursor, Claude Code, and similar) and code written in your codebase keeps the map current as a side effect of normal documentation. Agents contributing to chorograph itself should read [`AGENTS.md`](AGENTS.md).

## Example

[`examples/streamline/`](examples/streamline/) is a small fictional e-commerce platform written the way an annotated codebase looks in practice: an architecture anchor, infra and event modules, seven services including a class-based one and a routes file that uses `@of`. Every implementation actually runs, and none of them import chorograph.

```bash
pnpm example
```

## Programmatic API

```ts
import { loadGraph, buildGraph, type Graph } from "chorograph";

const graph: Graph = loadGraph(["src"]);            // scan files on disk
const same = buildGraph([{ path: "a.ts", text }]);  // or bring your own sources
```

`graph.json` is stable and boring on purpose: nodes with `id` / `name` / `kind` / `parent` / `file`, edges with `from` / `to` / `kind` / `label`, counts in `meta`. Pipe it wherever you like.

## Contributing

Bug reports, grammar ideas, and viewer improvements are all welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup and conventions, and [`docs/design-principles.md`](docs/design-principles.md) for the taste the project holds itself to. Releases ship automatically: merging a version bump to `main` publishes to npm.

## License

[MIT](LICENSE)
