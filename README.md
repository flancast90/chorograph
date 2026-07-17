<h1 align="center">chorograph</h1>

<p align="center">Architecture maps drawn from your doc comments.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/chorograph"><img src="https://img.shields.io/npm/v/chorograph?color=2e6f6a" alt="npm version"></a>
  <a href="https://github.com/flancast90/Chorograph/actions/workflows/ci.yml"><img src="https://github.com/flancast90/Chorograph/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/flancast90/Chorograph/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/chorograph?color=555" alt="MIT license"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/flancast90/Chorograph/main/docs/assets/map.png" width="860" alt="A rendered chorograph report: domains containing services, endpoints, functions, databases, and events, with typed edges between them">
</p>

Describe your system in the comments you already write. chorograph parses them statically (nothing imported, nothing executed) and renders a self-contained HTML map, down to individual functions. Your code needs no imports, no wrappers, no config. And because every reference must resolve, a rename or deletion fails the next render with the exact file and line, so the map can't quietly rot.

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

## Quick start

Three kinds of comments and you have a map:

```ts
// 1. Anchor — once, in any file. Free-standing comments are fine.
/** @system Acme */
/** @domain Commerce */
/** @external Stripe in:Commerce */

// 2. Infrastructure — where it's configured.
/** @database orders-db in:Commerce tech:"PostgreSQL 16" tables:orders,order_items */
export const db = createPool(process.env.ORDERS_DB_URL);

/** @event order.placed in:Commerce */

// 3. Each service — top of its file. Endpoints, functions, and jobs below attach automatically.
/**
 * Owns the order lifecycle from cart to fulfilment.
 * @service orders in:Commerce tech:Node.js
 * @consumes payment.captured marks the order paid
 */
```

`npx chorograph render src` writes `.chorograph/graph.json` and `report.html` (no network dependencies; open it anywhere, commit it, send it). `chorograph serve src` re-scans on every browser refresh. [`examples/streamline/`](examples/streamline/) is a full working example.

## The grammar

One comment declares one node; its prose becomes the description. Edge tags in the same comment declare connections, and text after the target becomes the label: the *why*.

| tag | declares |
| --- | --- |
| `@system` / `@domain` | the map's title, a bounded context |
| `@service name` | a deployable process |
| `@endpoint POST /orders` | an API surface |
| `@fn` / `@job` | a significant function / background work (name inferred from the code) |
| `@database name tables:a,b` | a database and its tables |
| `@table` / `@cache` / `@bucket` / `@queue` | state and transport |
| `@event order.placed` | a named domain event |
| `@external Stripe` | a third party you don't operate |
| `@of parent` | file directive: everything below attaches to `parent` |

Edges: `@calls`, `@reads`, `@writes`, `@emits`, `@consumes`, `@uses`. Target by name, dotted when ambiguous (`orders-db.orders`).

Containment nests as deep as the design does: services hold endpoints, jobs, and private infrastructure; endpoints hold the functions that implement them; functions decompose into functions. Parents come from an explicit `in:`/`of:` key, the file's context, or a file-level `@of`, which is how one service spreads across `routes/*.ts` files.

<p align="center">
  <img src="https://raw.githubusercontent.com/flancast90/Chorograph/main/docs/assets/detail.png" width="860" alt="The detail panel for an endpoint: what it contains, its connections in both directions, and the file and line where it was declared">
</p>

In the viewer, everything is always visible and the layout is deterministic. The legend filters, hover lights up connections, click opens the detail panel with the declaring `file:line`, and `/` searches.

## For coding agents

Drop [`docs/SKILL.md`](docs/SKILL.md) into your skills directory (Cursor, Claude Code, and similar) and agents writing code in your codebase keep the map current as a side effect of normal documentation.

## Contributing

`pnpm install && pnpm example` gets you a rendered map in under a minute; `pnpm typecheck && pnpm test` is the gate. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the conventions, [`AGENTS.md`](AGENTS.md) the agent version, and [`docs/design-principles.md`](docs/design-principles.md) the taste. Releases are automatic: merge a version bump to `main` and CI publishes to npm.

## License

[MIT](LICENSE)
