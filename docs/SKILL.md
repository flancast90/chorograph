---
name: chorograph
description: Declare software architecture in doc comments so the codebase always renders an accurate architecture map. Use when writing or modifying services, endpoints, jobs, databases, queues, events, or external integrations in a codebase that uses chorograph.
---

# Declaring architecture with chorograph

chorograph renders an architecture map from **doc comments on the real code**. Nothing is
imported or executed — the tags below are the entire mechanism. Your job when writing code in a
chorograph codebase: every architecturally significant thing you create or change must carry its
annotation, in the same comment where you'd document it anyway. The map is generated with
`chorograph render <dirs>` — it shows exactly what is annotated, nothing else. Undeclared code is
invisible; stale edges are lies. Both are bugs you prevent by following this skill.

## The shape of an annotation

One comment declares one node, plus that node's edges. The prose becomes the node's description;
free text after an edge target becomes the edge's label — use it to say **why**:

```ts
/**
 * Places an order and charges it synchronously.
 * @endpoint POST /orders
 * @writes orders-db.orders
 * @writes orders-db.order_items
 * @emits order.placed so notifications and analytics can react
 * @calls payments.post-charge charge at checkout, in-process for now
 */
export async function placeOrder(items: OrderItem[]): Promise<Order> { … }
```

## Node tags

| tag | declares | notes |
| --- | --- | --- |
| `@system Name` | the map's title | once per codebase; prose = system description |
| `@domain Name` | a bounded context | `in:Parent` to nest domains |
| `@service name` | a deployable process | `in:Domain` · sets the file's service context |
| `@endpoint POST /orders` | an API surface | name it after the route |
| `@fn [name]` | a significant function | name defaults to the documented function |
| `@job [name]` | scheduled/background work | name defaults to the documented function |
| `@database name` | a database | `tables:orders,order_items` declares its tables inline |
| `@table name` | one table | `in:db-name`, or the file's `@database` context |
| `@cache` / `@bucket` / `@queue` | Redis / S3 / SQS and friends | |
| `@event order.placed` | a named domain event | dots in the name are fine |
| `@external Stripe` | a third party you don't operate | |

Every node tag also accepts `tech:"PostgreSQL 16"` (quote values with spaces) and
`tags:critical,pci`. `in:` puts a thing inside a domain; `of:` puts an endpoint/fn/job inside a
service other than the file's own.

**File context:** declaring `@service` (or `@database`, `@domain`) sets the context for the rest
of the file — `@endpoint`/`@fn`/`@job` comments below it attach automatically. Put the `@service`
comment at the top of the service's file. One service per file is the pattern.

## Edge tags

Declared in the same comment as the node doing the verb: first token is the target, everything
after it is the label. Always phrase the label as the *why* or the protocol.

| tag | meaning |
| --- | --- |
| `@calls target [why]` | request/response |
| `@reads target [why]` / `@writes target [why]` | store access |
| `@emits event [why]` / `@consumes event [why]` | event flow (target must be an @event or @queue) |
| `@uses target [why]` | escape hatch; prefer a specific verb |

**Targets are names, resolved when the map builds.** Use the bare name when it's unique
(`session-cache`, `Stripe`, `order.placed`), or qualify with a dot when it isn't
(`orders-db.orders`, `payments.post-charge` — endpoint names slug as `post-charge`). A target
that matches nothing or several things fails the render with file:line and suggestions — that
failure is the freshness check, so never silence it by deleting the edge unless the code really
stopped doing the thing.

## Rules

1. **Annotate at creation.** New service, endpoint, job, table, queue, event, or third-party
   integration ⇒ its comment lands in the same commit, on the same code.
2. **Edges live with the actor.** When code starts reading a table, calling a service, or
   emitting an event, add the tag to *that* code's comment. When it stops, remove the tag.
3. **Prose first, tags after.** The sentence above the tags is the description shown in the map's
   detail panel — write it for the next engineer.
4. **`@system` exactly once**, in an architecture anchor file alongside `@domain` and `@external`
   declarations (free-standing comments with no code attached are fine).
5. **Names are unique within their parent** and become slug ids (`orders/orders/post-orders`).
6. **Keep names stable.** Renaming a node breaks every edge pointing at it — the render will list
   them; fix them in the same commit.

## Granularity rubric for `@fn`

Annotate a function when it is a *load-bearing part of the design*: it owns a rule (pricing,
fees, auth), it is the single place something happens (template rendering, password hashing), or
it has its own architectural edges (reads a cache, calls a third party). Do **not** annotate
helpers, mappers, or glue — a service with thirty `@fn` nodes is noise, one with three to seven
is a map.

## Verifying

```bash
npx chorograph render <dirs…> --json --quiet   # builds the map, errors on broken annotations
```

Run it after changing annotations. Dangling targets, ambiguous targets, duplicate names,
members with no service in scope, and non-event `@emits`/`@consumes` targets all fail with
`file:line` and suggestions.
