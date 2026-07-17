import { describe, expect, it } from "vitest";
import { buildGraph } from "./annotations.ts";
import type { SourceInput } from "./annotations.ts";

const src = (text: string, path = "app.ts"): SourceInput => ({ path, text });

describe("node declarations", () => {
  it("declares free-standing nodes from comments alone — no code required", () => {
    const g = buildGraph([
      src(`
/**
 * The whole shop.
 * @system Shop
 */

/**
 * Money things.
 * @domain Billing
 */
export {};
`),
    ]);
    expect(g.meta.name).toBe("Shop");
    expect(g.meta.description).toBe("The whole shop.");
    expect(g.nodes).toEqual([
      expect.objectContaining({ id: "billing", kind: "domain", name: "Billing", description: "Money things.", parent: null }),
    ]);
  });

  it("records where each node was declared", () => {
    const g = buildGraph([src(`/** @service api */\nexport const x = 1;\n`, "src/api.ts")]);
    expect(g.nodes[0]).toMatchObject({ file: "src/api.ts", line: 1 });
  });

  it("parses keys: in:, tech: (quoted), tags:", () => {
    const g = buildGraph([
      src(`
/** @domain Billing */
/** @service invoicing in:Billing tech:"Node.js 22" tags:critical,pci */
export {};
`),
    ]);
    const svc = g.nodes.find((n) => n.kind === "service")!;
    expect(svc).toMatchObject({ id: "billing/invoicing", tech: "Node.js 22", tags: ["critical", "pci"] });
  });

  it("expands the tables: shorthand on @database into table nodes", () => {
    const g = buildGraph([src(`/** @database billing-db tables:invoices,line_items */\nexport {};\n`)]);
    expect(g.nodes.map((n) => n.id)).toEqual(["billing-db", "billing-db/invoices", "billing-db/line_items".replace("_", "-")]);
    expect(g.nodes.filter((n) => n.kind === "table")).toHaveLength(2);
  });

  it("infers @fn and @job names from the documented declaration", () => {
    const g = buildGraph([
      src(`
/** @service api */

/**
 * @fn
 */
export function computeTax(cents: number): number {
  return cents;
}

class Worker {
  /** @job */
  async nightlySweep() {}
}
`),
    ]);
    expect(g.nodes.map((n) => n.id)).toContain("api/compute-tax");
    expect(g.nodes.map((n) => n.id)).toContain("api/nightly-sweep");
  });

  it("attaches members to the file's @service context, and honours of: overrides", () => {
    const g = buildGraph([
      src(`/** @service payments */\nexport {};`, "payments.ts"),
      src(
        `
/** @service orders */

/** @endpoint POST /orders */
export async function place() {}

/** @fn of:payments */
export function fees() {}
`,
        "orders.ts",
      ),
    ]);
    expect(g.nodes.map((n) => n.id)).toContain("orders/post-orders");
    expect(g.nodes.map((n) => n.id)).toContain("payments/fees");
  });
});

