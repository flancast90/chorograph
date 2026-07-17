# Agent guide to the chorograph codebase

chorograph scans doc comments in TypeScript/JavaScript codebases and renders an architecture map.
The scanner is static (TypeScript compiler, parse only, nothing executed); the output is a
self-contained `report.html` plus `graph.json`. Read `docs/design-principles.md` before making
product decisions; it is short and most of the project's opinions live there.

## Commands

```bash
pnpm install
pnpm typecheck                                  # tsc strict, no emit
pnpm test                                       # vitest; grammar suite lives in src/core/annotations.test.ts
pnpm build                                      # dist/: cli.js, index.js, viewer.js, .d.ts
pnpm example                                    # render examples/streamline, opens report.html
pnpm chorograph render <paths> --json --quiet   # scan and print meta; errors exit non-zero
pnpm chorograph serve examples/streamline       # dev server; re-scans on every refresh
```

There is no lint step; typecheck and tests are the gate. Match the style of the file you are in.

## Map of the code

- `src/core/annotations.ts`: the entire input surface. Comment extraction (AST trivia, never
  regex over raw text), tag parsing, the containment matrix (`CONTAINS`), parent resolution,
  edge-target resolution, error accumulation. Most changes land here.
- `src/core/model.ts`: the serialisable `Graph` contract. Changing it means also changing
  `src/viewer/types.ts` (see invariants) and usually `docs/SKILL.md` + README.
- `src/load.ts`: path expansion and file reading. Skips `node_modules`, `dist`, dotfiles, tests.
- `src/cli.ts` / `src/serve.ts` / `src/report.ts`: thin shells around `loadGraph`.
- `src/viewer/`: the React app bundled into the report. `layout.ts` (recursive ELK), `Canvas.tsx`
  (SVG), `Sidebar.tsx` (legend = filters), `DetailPanel.tsx`, `theme.ts` (all tokens).
- `examples/streamline/`: the reference annotated codebase. It intentionally exercises every
  feature: free-standing anchors, `tables:` shorthand, nested functions, a class-based service,
  a routes file using the `@of` directive, service-private infrastructure.

## Invariants (breaking these is the usual failure mode)

1. **The scanner never executes user code.** No imports, no bundling, no `eval` of scanned
   sources. If a feature seems to need runtime information, it doesn't fit this tool.
2. **`src/viewer/types.ts` is a hand-kept mirror of `src/core/model.ts`.** The viewer must not
   import from `src/core`, or the report bundle stops being browser-only. Update both or the
   viewer silently drops data.
3. **A stale `dist/` masks your changes.** `report.ts` embeds `dist/viewer.js` when it exists.
   After viewer edits, `rm -rf dist` or rebuild before judging output.
4. **Every scanner error carries `file:line`, states what was expected, and suggests a fix when
   possible.** All errors accumulate and report in one pass. New error paths need a test that
   asserts the message text.
5. **The kind set and edge-verb set are closed and small on purpose.** Twelve node kinds, six
   verbs, each with exactly one icon and colour in `theme.ts` and `icons.tsx`. Adding a kind is
   a product decision, not a refactor; it touches model, viewer types, theme, icons, SKILL.md,
   README, and tests together.
6. **Layout stays deterministic.** ELK with a fixed seed. Nothing time- or randomness-dependent
   in `layout.ts`.
7. **The report stays self-contained.** No CDN, no network fetches, opens off `file://`.

## Verification loop

Typecheck and tests first, then look at the actual output. The map is the product, and plenty of
bugs are only visible in it:

```bash
pnpm typecheck && pnpm test
rm -rf dist && pnpm build
node dist/cli.js render examples/streamline --no-open --quiet
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --window-size=1720,1080 --screenshot=/tmp/chorograph.png \
  "file://$PWD/examples/streamline/.chorograph/report.html" --virtual-time-budget=6000
```

Then read `/tmp/chorograph.png`. A blank or tiny screenshot almost always means the viewer
crashed on new data; check invariants 2 and 3 before anything else. To verify interactions
(selection, filters), append a `<script>` to a copy of the report that dispatches mouse events,
and screenshot that.

To check scanner behaviour at scale, any large real codebase works as a corpus: scanning ~1,200
files should stay under a couple of seconds and must not crash on JSX, decorators, or malformed
source.

## Docs that must move with the code

| you changed | also update |
| --- | --- |
| grammar (tags, keys, resolution, errors) | `docs/SKILL.md`, README grammar/hierarchy sections, `src/core/annotations.test.ts` |
| `Graph` contract | `src/viewer/types.ts`, README programmatic API section |
| viewer look or interaction | `docs/design-principles.md` if the rules changed, README viewer section, fresh screenshots in `docs/assets/` |
| CLI flags | README CLI table, `USAGE` string in `src/cli.ts` |

`docs/SKILL.md` is consumed by other agents as an authoring guide for *user* codebases. Keep it
about the grammar, not about developing chorograph itself. This file is the one about developing
chorograph.

## Style

- TypeScript strict; `exactOptionalPropertyTypes` is on, hence the `...(x !== undefined ? { x } : {})`
  spread pattern. Keep it.
- File-top doc comments explain what the module is for and the non-obvious decisions inside it.
  Inline comments explain why, never what. No narration comments.
- Tests are named for observable behaviour ("rejects ambiguous targets and asks for
  qualification"), grouped by concern, and assert error message text for every error path.
- Commit messages: first line states the change from the user's point of view; the body explains
  the reasoning. Version bumps to `package.json` ride in the PR that earns them; merging a new
  version to `main` triggers the npm publish workflow.
