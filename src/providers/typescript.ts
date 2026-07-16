/**
 * The TypeScript/JavaScript provider — turns a directory of `.ts`/`.tsx` files into raw nodes + edges.
 *
 * Zero-config by default: every source file becomes a `module` node, and its place in the tree is
 * derived from its **directory path** relative to the scan root — so any repo maps instantly with no
 * setup. Nothing is *assumed* about what the folders mean; the map simply mirrors the structure that
 * is already there. `import` edges are resolved with the TypeScript compiler API (parse-only, no
 * type-checking, so it stays fast on large trees).
 *
 * Annotations are optional enrichment layered on top (when `opts.annotations`): a `@chorograph` tag
 * can override a module's `group`, add semantic `role`/`comms`/`talksTo`/`status`, mark entrypoints,
 * or promote individual declarations to `symbol` nodes for finer detail.
 *
 * @chorograph group="Providers/TypeScript" role=adapter comms=in-proc talksTo=TypeScript
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { ANNOTATION_TAGS, parseAnnotation } from "../core/annotations.ts";
import type {
  Comms,
  Edge,
  Node,
  Provider,
  ProviderOptions,
  ProviderResult,
  SymbolType,
} from "../core/model.ts";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".git",
  "coverage",
  "storybook-static",
  ".chorograph",
  ".cache",
  "vendor",
]);

const isSource = (f: string): boolean =>
  (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".mts") || f.endsWith(".cts")) &&
  !f.endsWith(".d.ts");

const norm = (p: string): string => p.split(sep).join("/");
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The directory chain of a file, as a `/`-joined group path. Root-level files get no group. */
function dirGroup(relFile: string): string | undefined {
  const i = relFile.lastIndexOf("/");
  return i === -1 ? undefined : relFile.slice(0, i);
}

/** Recursively collect every source file under `root`, skipping build/vendor dirs. No layout assumed. */
function discoverFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
      } else if (e.isFile() && isSource(e.name)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/** Minimal, parse-only compiler options: resolve imports the way a bundler does, no type-checking. */
function compilerOptions(root: string): ts.CompilerOptions {
  const found = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  let base: ts.CompilerOptions = {};
  if (found !== undefined) {
    const read = ts.readConfigFile(found, ts.sys.readFile);
    const parsed = ts.convertCompilerOptionsFromJson(
      (read.config as { compilerOptions?: unknown })?.compilerOptions ?? {},
      root,
    );
    base = parsed.options;
  }
  return {
    ...base,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    baseUrl: base.baseUrl ?? root,
    noEmit: true,
  };
}

function symbolTypeOf(node: ts.Node): SymbolType {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableStatement(node)) {
    const d = node.declarationList.declarations[0];
    const init = d?.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return "function";
    return "constant";
  }
  return "unknown";
}

function declName(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.text;
  }
  if (ts.isVariableStatement(node)) {
    const d = node.declarationList.declarations[0];
    return d !== undefined && ts.isIdentifier(d.name) ? d.name.text : undefined;
  }
  if (ts.isExportAssignment(node)) return "default";
  return undefined;
}

function isCapturable(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableStatement(node) ||
    ts.isExportAssignment(node)
  );
}

function isExported(node: ts.Node): boolean {
  const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
  return (flags & ts.ModifierFlags.Export) !== 0 || ts.isExportAssignment(node);
}

/** The first paragraph of a JSDoc block (tag stripped), collapsed to one line. */
function proseOf(tag: ts.JSDocTag): string {
  const jsdoc = tag.parent;
  if (jsdoc !== undefined && ts.isJSDoc(jsdoc)) {
    const text = ts.getTextOfJSDocComment(jsdoc.comment) ?? "";
    const firstPara = text.split(/\n\s*\n/)[0] ?? text;
    return firstPara.replace(/\s+/g, " ").trim();
  }
  return "";
}

