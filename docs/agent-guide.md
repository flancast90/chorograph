# Annotating a codebase for chorograph (agent rubric)

This is a mechanical task. Follow it file-by-file; no cross-file coordination is required.

## The one rule

Add exactly one **module-level** `@chorograph` annotation to the top of each source file you want on
the map, as the last line of the file's leading JSDoc block (or a new block if there isn't one):

```ts
/**
 * <one sentence: what this file is for>
 * @chorograph <role> group="<Layer>/<Service>" comms=<primary comms> talksTo=<external systems>
 */
```

Optionally add annotations to individual exports for finer detail, using the same grammar.

## Filling each field mechanically

- **role** — pick the closest: `service` `api-route` `usecase` `repository` `port` `adapter`
  `client` `agent-tool` `workflow` `event` `cli` `config` `domain-model` `component` `contract`
  `ingestion-provider` `connector`. If unsure, use the file's dominant export kind (`function`,
  `class`, `type`).
- **group** — a slash path from broad to narrow. Keep the vocabulary consistent across the repo, e.g.
  `Domain`, `Domain/Ports`, `Usecases`, `Adapters/Postgres`, `Services/Gateway`, `Apps/Web`. This is
  the ONLY thing that builds the nested tree — pick it deliberately and reuse the same segment names.
- **comms** — how this thing primarily talks outward: `in-proc` (plain calls), `http`, `sql`, `sse`,
  `queue`, `temporal`, `oauth`, `llm`, `embedding`, `s3`, `smtp`, `mcp`, `cron`.
- **talksTo** — named external systems or specific other nodes it calls: `talksTo=Postgres;Stripe`.
  Quote multi-word names: `talksTo="SAM.gov API"`.
- **root** — add the bare token `root` to genuine entrypoints (a service `main`, an HTTP route, a CLI,
  an agent tool, a UI page). These are never flagged as dead.
- **status** — add `status=deprecated` to code on the way out; it renders as dead.

## Conventions that keep the map clean

- Reuse the exact same `group` segment spelling everywhere (`Adapters/Postgres`, not also
  `adapters/postgres`). Segments are matched case-insensitively but display the first spelling seen.
- One concept per file → one module-level annotation is usually enough. Only annotate individual
  exports when a file legitimately holds several distinct nodes.
- Don't invent structure from folders; declare it in `group`. Two files in different folders can share
  a group, and one folder can span groups.

## Verify

```bash
npx chorograph scan . --json
```

Check the printed counts and `roles` histogram look right, then open the report without `--json`.