describe("hierarchy", () => {
  it("nests functions inside endpoints, jobs, and other functions", () => {
    const g = buildGraph([
      src(`
/** @service orders */

/** @endpoint POST /orders */
export async function place() {}

/** @fn of:post-orders */
export function validateCart() {}

/** @fn of:validateCart */
export function checkInventory() {}

/** @job sweeper */
export async function sweep() {}

/** @fn of:sweeper */
export function isExpired() {}
`),
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining([
        "orders/post-orders/validate-cart",
        "orders/post-orders/validate-cart/check-inventory",
        "orders/sweeper/is-expired",
      ]),
    );
  });

  it("nests endpoints inside endpoints (resource groups)", () => {
    const g = buildGraph([
      src(`
/** @service gateway */
/** @endpoint /lists */
/** @endpoint GET /lists of:lists */
/** @endpoint POST /lists of:lists */
export {};
`),
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["gateway/lists", "gateway/lists/get-lists", "gateway/lists/post-lists"]),
    );
  });

  it("puts service-private infrastructure inside the service", () => {
    const g = buildGraph([
      src(`
/** @domain Billing */
/** @service invoicing in:Billing */

/** @cache dedupe-cache tech:Redis */
export const cache = new Map();

/** @database scratch-db tables:staging */
export const db = {};
`),
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining([
        "billing/invoicing/dedupe-cache",
        "billing/invoicing/scratch-db",
        "billing/invoicing/scratch-db/staging",
      ]),
    );
  });

  it("attaches members to the file's @of directive when the parent lives elsewhere", () => {
    const g = buildGraph([
      src(`/** @service gateway */\nexport {};`, "main.ts"),
      src(
        `
/** @of gateway */

/** @endpoint GET /lists */
export async function list() {}

/** @fn */
export function toDto() {}
`,
        "routes/lists.ts",
      ),
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["gateway/get-lists", "gateway/to-dto"]),
    );
  });

  it("lets @of point at an endpoint group in another file", () => {
    const g = buildGraph([
      src(`/** @service gateway */\n/** @endpoint /lists */\nexport {};`, "router.ts"),
      src(`/** @of gateway.lists */\n\n/** @endpoint GET /lists */\nexport async function list() {}`, "lists.ts"),
    ]);
    expect(g.nodes.map((n) => n.id)).toContain("gateway/lists/get-lists");
  });

  it("resolves dotted parent paths when the bare name is ambiguous", () => {
    const g = buildGraph([
      src(`
/** @domain A */
/** @service api in:A */
/** @domain B */
/** @service api in:B */
/** @fn health of:a.api */
export function health() {}
`),
    ]);
    expect(g.nodes.map((n) => n.id)).toContain("a/api/health");
  });

  it("rejects @of next to a node tag", () => {
    expect(() => buildGraph([src(`/** @service s\n * @of x */\nexport {};`)])).toThrow(/file directive/);
  });

  it("rejects containment cycles", () => {
    expect(() =>
      buildGraph([src(`/** @domain A in:B */\n/** @domain B in:A */\nexport {};`)]),
    ).toThrow(/contained in itself/);
  });
});

describe("edges", () => {
  const system = `
/** @domain Billing */
/** @database billing-db in:Billing tables:invoices */
/** @event invoice.paid in:Billing */
/** @external Stripe in:Billing */
export {};
`;

  it("attaches edge tags to the node declared in the same comment, reason becomes the label", () => {
    const g = buildGraph([
      src(system, "arch.ts"),
      src(
        `
/**
 * @service invoicing in:Billing
 * @reads billing-db.invoices
 * @emits invoice.paid so dunning can stop retrying
 * @calls Stripe charge cards
 */
export {};
`,
        "invoicing.ts",
      ),
    ]);
    expect(g.edges).toEqual([
      expect.objectContaining({ kind: "reads", from: "billing/invoicing", to: "billing/billing-db/invoices" }),
      expect.objectContaining({ kind: "emits", to: "billing/invoice-paid", label: "so dunning can stop retrying" }),
      expect.objectContaining({ kind: "calls", to: "billing/stripe", label: "charge cards" }),
    ]);
  });

  it("resolves dotted event names without treating the dot as a path", () => {
    const g = buildGraph([
      src(system),
      src(`/** @service s in:Billing\n * @consumes invoice.paid */\nexport {};`, "s.ts"),
    ]);
    expect(g.edges[0]).toMatchObject({ kind: "consumes", to: "billing/invoice-paid" });
  });

  it("rejects targets that match nothing, with suggestions", () => {
    expect(() =>
      buildGraph([src(system), src(`/** @service s in:Billing\n * @reads billing-db.invocies */\nexport {};`, "s.ts")]),
    ).toThrow(/doesn't match anything/);
  });

  it("rejects ambiguous targets and asks for qualification", () => {
    expect(() =>
      buildGraph([
        src(`
/** @service a */
/** @service b */
export {};
`),
        src(`
/** @service a2 */
/** @endpoint GET /x */
export function xa() {}
`, "a.ts"),
        src(`
/** @service b2 */
/** @endpoint GET /x */
export function xb() {}
`, "b.ts"),
        src(`/** @service caller\n * @calls get-x */\nexport {};`, "c.ts"),
      ]),
    ).toThrow(/ambiguous/);
  });

  it("rejects @emits pointing at something that is not an event or queue", () => {
    expect(() =>
      buildGraph([src(system), src(`/** @service s in:Billing\n * @emits Stripe */\nexport {};`, "s.ts")]),
    ).toThrow(/targets an @event or @queue/);
  });

  it("rejects self-edges", () => {
    expect(() => buildGraph([src(`/** @service s\n * @calls s */\nexport {};`)])).toThrow(/cannot calls itself/);
  });
});

describe("problems that keep the map honest", () => {
  it("rejects a member with no service in scope", () => {
    expect(() => buildGraph([src(`/** @endpoint GET /x */\nexport function x() {}`)])).toThrow(/has no parent/);
  });

  it("rejects unknown in: parents and lists plausible containers", () => {
    expect(() => buildGraph([src(`/** @domain A */\n/** @service s in:B */\nexport {};`)])).toThrow(
      /no parent named "B" for service "s" — things that could contain it: A/,
    );
  });

  it("rejects parents the containment matrix forbids", () => {
    expect(() => buildGraph([src(`/** @external Stripe */\n/** @fn fees of:Stripe */\nexport {};`)])).toThrow(
      /"Stripe" \(external\) cannot contain a function/,
    );
  });

  it("rejects duplicate declarations, pointing at both sites", () => {
    expect(() =>
      buildGraph([src(`/** @service api */\nexport {};`, "one.ts"), src(`/** @service api */\nexport {};`, "two.ts")]),
    ).toThrow(/duplicate service "api" — already declared at one\.ts:1/);
  });

  it("rejects two node tags in one comment", () => {
    expect(() => buildGraph([src(`/** @service a\n * @database b */\nexport {};`)])).toThrow(/one node per comment/);
  });

  it("rejects edge tags with no node tag to attach to", () => {
    expect(() => buildGraph([src(`/** @service a */\nexport {};\n/** @calls a */\nexport const x = 1;`)])).toThrow(
      /nothing to attach to/,
    );
  });

  it("rejects a second, different @system", () => {
    expect(() =>
      buildGraph([src(`/** @system One */\nexport {};`, "a.ts"), src(`/** @system Two */\nexport {};`, "b.ts")]),
    ).toThrow(/declared twice/);
  });

  it("reports every problem at once, each with file:line", () => {
    try {
      buildGraph([src(`/** @service s\n * @reads nope\n * @writes alsonope */\nexport {};`, "s.ts")]);
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("2 problems");
      expect(msg).toContain("s.ts:2");
      expect(msg).toContain("s.ts:3");
    }
  });

  it("rejects an empty scan", () => {
    expect(() => buildGraph([src(`export const x = 1;`)])).toThrow(/no annotations found/);
  });
});

describe("comments that are not chorograph's business", () => {
  it("ignores plain JSDoc (@param, @returns) and line comments", () => {
    const g = buildGraph([
      src(`
/** @service api */

/**
 * Adds two numbers.
 * @param a first
 * @returns sum
 */
export function add(a: number, b: number) { return a + b; }

// @service not-a-real-one (line comments don't count)
const s = "/** @service also-not-real */";
export { s };
`),
    ]);
    expect(g.nodes.map((n) => n.id)).toEqual(["api"]);
  });
});
