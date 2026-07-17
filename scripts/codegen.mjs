/**
 * Generates language bindings from spec/contract.json, the single source of truth for the
 * chorograph contract. Emits:
 *
 *   packages/chorograph/src/core/model.gen.ts     types + grammar constants for the scanner
 *   packages/chorograph/src/viewer/model.gen.ts   identical copy (the viewer bundle must not import core)
 *   spec/graph.schema.json                        JSON Schema for graph.json, for any other language
 *
 * `node scripts/codegen.mjs --check` verifies the checked-in output matches the spec (CI runs this).
 * A future Python package adds an emitter here and a directory under packages/.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(join(root, "spec/contract.json"), "utf8"));
const check = process.argv.includes("--check");

const nodeKinds = spec.nodeKinds.map((n) => n.kind);
const edgeKinds = spec.edgeKinds.map((e) => e.kind);

// ── TypeScript ──────────────────────────────────────────────────────────────────────────────

/** spec type mini-language → TypeScript type. */
function tsType(field) {
  const t = field.type;
  let out;
  if (t.endsWith("[]")) out = `readonly ${t.slice(0, -2)}[]`;
  else if (t.startsWith("countmap:")) out = `Readonly<Partial<Record<${t.slice(9)}, number>>>`;
  else if (t.startsWith("const:")) out = JSON.stringify(t.slice(6));
  else if (t === "int") out = "number";
  else out = t;
  if (field.nullable) out += " | null";
  return out;
}

const docLine = (doc, indent = "") => (doc ? `${indent}/** ${doc} */\n` : "");

function tsModule() {
  const lines = [];
  lines.push(`/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: spec/contract.json. Regenerate with \`pnpm codegen\` at the repo root.
 * Node/edge kinds, the tag grammar, the containment matrix, and the graph.json wire format all
 * live in the spec so every language package ships the identical contract.
 */\n`);

  const kindUnion = (kinds, docs) =>
    kinds
      .map((k, i) => `  | ${JSON.stringify(k)}${i === kinds.length - 1 ? ";" : ""}${docs[i] ? ` // ${docs[i]}` : ""}`)
      .join("\n");

  lines.push(`/** What a node *is*. A small closed set, one icon and one colour each. */`);
  lines.push(`export type NodeKind =\n${kindUnion(nodeKinds, spec.nodeKinds.map((n) => n.doc))}\n`);
  lines.push(`export const NODE_KINDS: readonly NodeKind[] = ${JSON.stringify(nodeKinds)};\n`);

  lines.push(
    `/** How two nodes are connected. \`from\` is the thing doing the verb, \`to\` is the thing the verb is done to. */`,
  );
  lines.push(`export type EdgeKind =\n${kindUnion(edgeKinds, spec.edgeKinds.map((e) => e.doc))}\n`);
  lines.push(`export const EDGE_KINDS: readonly EdgeKind[] = ${JSON.stringify(edgeKinds)};\n`);

  const tagPairs = spec.nodeKinds.flatMap((n) => n.tags.map((t) => `  ${t}: ${JSON.stringify(n.kind)},`));
  lines.push(`/** Doc-comment tag → the node kind it declares (\`@fn\` and \`@function\` are aliases). */`);
  lines.push(`export const NODE_TAGS: Readonly<Record<string, NodeKind>> = {\n${tagPairs.join("\n")}\n};\n`);
  lines.push(`/** Edge tags are the edge kinds themselves: \`@calls\`, \`@reads\`, … */`);
  lines.push(`export const EDGE_TAGS: ReadonlySet<EdgeKind> = new Set(EDGE_KINDS);\n`);

  const containRows = spec.nodeKinds.map((n) => `  ${n.kind}: ${JSON.stringify(n.contains)},`);
  lines.push(`/** What can live inside what — the whole hierarchy in one table. */`);
  lines.push(
    `export const CONTAINS: Readonly<Record<NodeKind, readonly NodeKind[]>> = {\n${containRows.join("\n")}\n};\n`,
  );

  const members = spec.nodeKinds.filter((n) => n.requiresParent).map((n) => n.kind);
  lines.push(`/** Kinds that make no sense floating free — they must resolve to a parent. */`);
  lines.push(`export const MEMBER_KINDS: ReadonlySet<NodeKind> = new Set(${JSON.stringify(members)});\n`);

  for (const [name, rec] of Object.entries(spec.records)) {
    lines.push(docLine(rec.doc).trimEnd());
    const fields = rec.fields
      .map((f) => `${docLine(f.doc, "  ")}  readonly ${f.name}${f.optional ? "?" : ""}: ${tsType(f)};`)
      .join("\n");
    lines.push(`export interface ${name} {\n${fields}\n}\n`);
  }
  return lines.join("\n");
}

// ── JSON Schema ─────────────────────────────────────────────────────────────────────────────

/** spec type mini-language → JSON Schema. */
function schemaType(field) {
  const t = field.type;
  let out;
  if (t.endsWith("[]")) out = { type: "array", items: schemaType({ type: t.slice(0, -2) }) };
  else if (t.startsWith("countmap:"))
    out = {
      type: "object",
      propertyNames: { $ref: `#/$defs/${t.slice(9)}` },
      additionalProperties: { type: "integer", minimum: 0 },
    };
  else if (t.startsWith("const:")) out = { const: t.slice(6) };
  else if (t === "string") out = { type: "string" };
  else if (t === "int") out = { type: "integer" };
  else out = { $ref: `#/$defs/${t}` };
  if (field.nullable) out = { oneOf: [out, { type: "null" }] };
  if (field.doc) out = { description: field.doc.replaceAll("`", ""), ...out };
  return out;
}

function jsonSchema() {
  const $defs = {
    NodeKind: { type: "string", enum: nodeKinds },
    EdgeKind: { type: "string", enum: edgeKinds },
  };
  for (const [name, rec] of Object.entries(spec.records)) {
    $defs[name] = {
      type: "object",
      description: rec.doc?.replaceAll("`", ""),
      properties: Object.fromEntries(rec.fields.map((f) => [f.name, schemaType(f)])),
      required: rec.fields.filter((f) => !f.optional).map((f) => f.name),
    };
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://raw.githubusercontent.com/flancast90/chorograph/main/spec/graph.schema.json",
    title: "chorograph graph.json",
    $comment: "GENERATED from spec/contract.json — do not edit. Regenerate with `pnpm codegen`.",
    $ref: "#/$defs/Graph",
    $defs,
  };
}

// ── emit ────────────────────────────────────────────────────────────────────────────────────

const outputs = [
  ["packages/chorograph/src/core/model.gen.ts", tsModule()],
  ["packages/chorograph/src/viewer/model.gen.ts", tsModule()],
  ["spec/graph.schema.json", JSON.stringify(jsonSchema(), null, 2) + "\n"],
];

let drifted = false;
for (const [rel, content] of outputs) {
  const path = join(root, rel);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (check) {
    if (current !== content) {
      console.error(`✗ ${rel} is out of date with spec/contract.json — run \`pnpm codegen\``);
      drifted = true;
    }
  } else if (current !== content) {
    writeFileSync(path, content);
    console.log(`wrote ${rel}`);
  } else {
    console.log(`unchanged ${rel}`);
  }
}
if (check && drifted) process.exit(1);
if (check) console.log("✓ generated code matches spec/contract.json");
