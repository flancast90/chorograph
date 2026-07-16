/**
 * The vocabulary chorograph speaks in.
 *
 * A codebase is modelled as a **containment tree** of {@link Node}s — regions nest into regions,
 * regions hold modules, modules hold symbols — plus a set of directed {@link Edge}s describing how
 * those things actually talk to each other. This is deliberately language-agnostic: a
 * {@link Provider} for any language produces this same shape, and everything downstream (layout,
 * rollup, rendering) speaks only this vocabulary.
 *
 * chorograph is **zero-config**: structure (which layer/service a thing belongs to) defaults to the
 * project's own directory tree, and edges come from `import` statements — both facts, not conventions,
 * so no assumptions are made about what any folder *means*. A one-line `@chorograph` annotation is
 * optional: it adds semantics (`role`, `comms`, `talksTo`, `status`) or overrides `group` when the
 * folder layout and the logical architecture diverge. Drop it in any TypeScript project and it works.
 *
 * @chorograph role=domain-model group="Core" comms=in-proc
 */

/**
 * A node's structural level in the containment tree — the "general parts of software" axis.
 * `region` nests arbitrarily deep via a `group` path (e.g. `Domain/Ports`), so this stays a small
 * closed set while the tree carries the depth. Groups come from the directory tree by default, or an
 * explicit annotation override.
 */
export type Containment = "region" | "module" | "symbol" | "external";

/**
 * What a symbol *is* syntactically. Coarse on purpose — finer, opinionated classification lives in
 * {@link Node.roles} so it can be extended without touching the core.
 */
export type SymbolType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "constant"
  | "enum"
  | "component"
  | "unknown";

/**
 * A semantic sub-type used for filtering and colour. Open-ended by design: `agent-tool`, `http-route`,
 * `repository`, `port`, `adapter`, `usecase`, `workflow`, `event`, `cli`, `client`, `config`, … A node
 * keeps its structural {@link Node.symbolType} *and* any number of roles — an agent tool is still a
 * function, so you can filter to "functions" or to "agent tools" independently.
 */
export type Role = string;

/** How two nodes communicate. Drives edge colour and label; open-ended, with well-known values. */
export type Comms =
  | "in-proc" // direct call in the same process (the default derived edge)
  | "http"
  | "sse"
  | "sql"
  | "queue"
  | "grpc"
  | "temporal"
  | "oauth"
  | "llm"
  | "embedding"
  | "s3"
  | "smtp"
  | "mcp"
  | "cron"
  | "import" // static module dependency, unclassified
  | (string & {});

export type Status = "active" | "deprecated" | "experimental";

/** A single thing in the map: a region, a module (file), a symbol, or an external system. */
export interface Node {
  /** Stable id. Regions: `region:<path>`. Modules: relative file path. Symbols: `<file>#<name>`. */
  readonly id: string;
  readonly label: string;
  readonly containment: Containment;
  /** Containment parent id, or `null` for a top-level region / external. */
  readonly parent: string | null;
  readonly symbolType?: SymbolType;
  /** Semantic sub-types for filtering (`agent-tool`, `http-route`, …). Always present, may be empty. */
  readonly roles: readonly Role[];
  readonly comms: readonly Comms[];
  readonly status: Status;
  readonly tags: readonly string[];
  readonly description?: string;
  readonly file?: string;
  readonly line?: number;
  readonly exported?: boolean;
  /** Raw declared containment path (`Domain/Ports`) this node was placed under. For reference. */
  readonly group?: string;
  /** Whether the annotation/provider marked this a legitimate entrypoint (never flagged orphan). */
  readonly root?: boolean;
  /** Cheap size metric for level-of-detail sizing: lines of code, or descendant count for regions. */
  readonly weight?: number;
}

/** A directed connection. Every edge points `from → to`; there are no undirected edges. */
export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** `import`/`call` are derived from code; `talks-to` is declared in an annotation. */
  readonly relation: "import" | "call" | "talks-to";
  readonly comms: Comms;
  /** Fan-in count for rolled-up edges (how many underlying edges this represents). */
  readonly weight: number;
  readonly label?: string;
}

/** Deadness verdicts, split by axis so the viewer can style each differently. */
export interface Dead {
  /** Non-root symbols with zero inbound edges. */
  readonly orphans: readonly string[];
  /** Nodes reachable from no entrypoint (root) by following directed edges. */
  readonly unreachable: readonly string[];
  /** `status=deprecated` nodes. */
  readonly deprecated: readonly string[];
}

export interface GraphMeta {
  readonly tool: "chorograph";
  readonly version: string;
  readonly generatedAt: string;
  readonly root: string;
  readonly provider: string;
  readonly counts: {
    readonly regions: number;
    readonly modules: number;
    readonly symbols: number;
    readonly externals: number;
    readonly edges: number;
  };
  /** Distinct role → count, so the viewer can build filters without a full scan. */
  readonly roles: Record<string, number>;
}

/** The complete, serialisable map. This is the on-disk `graph.json` contract. */
export interface Graph {
  readonly meta: GraphMeta;
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
  readonly dead: Dead;
}

/**
 * A language provider turns a directory into raw nodes + edges. The core assembles containment,
 * rollup, deadness and metadata around it, so a provider only has to know how to read one language.
 */
export interface Provider {
  readonly name: string;
  /** True if this provider should handle the given root (e.g. sees a tsconfig / package.json). */
  detect(root: string): boolean;
  scan(root: string, opts: ProviderOptions): Promise<ProviderResult> | ProviderResult;
}

export interface ProviderOptions {
  readonly onWarn: (msg: string) => void;
  /** Honour semantic annotations (`@chorograph` / `@archmap`) on top of zero-config inference. */
  readonly annotations: boolean;
}

export interface ProviderResult {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}
