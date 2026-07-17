# chorograph design principles

The map is the product. It has to feel like a technical drawing a staff engineer keeps pinned above
their desk, not a generated infographic. Two rules govern everything: **earn every pixel**, and
**say exactly what was declared, nothing more**.

## Declared, not inferred. And declared *in the doc comment*

chorograph refuses to guess. There is no import scanning and no folder heuristics. Architecture
is declared in the doc comment on the code it describes: the one place that already gets updated
with the code and can carry intent (“emits order.placed *so notifications can react*”) that no
scanner could infer. The code itself is never touched: no imports, no wrappers, nothing executed.
This is a design principle, not just an implementation choice:

- **Trust.** A reader can act on the map because someone asserted every line on it, including
  the *why* on each edge.
- **Freshness.** Every edge target must resolve to exactly one declared node, or the render fails
  with file:line, so renames and deletions surface as errors, not as lies on the map. `@fn` names
  follow the function they document automatically.
- **Zero intrusion.** Annotations are comments, so they work on any code (classes, free
  functions, config objects) with no side-effect rules, no runtime cost, and nothing to import.
- **Vocabulary.** Because nodes are declared, the kind set can stay small and closed (twelve
  kinds, six verbs), and every kind can afford its own icon and hue.
- **Reviewability.** Annotations are part of the diff; architecture changes are reviewed in the
  same pull request as the implementation.

## Everything visible, always

No expand/collapse, no level-of-detail, no “drill in to find out”. Declared maps are small (tens to
a few hundred nodes) because humans write them, so the honest presentation is the whole system at
once, laid out deterministically. Spatial memory is the point of a map: things must stay where they
are. Consequences:

- **Filters remove, search dims.** Hiding a kind re-runs layout so the map re-flows cleanly.
  Search never moves anything; it dims non-matches so your sense of place survives.
- **Layout is deterministic.** Same definition → same picture, every run (ELK, fixed seed). A map
  you cannot memorise is not a map.

## The look: a technical drawing

Light, paper-like, typographic. White cards on cool gray (`#F2F4F7`) with a faint dot grid, 1px ink
borders, corners ≤8px, shadows barely-there. The register is Linear, Observable, a well-set
datasheet. The opposite of a landing-page hero.

**Colour is vocabulary, not decoration.** Each node kind owns exactly one hue (used in its icon
chip, everywhere); each edge verb owns one colour + line style (`reads` is dashed green, `writes`
solid green, `emits`/`consumes` amber, `calls` ink, `uses` dotted gray). Nothing else on the page
is coloured. If a screenshot reads as “rainbow dashboard template”, it's wrong.

**Icons are a considered set.** One stroke-only line icon per kind (cube = service, cylinder =
database, bolt = event, plug = endpoint, …), drawn on a shared 16×16 grid at a shared stroke
weight, shown identically on the canvas, in the legend, and in the detail panel. Learned once,
read everywhere. No emoji, no mixed icon packs.

**Type.** Sans for names and prose; monospace for identifiers, counts, tech labels, and shortcut
hints. Weight and size carry hierarchy, not colour.

**Lines carry direction and meaning.** Every edge is directed, orthogonally routed with rounded
elbows, and labelled with its verb on hover. Default edges are quiet; hover/selection lights the
relevant ones and fades the rest. Never a straight-line hairball.

## Interaction: three ideas, no modes

1. **The legend is the filter.** One list, always visible, doubles as show/hide. No separate
   filter UI to learn, nothing folded into dropdowns.
2. **Hover asks “what does this touch?”**: edges light, verbs appear.
3. **Click asks “what is this?”**: the detail panel answers in sentences, and every name in it
   navigates.

Keyboard: `/` search, `f` fit, `esc` clear. That's the whole surface. If a feature needs a
tutorial, it doesn't ship.

## The one-line test

If a screenshot could be mistaken for a generic AI-dashboard template, it's wrong. If it could be
mistaken for a page out of a very good engineering notebook, it's right.
