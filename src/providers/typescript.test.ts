/**
 * Provider checks: zero-config structure from the directory tree, and annotation override on top.
 *
 * @chorograph group="Providers/TypeScript" role=test comms=in-proc
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Node } from "../core/model.ts";
import { createTypeScriptProvider } from "./typescript.ts";

const write = (root: string, rel: string, body: string): void => {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
};

describe("typescript provider (zero-config)", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "chorograph-"));
    write(root, "src/domain/user.ts", "export const user = 1;\n");
    write(root, "src/adapters/db.ts", 'import { user } from "../domain/user.ts";\nexport const db = user;\n');
    write(
      root,
      "src/adapters/pretty.ts",
      '/**\n * @chorograph group="Adapters/Pretty" role=adapter\n */\nimport { user } from "../domain/user.ts";\nexport const pretty = user;\n',
    );
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const scan = (annotations: boolean): readonly Node[] =>
    (createTypeScriptProvider().scan(root, { annotations, onWarn: () => {} }) as { nodes: readonly Node[] }).nodes;

  it("maps every source file with a group mirroring its directory, no annotations required", () => {
    const nodes = scan(false);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get("src/domain/user.ts")?.group).toBe("src/domain");
    expect(byId.get("src/adapters/db.ts")?.group).toBe("src/adapters");
    // annotations OFF → the explicit group= is ignored, folder wins.
    expect(byId.get("src/adapters/pretty.ts")?.group).toBe("src/adapters");
  });

  it("derives an import edge between files", () => {
    const provider = createTypeScriptProvider();
    const { edges } = provider.scan(root, { annotations: false, onWarn: () => {} }) as {
      edges: readonly { from: string; to: string; relation: string }[];
    };
    expect(edges.some((e) => e.from === "src/adapters/db.ts" && e.to === "src/domain/user.ts")).toBe(true);
  });

  it("lets an annotation override the directory group when annotations are on", () => {
    const nodes = scan(true);
    const pretty = nodes.find((n) => n.id === "src/adapters/pretty.ts");
    expect(pretty?.group).toBe("Adapters/Pretty");
  });
});
