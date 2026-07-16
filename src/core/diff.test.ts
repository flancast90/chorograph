/**
 * Focused checks for {@link diffGraphs} — added / removed / touched classification and meta.diff.
 *
 * @chorograph group="Core" role=test comms=in-proc
 */
import { describe, expect, it } from "vitest";
import { diffGraphs } from "./diff.ts";
import { assemble } from "./graph.ts";
import type { Edge, Node } from "./model.ts";

const mod = (id: string, group: string, extra: Partial<Node> = {}): Node => ({
  id,
  label: id.split("/").pop() ?? id,
  containment: "module",
  parent: null,
  roles: ["module"],
  comms: [],
  status: "active",
  tags: [],
  group,
  ...extra,
});

const edge = (id: string, from: string, to: string): Edge => ({
  id,
  from,
  to,
  relation: "import",
  comms: "import",
  weight: 1,
});

function graph(nodes: Node[], edges: Edge[]) {
  return assemble({ nodes, edges }, { root: "/repo", provider: "test", version: "0.0.0" });
}

describe("diffGraphs", () => {
  it("classifies added / removed / touched nodes and edges, and fills meta.diff", () => {
    const base = graph(
      [mod("a.ts", "Core"), mod("b.ts", "Core"), mod("gone.ts", "Legacy")],
      [edge("e-ab", "a.ts", "b.ts"), edge("e-ag", "a.ts", "gone.ts")],
    );
    const head = graph(
      [
        mod("a.ts", "Core", { roles: ["module", "usecase"] }),
        mod("b.ts", "Core"),
        mod("new.ts", "Core"),
      ],
      [edge("e-ab", "a.ts", "b.ts"), edge("e-an", "a.ts", "new.ts")],
    );

    const d = diffGraphs(base, head, { baseLabel: "abc", headLabel: "WORKTREE" });
    expect(d.meta.diff?.base).toBe("abc");
    expect(d.meta.diff?.head).toBe("WORKTREE");
    expect(d.meta.diff?.nodesAdded).toBe(1);
    expect(d.meta.diff?.nodesRemoved).toBe(1);
    expect(d.meta.diff?.edgesAdded).toBe(1);
    expect(d.meta.diff?.edgesRemoved).toBe(1);
    expect(d.meta.diff?.nodesTouched).toBe(1); // a.ts roles changed

    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    expect(byId.get("new.ts")?.diff).toBe("added");
    expect(byId.get("gone.ts")?.diff).toBe("removed");
    expect(byId.get("a.ts")?.diff).toBe("touched");
    // b.ts only appears on an unchanged edge — not touched
    expect(byId.get("b.ts")?.diff).toBeUndefined();

    const edges = new Map(d.edges.map((e) => [e.id, e]));
    expect(edges.get("e-an")?.diff).toBe("added");
    expect(edges.get("e-ag")?.diff).toBe("removed");
    expect(edges.get("e-ab")?.diff).toBeUndefined();

    expect(byId.get("gone.ts")?.parent).toMatch(/^region:/);
    expect(d.nodes.find((n) => n.label === "Legacy")?.diff).toBe("removed");
  });

  it("marks a region touched when a descendant changes", () => {
    const base = graph([mod("x.ts", "App/Ui")], []);
    const head = graph([mod("x.ts", "App/Ui", { status: "deprecated" })], []);
    const d = diffGraphs(base, head, { baseLabel: "b", headLabel: "h" });
    expect(d.nodes.find((n) => n.id === "x.ts")?.diff).toBe("touched");
    expect(d.nodes.find((n) => n.label === "Ui")?.diff).toBe("touched");
    expect(d.nodes.find((n) => n.label === "App")?.diff).toBe("touched");
  });
});
