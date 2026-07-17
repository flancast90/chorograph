import { beforeEach, describe, expect, it } from "vitest";
import {
  bucket,
  database,
  domain,
  endpoint,
  event,
  external,
  func,
  job,
  service,
  system,
} from "./declare.ts";
import { collectGraph, resetRegistry } from "./registry.ts";

beforeEach(() => resetRegistry());

describe("function-style declarations", () => {
  it("builds nested nodes with slug-path ids and containment parents", () => {
    const commerce = domain("Commerce");
    const orders = commerce.service("Orders Service");
    orders.endpoint("POST /orders");
    const db = commerce.database("orders-db");
    db.table("order_items");

    const g = collectGraph();
    expect(g.nodes.map((n) => n.id)).toEqual([
      "commerce",
      "commerce/orders-service",
      "commerce/orders-service/post-orders",
      "commerce/orders-db",
      "commerce/orders-db/order-items",
    ]);
    expect(g.nodes.find((n) => n.kind === "endpoint")?.parent).toBe("commerce/orders-service");
  });

  it("returns the implementation unchanged from wrappers, stamped as a NodeRef", () => {
    const orders = service("orders");
    const impl = async (id: string) => ({ id });
    const getOrder = orders.endpoint("GET /orders/:id", {}, impl);

    expect(getOrder).toBe(impl); // same function identity — zero runtime cost
    expect(getOrder.id).toBe("orders/get-orders-id");
    expect(getOrder.kind).toBe("endpoint");
    expect(getOrder.name).toBe("GET /orders/:id");
  });

  it("declares edges from options, with the declaring node as subject", () => {
    const db = database("db");
    const placed = event("order.placed");
    const stripe = external("Stripe");
    const orders = service("orders", {
      reads: [db],
      writes: [db],
      emits: [placed],
      calls: [[stripe, "charge"]],
    });
    const mailer = service("mailer", { consumes: [placed] });
    void orders;
    void mailer;

    const g = collectGraph();
    // Edges emit in fixed verb order (calls, reads, writes, emits, consumes, uses) per node.
    expect(g.edges.map((e) => `${e.kind}:${e.from}->${e.to}`)).toEqual([
      "calls:orders->stripe",
      "reads:orders->db",
      "writes:orders->db",
      "emits:orders->order-placed",
      "consumes:order-placed->mailer", // stored event → consumer
    ]);
    expect(g.edges.find((e) => e.kind === "calls")?.label).toBe("charge");
  });

  it("accepts wrapped functions as edge targets", () => {
    const orders = service("orders");
    const placeOrder = orders.endpoint("POST /orders", {}, () => "ok");
    service("gateway", { calls: [[placeOrder, "HTTP"]] });

    const g = collectGraph();
    expect(g.edges[0]).toMatchObject({ kind: "calls", from: "gateway", to: "orders/post-orders", label: "HTTP" });
  });

  it("declares functions inside services with the function kind", () => {
    const orders = service("orders");
    const totals = orders.fn("calculateTotals", {}, (items: number[]) => items.reduce((a, b) => a + b, 0));
    expect(totals([1, 2])).toBe(3);
    expect(collectGraph().nodes.find((n) => n.kind === "function")?.id).toBe("orders/calculatetotals");
  });

  it("rejects duplicates, self-edges, and non-event emits targets", () => {
    service("orders");
    expect(() => service("Orders")).toThrow(/duplicate service/);

    resetRegistry();
    const db = database("db");
    expect(() => service("a", { emits: [db as never] })).toThrow(/must target an event/);
  });
});

describe("class-style declarations (decorators)", () => {
  it("claims decorated members for the enclosing @service class", () => {
    const commerce = domain("Commerce");
    const ledger = database("ledger-db");

    @service("payments", { domain: commerce, tech: "Go" })
    class PaymentsService {
      @endpoint("POST /charge", { writes: [ledger] })
      async charge(amount: number) {
        return { charged: amount };
      }

      @job("reconcile-payments", { reads: [ledger] })
      async reconcile() {}

      @func()
      computeFees(amount: number) {
        return amount * 0.029;
      }
    }

    const g = collectGraph();
    expect(g.nodes.map((n) => `${n.kind}:${n.id}`)).toEqual([
      "domain:commerce",
      "database:ledger-db",
      "service:commerce/payments",
      "endpoint:commerce/payments/post-charge",
      "job:commerce/payments/reconcile-payments",
      "function:commerce/payments/computefees",
    ]);
    expect(g.edges.map((e) => `${e.kind}:${e.from}->${e.to}`)).toEqual([
      "writes:commerce/payments/post-charge->ledger-db",
      "reads:commerce/payments/reconcile-payments->ledger-db",
    ]);

    // The class itself is stamped as a NodeRef, so other declarations can point at it.
    const asRef = PaymentsService as unknown as { id: string; kind: string };
    expect(asRef.id).toBe("commerce/payments");
    expect(asRef.kind).toBe("service");

    // And it still behaves like a normal class.
    expect(new PaymentsService().computeFees(100)).toBeCloseTo(2.9);
  });

  it("errors at collect time if decorated members were never claimed by a @service", () => {
    class Unclaimed {
      @endpoint("GET /oops")
      oops() {}
    }
    void Unclaimed;
    expect(() => collectGraph()).toThrow(/never claimed/);
  });
});

describe("system metadata", () => {
  it("names the map and counts by kind", () => {
    system("Acme", { description: "demo" });
    const a = service("a");
    const b = service("b");
    void a.endpoint("GET /x");
    void b;

    const g = collectGraph({ version: "1.2.3" });
    expect(g.meta.name).toBe("Acme");
    expect(g.meta.description).toBe("demo");
    expect(g.meta.version).toBe("1.2.3");
    expect(g.meta.counts.nodes).toEqual({ service: 2, endpoint: 1 });
  });

  it("throws when collecting an empty registry", () => {
    expect(() => collectGraph()).toThrow(/no declarations/);
  });
});
