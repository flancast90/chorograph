/**
 * The scanner's output must conform to spec/graph.schema.json — the language-neutral contract
 * every chorograph implementation shares. TS types are checked at compile time; this checks the
 * actual serialised shape, which is what a Python (or any other) package would consume.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { buildGraph } from "./annotations.ts";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, "../../../../spec/graph.schema.json"), "utf8"));

describe("graph.json contract", () => {
  it("scanner output validates against spec/graph.schema.json", () => {
    const graph = buildGraph([
      {
        path: "app.ts",
        text: `
/** @system Acme */
/** @domain Commerce */
/** @database orders-db in:Commerce tech:"PostgreSQL 16" tables:orders */
/** @event order.placed in:Commerce */
/**
 * Owns the order lifecycle.
 * @service orders in:Commerce tech:Node.js
 */
/**
 * Places an order.
 * @endpoint POST /orders
 * @writes orders-db.orders
 * @emits order.placed so others can react
 */
export function placeOrder() {}
`,
      },
    ]);
    // `tsType` is json-schema-to-typescript's extension keyword; ajv treats it as a no-op.
    const ajv = new Ajv2020({ allErrors: true, keywords: ["tsType"] });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = validate(JSON.parse(JSON.stringify(graph)));
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });
});
