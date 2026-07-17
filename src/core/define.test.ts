import { describe, expect, it } from "vitest";
import { defineSystem, isSystem } from "./define.ts";

describe("defineSystem", () => {
  it("builds nested nodes with slug-path ids and containment parents", () => {
    const system = defineSystem("Shop", (s) => {
      const commerce = s.domain("Commerce");
      const orders = commerce.service("Orders Service");
      orders.endpoint("POST /orders");
      const db = commerce.database("orders-db");
      db.table("order_items");
    });
    const g = system.toGraph();

    const ids = g.nodes.map((n) => n.id);
    expect(ids).toEqual([
      "commerce",
      "commerce/orders-service",
      "commerce/orders-service/post-orders",
      "commerce/orders-db",
      "commerce/orders-db/order-items",
    ]);
    const endpoint = g.nodes.find((n) => n.kind === "endpoint")!;
    expect(endpoint.parent).toBe("commerce/orders-service");
    expect(endpoint.name).toBe("POST /orders");
  });

  it("records edges with the declared verb, and stores consumes as event → consumer", () => {
    const system = defineSystem("Shop", (s) => {
      const orders = s.service("orders");
      const db = s.database("db");
      const placed = s.event("order.placed");
      const mailer = s.service("mailer");
      s.writes(orders, db);
      s.reads(orders, db);
      s.emits(orders, placed);
      s.consumes(mailer, placed);
      s.calls(orders, mailer, "gRPC");
    });
    const g = system.toGraph();

    expect(g.edges.map((e) => `${e.kind}:${e.from}->${e.to}`)).toEqual([
      "writes:orders->db",
      "reads:orders->db",
      "emits:orders->order-placed",
      "consumes:order-placed->mailer",
      "calls:orders->mailer",
    ]);
    expect(g.edges.find((e) => e.kind === "calls")?.label).toBe("gRPC");
  });

  it("counts nodes and edges by kind in meta", () => {
    const system = defineSystem("Shop", { description: "demo" }, (s) => {
      const a = s.service("a");
      const b = s.service("b");
      s.calls(a, b);
      s.calls(b, a);
    });
    const g = system.toGraph({ version: "1.2.3" });
    expect(g.meta.name).toBe("Shop");
    expect(g.meta.description).toBe("demo");
    expect(g.meta.version).toBe("1.2.3");
    expect(g.meta.counts.nodes).toEqual({ service: 2 });
    expect(g.meta.counts.edges).toEqual({ calls: 2 });
  });

  it("rejects duplicate names within the same parent", () => {
    expect(() =>
      defineSystem("Shop", (s) => {
        s.service("orders");
        s.service("Orders"); // same slug
      }),
    ).toThrow(/duplicate service/);
  });

  it("allows the same name under different parents", () => {
    const system = defineSystem("Shop", (s) => {
      s.database("a").table("events");
      s.database("b").table("events");
    });
    expect(system.toGraph().nodes.filter((n) => n.kind === "table")).toHaveLength(2);
  });

  it("rejects self-edges and non-event targets for emits/consumes", () => {
    expect(() =>
      defineSystem("Shop", (s) => {
        const a = s.service("a");
        s.calls(a, a);
      }),
    ).toThrow(/cannot calls itself/);

    expect(() =>
      defineSystem("Shop", (s) => {
        const a = s.service("a");
        const b = s.service("b");
        // @ts-expect-error — emits requires an event handle; verify the runtime guard too
        s.emits(a, b);
      }),
    ).toThrow(/must target an event/);
  });

  it("gives parallel edges between the same pair distinct ids", () => {
    const system = defineSystem("Shop", (s) => {
      const a = s.service("a");
      const b = s.service("b");
      s.calls(a, b, "first");
      s.calls(a, b, "second");
    });
    const ids = system.toGraph().edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("is recognised by isSystem", () => {
    const system = defineSystem("Shop", () => {});
    expect(isSystem(system)).toBe(true);
    expect(isSystem({})).toBe(false);
    expect(isSystem(null)).toBe(false);
  });
});
