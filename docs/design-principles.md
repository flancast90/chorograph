# chorograph design principles

The map is the product. It has to feel like an instrument a principal engineer reaches for, not a
generated infographic. Two rules govern everything: **earn every pixel**, and **read like the system
actually runs**.

## The register we're aiming for

Observable, Linear, Vercel dashboards, Datadog's service map, `git` itself. Calm, dense, fast,
typographic. The opposite of a landing-page hero.

## Tell-tale signs of AI design — banned

These read as "a model made this." Do not ship any of them:

- Purple→blue (or any) gradient backgrounds, hero glows, mesh gradients.
- Glassmorphism: frosted translucent panels, `backdrop-filter` blur everywhere.
- Emoji as UI (🚀 icons on buttons, ✨ next to headings). Icons are a considered set or none.
- Everything rounded and drop-shadowed. Corners are subtle (≤6px) or square; shadows are rare.
- Rainbow category colors with no system — 16 hues assigned arbitrarily.
- Centered everything, huge whitespace wrapping three words of content.
- Inter/■ default with one size and one weight doing all the work.
- Tooltips that restate the label. Copy that says "Powered by AI" or "Beautiful, modern".
- Fake 3D blobs, isometric illustrations, confetti, "AI-generated" abstract art.

## What we do instead

**Type.** A real scale (e.g. 11 / 12 / 13 / 16 / 20). Identifiers, counts, and anything from the code
are **monospace** (`ui-monospace, SFMono-Regular, Menlo`). Prose/labels are a clean sans. Weight and
size carry hierarchy, not color.

**Color is semantic, not decorative.** One near-black background, one paper for panels, one hairline
border color, two text tiers. Node/role colors come from a **small, fixed, perceptually-even palette**
(≤10 hues, e.g. an OKLCH ramp) mapped deterministically to roles, with a stable legend. Deprecated =
one warning hue; orphan/unreachable = one muted "dead" treatment (desaturated + dashed), never a new
rainbow. Same input → same colors every run.

**Lines carry direction and meaning.** Every edge is directed (arrowhead). Default state: thin,
low-contrast, so the graph is legible as a whole. On hover/select of a node, its edges light up and
everything else recedes. Edge color encodes `comms` (in-proc / http / sql / llm / …) from the same
fixed palette; edge thickness encodes rolled-up weight. Route edges cleanly (orthogonal/curved via the
precomputed layout), never a straight-line hairball.

**Density with hierarchy.** Show a lot, but nested. The default view is collapsed to top regions; you
drill in. Labels truncate with ellipsis at a fixed width; counts and role dots ride along the edge of a
container. No modal-heavy flows — a single persistent detail panel.

**Motion is functional.** Expand/collapse and focus transitions are quick (120–180ms) and eased.
Nothing loops, pulses, or floats idly. Reduced-motion is respected.

**Keyboard-first.** `/` focuses search. Arrow/enter to walk the tree. `f` fit, `Esc` clears selection.
Everything reachable without a mouse.

## Performance is a design constraint

"Extremely smooth even for very large things" is non-negotiable. The strategy is architectural, not a
faster renderer:

- **Collapse-first + level-of-detail.** Never render 10k nodes. Render the expanded frontier
  (hundreds), roll everything else up into its container.
- **Precomputed layout** (in the CLI, via ELK) so the browser never blocks laying out.
- **Viewport culling.** Only draw what's on screen; virtualize the tree/panels.
- **Rolled-up edges.** When a container is collapsed, its cross-boundary edges aggregate into one
  weighted edge, not N.
- 60fps pan/zoom on a 5k-symbol graph on a laptop is the bar.

## The one-line test

If a screenshot could be mistaken for a generic "AI dashboard" template, it's wrong. If it looks like
a tool you'd find in a staff engineer's terminal history, it's right.
