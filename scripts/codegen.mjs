/**
 * Generates language bindings from the spec, using standard tooling end to end:
 *
 *   spec/graph.schema.json   JSON Schema (2020-12), handwritten — the graph.json wire contract
 *   spec/grammar.json        tag vocabulary + containment rules, validated by grammar.schema.json
 *
 * TypeScript types come from json-schema-to-typescript (the same schema a Python package would
 * feed to datamodel-code-generator); the grammar is embedded verbatim as a typed const. Two
 * copies are written because the viewer bundle must not import core.
 *
 * `node scripts/codegen.mjs --check` verifies spec validity and that checked-in output is
 * current (CI runs this). Cross-language invariants enforced here:
 *   - grammar.json validates against grammar.schema.json
 *   - graph.schema.json compiles as a 2020-12 schema
 *   - the kind sets in grammar.json and graph.schema.json are identical
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { compile } from "json-schema-to-typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const read = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

const graphSchema = read("spec/graph.schema.json");
const grammarSchema = read("spec/grammar.schema.json");
const grammar = read("spec/grammar.json");

// ── spec validation ────────────────────────────────────────────────────────────────────────────

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// ajv doesn't know json-schema-to-typescript's `tsType` extension keyword; register it as a no-op.
const ajv = new Ajv2020({ allErrors: true, keywords: ["tsType"] });
addFormats(ajv);
try {
  ajv.compile(graphSchema);
} catch (e) {
  fail(`spec/graph.schema.json is not a valid 2020-12 schema: ${e.message}`);
}
const validateGrammar = ajv.compile(grammarSchema);
if (!validateGrammar(grammar)) {
  fail(`spec/grammar.json fails grammar.schema.json:\n${ajv.errorsText(validateGrammar.errors, { separator: "\n" })}`);
}

const schemaNodeKinds = graphSchema.$defs.NodeKind.enum;
const schemaEdgeKinds = graphSchema.$defs.EdgeKind.enum;
const grammarNodeKinds = grammar.nodeKinds.map((n) => n.kind);
const grammarEdgeKinds = grammar.edgeKinds.map((e) => e.kind);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
if (!same(schemaNodeKinds, grammarNodeKinds))
  fail(`NodeKind mismatch — graph.schema.json has [${schemaNodeKinds}], grammar.json has [${grammarNodeKinds}]`);
if (!same(schemaEdgeKinds, grammarEdgeKinds))
  fail(`EdgeKind mismatch — graph.schema.json has [${schemaEdgeKinds}], grammar.json has [${grammarEdgeKinds}]`);
for (const n of grammar.nodeKinds)
  for (const child of n.contains)
    if (!grammarNodeKinds.includes(child)) fail(`grammar.json: "${n.kind}" contains unknown kind "${child}"`);

// ── emit ────────────────────────────────────────────────────────────────────────────────────

const banner = (source) => `/**
 * GENERATED FILE — do not edit.
 *
 * Source of truth: ${source}. Regenerate with \`pnpm codegen\` at the repo root.
 */`;

const modelTs = await compile(graphSchema, "Graph", {
  bannerComment: banner("spec/graph.schema.json (via json-schema-to-typescript)"),
  additionalProperties: false,
});

const grammarTs = `${banner("spec/grammar.json, validated by spec/grammar.schema.json")}

export default ${JSON.stringify({ nodeKinds: grammar.nodeKinds, edgeKinds: grammar.edgeKinds }, null, 2)} as const;
`;

const outputs = [
  ["packages/chorograph/src/core/model.gen.ts", modelTs],
  ["packages/chorograph/src/core/grammar.gen.ts", grammarTs],
  ["packages/chorograph/src/viewer/model.gen.ts", modelTs],
  ["packages/chorograph/src/viewer/grammar.gen.ts", grammarTs],
];

let drifted = false;
for (const [rel, content] of outputs) {
  const path = join(root, rel);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (check) {
    if (current !== content) {
      console.error(`✗ ${rel} is out of date with spec/ — run \`pnpm codegen\``);
      drifted = true;
    }
  } else if (current !== content) {
    writeFileSync(path, content);
    console.log(`wrote ${rel}`);
  } else {
    console.log(`unchanged ${rel}`);
  }
}
if (drifted) process.exit(1);
if (check) console.log("✓ spec valid; generated code current");
