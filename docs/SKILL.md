---
name: chorograph
description: Declare software architecture inline in TypeScript code using chorograph wrappers and decorators, so the codebase always renders an accurate architecture map. Use when writing or modifying services, endpoints, jobs, databases, queues, events, or external integrations in a codebase that uses chorograph.
---

# Declaring architecture with chorograph

chorograph renders an architecture map from declarations that live **inside the real code**. Your
job when writing code in a chorograph codebase: every architecturally significant thing you create
or change must carry its declaration. The map is generated with `chorograph render <dirs>` — it
shows exactly what is declared, nothing else. Undeclared code is invisible; stale edges are lies.
Both are bugs you can prevent mechanically by following this skill.

## The vocabulary

Node kinds (each container's children in parentheses):

- `domain` (anything) — a bounded context: `domain("Commerce")`
- `service` (endpoints, functions, jobs) — a deployable process
- `endpoint` — an API surface: HTTP route, RPC method. Name it after the route: `"POST /orders"`
- `function` — an architecturally significant function inside a service
- `job` — scheduled or background work
- `database` (tables), `table`, `cache`, `bucket`, `queue` — state and transport
- `event` — a named domain event: `"order.placed"`
- `external` — a third party you don't operate: `"Stripe"`

Edge verbs — declared on the node doing the verb, always reading as a sentence:

- `calls` — request/response (label with protocol: `calls: [[signup, "HTTP"]]`)
- `reads` / `writes` — store access
- `emits` / `consumes` — event flow (targets must be events)
- `uses` — escape hatch; prefer a specific verb

## Function-style code (preferred for plain functions)

Wrap the implementation. The wrapper returns your function unchanged and stamps it with a node
identity, so other declarations can import and point at it:

```ts
import { domain } from "chorograph";

export const commerce = domain("Commerce");
export const orders = commerce.service("orders", { tech: "Node.js" });
export const ordersDb = commerce.database("orders-db", { tech: "PostgreSQL 16" });
export const ordersTable = ordersDb.table("orders");
export const orderPlaced = commerce.event("order.placed");

export const placeOrder = orders.endpoint(
  "POST /orders",
  { writes: [ordersTable], emits: [orderPlaced] },
  async (input: PlaceOrderInput): Promise<Order> => {
    // real implementation — callers invoke placeOrder(...) directly
  },
);

export const calculateTotal = orders.fn(
  "calculateTotal",
  { description: "Single source of truth for order arithmetic." },
  (items: readonly OrderItem[]): number => items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0),
);
```

## Class-style code (decorators)

```ts
import { service, endpoint, func, job, archRef } from "chorograph";

@service("payments", { domain: commerce, tech: "Node.js", description: "Only service allowed to talk to Stripe." })
export class PaymentsService {
  @endpoint("POST /charge", { calls: [[stripe, "create charge"]], writes: [ledgerTable], emits: [paymentCaptured] })
  async charge(orderId: string, amountCents: number) { /* real implementation */ }

  @job("reconcile-payments", { reads: [ledgerTable], calls: [[stripe, "list charges"]] })
  async reconcile() { /* ... */ }

  @func() // name defaults to the method name
  computeFees(amountCents: number) { /* ... */ }
}
```

To point an edge at a decorated class from another module: `calls: [archRef(PaymentsService)]`.

## Rules

1. **Declare at creation.** New service, endpoint, job, table, queue, event, or third-party
   integration ⇒ declare it in the same commit, in the same file as the code.
2. **Edges live with the subject.** When code starts reading a table, calling a service, or
   emitting an event, add the verb to *that* code's declaration options. When it stops, remove it.
3. **Reference handles, never strings.** Import the handle (or wrapped function, or `archRef` of a
   class) and point at it. If the import breaks, the edge was stale — that's the system working.
4. **`system("Name")` exactly once** per codebase, in the architecture anchor module (where domains
   and externals are declared).
5. **Module top-levels must stay side-effect free.** Declarations run at import time; anything
   else (starting servers, opening connections) belongs inside functions. Keep bootstraps behind a
   `main()` in files you don't hand to `chorograph render`.
6. **Names are unique within their parent** and become slug ids (`commerce/orders/post-orders`).

## Granularity rubric for `fn`

Declare a `function` node when a function is a *load-bearing part of the design*: it owns a rule
(pricing, fees, auth), it is the single place something happens (template rendering, password
hashing), or it has its own architectural edges (reads a cache, calls a third party). Do **not**
declare helpers, mappers, or glue — a service with thirty `fn` nodes is noise, one with three to
seven is a map.

## Verifying

```bash
npx chorograph render <dirs…> --json --quiet   # builds the map, errors on broken declarations
```

Run it after changing declarations. Duplicate names, self-edges, non-event `emits`/`consumes`
targets, and decorated members without a `@service` class all fail with precise messages.