/** Pick the annotation tag on a node, ignoring ones that are prose *about* the tag (self-docs). */
function annotationTag(node: ts.Node): ts.JSDocTag | undefined {
  const tags = ts
    .getJSDocTags(node)
    .filter((t) => (ANNOTATION_TAGS as readonly string[]).includes(t.tagName.text));
  if (tags.length === 0) return undefined;
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i];
    if (tag === undefined) continue;
    const text = ts.getTextOfJSDocComment(tag.comment) ?? "";
    const p = parseAnnotation(text);
    if (p.roles.length > 0 || p.comms.length > 0 || p.talksTo.length > 0 || p.group !== undefined || text.includes("=")) {
      return tag;
    }
  }
  return tags[tags.length - 1];
}

/** A talks-to declaration awaiting resolution to a node or an external. */
interface TalksTo {
  readonly from: string;
  readonly target: string;
  readonly comms: Comms;
}

interface FileNodes {
  readonly moduleNode: Node;
  readonly symbols: readonly Node[];
  /** Symbol name → node id, for named-import edge resolution. */
  readonly byName: Map<string, string>;
  readonly talksTo: readonly TalksTo[];
}

/** Extract the module node + symbol nodes + talks-to declarations for one parsed file. */
function nodesInFile(sf: ts.SourceFile, relFile: string, annotations: boolean): FileNodes {
  let moduleAnn: ReturnType<typeof parseAnnotation> | undefined;
  let moduleProse = "";
  const first = sf.statements[0];
  if (annotations && first !== undefined && !isCapturable(first)) {
    const tag = annotationTag(first);
    if (tag !== undefined) {
      moduleAnn = parseAnnotation(ts.getTextOfJSDocComment(tag.comment) ?? "");
      moduleProse = proseOf(tag);
    }
  }

  const symbols: Node[] = [];
  const byName = new Map<string, string>();
  const talksTo: TalksTo[] = [];

  const fileBase = (relFile.split("/").pop() ?? relFile).replace(/\.(m|c)?tsx?$/, "");
  const moduleId = relFile;
  // Structure defaults to the directory tree; an annotation `group=` overrides it.
  const moduleGroup = moduleAnn?.group ?? dirGroup(relFile);

  if (annotations) sf.forEachChild((node) => {
    if (!isCapturable(node)) return;
    const tag = annotationTag(node);
    if (tag === undefined) return;
    const ann = parseAnnotation(ts.getTextOfJSDocComment(tag.comment) ?? "");
    const name = ann.name ?? declName(node) ?? "(anonymous)";
    const id = `${relFile}#${name}`;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const group = ann.group ?? moduleGroup;
    const prose = proseOf(tag);
    symbols.push({
      id,
      label: name,
      containment: "symbol",
      parent: moduleId,
      symbolType: symbolTypeOf(node),
      roles: ann.roles,
      comms: ann.comms,
      status: ann.status ?? "active",
      tags: ann.tags,
      exported: isExported(node),
      line,
      file: relFile,
      root: ann.root,
      ...(group !== undefined ? { group } : {}),
      ...(prose ? { description: prose } : {}),
    });
    byName.set(name, id);
    const comms = ann.comms[0] ?? "in-proc";
    for (const target of ann.talksTo) talksTo.push({ from: id, target, comms });
  });

  const moduleNode: Node = {
    id: moduleId,
    label: moduleAnn?.name ?? fileBase,
    containment: "module",
    parent: null,
    roles: moduleAnn?.roles ?? [],
    comms: moduleAnn?.comms ?? [],
    status: moduleAnn?.status ?? "active",
    tags: moduleAnn?.tags ?? [],
    file: relFile,
    root: moduleAnn?.root ?? false,
    weight: symbols.length,
    ...(moduleGroup !== undefined ? { group: moduleGroup } : {}),
    ...(moduleProse ? { description: moduleProse } : {}),
  };
  if (moduleAnn !== undefined) {
    const comms = moduleAnn.comms[0] ?? "in-proc";
    for (const target of moduleAnn.talksTo) talksTo.push({ from: moduleId, target, comms });
  }

  return { moduleNode, symbols, byName, talksTo };
}

