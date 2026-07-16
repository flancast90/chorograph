/**
 * Viewer-local mirror of the on-disk Graph contract. Keep in sync with `src/core/model.ts`;
 * do not import core — the report bundle must stay browser-only.
 *
 * @chorograph group="Viewer" role=domain-model comms=in-proc
 */

export type Containment = "region" | "module" | "symbol" | "external";
export type Status = "active" | "deprecated" | "experimental";
export type Comms = string;
export type Role = string;
export type NodeDiff = "added" | "removed" | "touched";
export type EdgeDiff = "added" | "removed";

export interface Node {
  readonly id: string;
  readonly label: string;
  readonly containment: Containment;
  readonly parent: string | null;
  readonly symbolType?: string;
  readonly roles: readonly Role[];
  readonly comms: readonly Comms[];
  readonly status: Status;
  readonly tags: readonly string[];
  readonly description?: string;
  readonly file?: string;
  readonly line?: number;
  readonly exported?: boolean;
  readonly group?: string;
  readonly root?: boolean;
  readonly weight?: number;
  readonly diff?: NodeDiff;
}

export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: "import" | "call" | "talks-to";
  readonly comms: Comms;
  readonly weight: number;
  readonly label?: string;
  readonly diff?: EdgeDiff;
}

export interface Dead {
  readonly orphans: readonly string[];
  readonly unreachable: readonly string[];
  readonly deprecated: readonly string[];
}

export interface DiffMeta {
  readonly base: string;
  readonly head: string;
  readonly nodesAdded: number;
  readonly nodesRemoved: number;
  readonly nodesTouched: number;
  readonly edgesAdded: number;
  readonly edgesRemoved: number;
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
  readonly roles: Record<string, number>;
  readonly diff?: DiffMeta;
}

export interface Graph {
  readonly meta: GraphMeta;
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
  readonly dead: Dead;
}

declare global {
  interface Window {
    __CHOROGRAPH__: Graph;
  }
}

/** Aggregated edge between two visible frontier nodes. */
export interface RolledEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly comms: Comms;
  readonly weight: number;
  readonly underlying: readonly string[];
  readonly diff?: EdgeDiff;
}

export interface LayoutBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutEdge {
  readonly id: string;
  readonly sections: readonly { readonly points: readonly { x: number; y: number }[] }[];
}

export interface ContainerLayout {
  readonly boxes: ReadonlyMap<string, LayoutBox>;
  readonly edges: ReadonlyMap<string, LayoutEdge>;
  readonly width: number;
  readonly height: number;
}

export interface AbsBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly node: Node;
  readonly childCount: number;
  readonly expanded: boolean;
}

export interface Filters {
  readonly roles: ReadonlySet<string>;
  readonly comms: ReadonlySet<string>;
  /** When true, emphasise dead nodes and hide everything else that isn't dead. */
  readonly deadOnly: boolean;
  /**
   * Diff mode: show only added/removed/touched + one-hop neighbors.
   * `null` = not a diff graph; `true` = changed-only (default); `false` = show all.
   */
  readonly changedOnly: boolean | null;
}
