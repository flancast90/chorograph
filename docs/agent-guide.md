# Annotating a codebase for chorograph (agent rubric)

chorograph works with **zero annotations**. Point it at a TypeScript/JavaScript directory and the map appears: structure from the folder tree, edges from `import` statements. Add `@chorograph` tags only where they add signal — semantics the code cannot reveal, entrypoint marking, or a `group` override when folders do not match the logical architecture.

This rubric is mechanical. Follow it file-by-file; no cross-file coordination is required.

## When to annotate

- **Skip** files where the directory path and import graph already tell the story.
- **Annotate** when you need a `role` for filtering, `comms`/`talksTo` for external wiring, `status=deprecated`, `root` on a genuine entrypoint, or `group=` because the file lives in the wrong folder for its logical layer.

## Module-level vs symbol-level

**Module-level** — one tag on the file as a whole. Place it in a JSDoc block on the **first statement of the file**, and that statement must **not** be a declaration (class, function, type, etc.). In practice, put the block immediately above the imports:

```ts
/**
 * HTTP handlers for the billing API.
 * @chorograph api-route comms=http talksTo=Stripe root
 */
import { Router } from "express";
```

If the file opens with `export class …`, a JSDoc on that export is **symbol-level**, not module-level.

**Symbol-level** — tag individual exports when a file holds several distinct nodes worth separating on the map:

```ts
/**
 * @chorograph repository comms=sql talksTo=Postgres
 */
export class UserRepo { /* … */ }

/**
 * @chorograph port
 */
export interface UserStore { /* … */ }
```

## Filling each field mechanically

- **role** — pick the closest: `service`, `api-route`, `usecase`, `repository`, `port`, `adapter`, `client`, `agent-tool`, `workflow`, `event`, `cli`, `config`, `domain-model`, `component`, `contract`. If unsure, use the file's dominant export kind (`function`, `class`, `type`). The first bare token (no `=`) is shorthand for `role`.
- **group** — slash path from broad to narrow, e.g. `Domain`, `Domain/Ports`, `Usecases`, `Adapters/Postgres`, `Services/Gateway`, `Apps/Web`. **Only set this when the directory path is wrong** or you want a file grouped with siblings in a different folder. Reuse the same segment spelling everywhere.
- **comms** — how this thing primarily talks outward: `in-proc` (plain calls), `http`, `sql`, `sse`, `queue`, `temporal`, `oauth`, `llm`, `embedding`, `s3`, `smtp`, `mcp`, `cron`.
- **talksTo** — named external systems or specific nodes it calls: `talksTo=Postgres;Stripe`. Quote multi-word names: `talksTo="Payments API"`.
- **root** — add the bare token `root` to genuine entrypoints (a service `main`, an HTTP route, a CLI, an agent tool, a UI page). These are never flagged as dead.
- **status** — add `status=deprecated` to code on the way out; it renders as dead.

Lists split on `;` or `,`. Values with spaces must be quoted.

## Conventions that keep the map clean

- Reuse the exact same `group` segment spelling everywhere (`Adapters/Postgres`, not also `adapters/postgres`). Segments are matched case-insensitively but display the first spelling seen.
- One concept per file → one module-level annotation is usually enough. Only annotate individual exports when a file legitimately holds several distinct nodes.
- Do not redeclare structure that folders already express. Prefer the directory tree; override with `group` only when it diverges from the logical architecture.

## Verify

```bash
npx chorograph scan . --json
```

Check the printed counts and `roles` histogram, then open the report without `--json`. Use `--no-annotations` to confirm the zero-config baseline before comparing your additions.