export function createTypeScriptProvider(): Provider {
  return {
    name: "typescript",
    detect(root: string): boolean {
      return discoverFiles(root).length > 0;
    },
    scan(root: string, opts: ProviderOptions): ProviderResult {
      const options = compilerOptions(root);
      const host = ts.createCompilerHost(options);
      const files = discoverFiles(root);

      const byFile = new Map<string, FileNodes>();
      const absToRel = new Map<string, string>();
      const relToAbs = new Map<string, string>();
      const nodes: Node[] = [];

      for (const abs of files) {
        let text: string;
        try {
          text = readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        const relFile = norm(relative(root, abs));
        const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
        const fn = nodesInFile(sf, relFile, opts.annotations);
        byFile.set(relFile, fn);
        absToRel.set(norm(abs), relFile);
        relToAbs.set(relFile, abs);
        nodes.push(fn.moduleNode, ...fn.symbols);
      }

      const edges = new Map<string, Edge>();
      const addEdge = (from: string, to: string, relation: Edge["relation"], comms: Comms, label?: string): void => {
        if (from === to) return;
        const id = `${relation}:${from}->${to}`;
        const existing = edges.get(id);
        if (existing) {
          edges.set(id, { ...existing, weight: existing.weight + 1 });
          return;
        }
        edges.set(id, { id, from, to, relation, comms, weight: 1, ...(label !== undefined ? { label } : {}) });
      };

      // --- import edges: module(A) → symbol(B) when a named import matches, else module(B) --------
      for (const [relFile, fn] of byFile) {
        const abs = relToAbs.get(relFile);
        if (abs === undefined) continue;
        const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
        sf.forEachChild((stmt) => {
          const spec =
            (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier
              ? stmt.moduleSpecifier
              : undefined;
          if (spec === undefined || !ts.isStringLiteral(spec)) return;
          const res = ts.resolveModuleName(spec.text, abs, options, host).resolvedModule;
          if (res === undefined) return;
          const targetRel = absToRel.get(norm(res.resolvedFileName));
          if (targetRel === undefined) return;
          const target = byFile.get(targetRel);
          if (target === undefined) return;
          let to = target.moduleNode.id;
          if (
            ts.isImportDeclaration(stmt) &&
            stmt.importClause?.namedBindings &&
            ts.isNamedImports(stmt.importClause.namedBindings)
          ) {
            for (const el of stmt.importClause.namedBindings.elements) {
              const hit = target.byName.get(el.name.text);
              if (hit !== undefined) {
                to = hit;
                break;
              }
            }
          }
          addEdge(fn.moduleNode.id, to, "import", "import");
        });
      }

      // --- talks-to edges: declared targets → node by label, else external ------------------------
      const byLabel = new Map<string, string>();
      for (const n of nodes) {
        const key = n.label.toLowerCase();
        if (!byLabel.has(key)) byLabel.set(key, n.id);
      }
      const externals = new Map<string, Node>();
      for (const fn of byFile.values()) {
        for (const t of fn.talksTo) {
          const hit = byLabel.get(t.target.toLowerCase());
          if (hit !== undefined) {
            addEdge(t.from, hit, "talks-to", t.comms, t.target);
          } else {
            const extId = `ext:${slug(t.target)}`;
            if (!externals.has(extId)) {
              externals.set(extId, {
                id: extId,
                label: t.target,
                containment: "external",
                parent: null,
                roles: ["external"],
                comms: [t.comms],
                status: "active",
                tags: [],
              });
            }
            addEdge(t.from, extId, "talks-to", t.comms, t.target);
          }
        }
      }
      for (const ext of externals.values()) nodes.push(ext);

      return { nodes, edges: [...edges.values()] };
    },
  };
}
