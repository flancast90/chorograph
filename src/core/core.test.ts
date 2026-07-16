/**
 * Core checks: the annotation grammar and graph assembly — the two pieces every provider relies on.
 *
 * @chorograph group="Core" role=test comms=in-proc
 */
import { describe, expect, it } from "vitest";
import { parseAnnotation } from "./annotations.ts";
import { assemble } from "./graph.ts";
import type { Node, ProviderResult } from "./model.ts";

describe("parseAnnotation", () => {
  it("reads a bare role, group path, list comms, and quoted talksTo", () => {
    const a = parseAnnotation('agent-tool group="Gateway/Agent" comms=llm;http talksTo=Anthropic;"SAM.gov API" root');
    expect(a.roles).toEqual(["agent-tool"]);
    expect(a.group).toBe("Gateway/Agent");
    expect(a.comms).toEqual(["llm", "http"]);
    expect(a.talksTo).toEqual(["Anthropic", "SAM.gov API"]);
    expect(a.root).toBe(true);
  });

  it("accepts the legacy @archmap kind= and layer= keys", () => {
    const a = parseAnnotation("kind=db-repo layer=adapter status=deprecated");
    expect(a.roles).toEqual(["db-repo"]);
    expect(a.group).toBe("adapter"); // layer becomes the group when none given
    expect(a.status).toBe("deprecated");
  });
});

describe("assemble", () => {
  const mod = (id: string, group: string, extra: Partial<Node> = {}): Node => ({
    id,
    label: id,
    containment: "module",
    parent: null,
    roles: [],
    comms: [],
    status: "active",
    tags: [],
    group,
    ...extra,
  });

  it("builds a nested region tree from slash group paths", () => {
    const result: ProviderResult = {
      nodes: [mod("a.ts", "Domain/Ports"), mod("b.ts", "Domain/Ports"), mod("c.ts", "Services/Gateway")],
      edges: [],
    };
    const g = assemble(result, { root: "/x", provider: "test", version: "0.0.0" });
    const regions = g.nodes.filter((n) => n.containment === "region").map((n) => n.label);
    expect(regions).toContain("Domain");
    expect(regions).toContain("Ports");
    expect(regions).toContain("Gateway");
    // Ports nests under Domain.
    const ports = g.nodes.find((n) => n.containment === "region" && n.label === "Ports");
    const domain = g.nodes.find((n) => n.containment === "region" && n.label === "Domain");
    expect(ports?.parent).toBe(domain?.id);
  });

  it("flags a non-root module with no inbound edge as an orphan, and puts externals in their own region", () => {
    const result: ProviderResult = {
      nodes: [
        mod("used.ts", "Core"),
        mod("caller.ts", "Core", { root: true }),
        mod("orphan.ts", "Core"),
        { id: "ext:stripe", label: "Stripe", containment: "external", parent: null, roles: ["external"], comms: ["http"], status: "active", tags: [] },
      ],
      edges: [
        { id: "e1", from: "caller.ts", to: "used.ts", relation: "import", comms: "import", weight: 1 },
        { id: "e2", from: "caller.ts", to: "ext:stripe", relation: "talks-to", comms: "http", weight: 1 },
      ],
    };
    const g = assemble(result, { root: "/x", provider: "test", version: "0.0.0" });
    expect(g.dead.orphans).toContain("orphan.ts");
    expect(g.dead.orphans).not.toContain("used.ts"); // has an inbound import edge
    expect(g.dead.orphans).not.toContain("caller.ts"); // declared root entrypoint
    const ext = g.nodes.find((n) => n.id === "ext:stripe");
    const extRegion = g.nodes.find((n) => n.id === ext?.parent);
    expect(extRegion?.label).toBe("External Systems");
  });
});
