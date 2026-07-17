/**
 * Design tokens for the viewer — a light, paper-like instrument.
 *
 * One deliberate idea: the canvas is a technical drawing. White cards on cool gray paper, 1px ink
 * borders, and colour reserved for the kind chips and edge verbs — so the palette carries meaning,
 * never decoration. Every node kind has exactly one hue and one icon, fixed here.
 */
import type { EdgeKind, NodeKind } from "./types.ts";

export const theme = {
  canvas: "#F2F4F7",
  card: "#FFFFFF",
  cardTint: "#F8FAFC", // children area inside a service / database
  panel: "#FFFFFF",
  border: "#DDE2E9",
  borderStrong: "#B9C1CC",
  ink: "#1B1F26",
  inkMuted: "#5C6572",
  inkFaint: "#98A1AD",
  accent: "#3056C8", // selection / focus
  accentSoft: "#E5EBFB",
  match: "#B8860B",
  shadow: "0 1px 2px rgba(27,31,38,0.06)",
  fontSans: 'ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  fontMono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  radius: 6,
} as const;

export interface KindStyle {
  /** Icon chip + accent colour. */
  readonly color: string;
  /** Soft background for the icon chip. */
  readonly chip: string;
  /** Singular, human label for legend and detail panel. */
  readonly label: string;
}

/** One hue per kind — the whole colour vocabulary of the map. */
export const KIND: Readonly<Record<NodeKind, KindStyle>> = {
  domain: { color: "#5C6572", chip: "#EEF1F5", label: "domain" },
  service: { color: "#3056C8", chip: "#E5EBFB", label: "service" },
  module: { color: "#5B6BA8", chip: "#E9ECF7", label: "module" },
  endpoint: { color: "#0E7A8A", chip: "#E0F1F4", label: "endpoint" },
  function: { color: "#52606D", chip: "#EAEEF2", label: "function" },
  job: { color: "#7A4FC0", chip: "#EFE8FA", label: "job" },
  database: { color: "#1F8A4C", chip: "#E2F3E9", label: "database" },
  table: { color: "#4E9A6B", chip: "#E9F4ED", label: "table" },
  cache: { color: "#C05621", chip: "#FBEBE0", label: "cache" },
  bucket: { color: "#A07C1A", chip: "#F7F0DC", label: "bucket" },
  queue: { color: "#B0447A", chip: "#F8E7F0", label: "queue" },
  event: { color: "#D28A0E", chip: "#FBF0DB", label: "event" },
  external: { color: "#6B7280", chip: "#EEF0F3", label: "external" },
};

export interface EdgeStyle {
  readonly color: string;
  readonly dash?: string;
  /** Sentence fragment for tooltips / detail rows: "orders *reads* orders-db". */
  readonly label: string;
}

export const EDGE: Readonly<Record<EdgeKind, EdgeStyle>> = {
  calls: { color: "#556070", label: "calls" },
  writes: { color: "#1F8A4C", label: "writes" },
  reads: { color: "#1F8A4C", dash: "5 4", label: "reads" },
  emits: { color: "#D28A0E", label: "emits" },
  consumes: { color: "#D28A0E", dash: "5 4", label: "consumed by" },
  uses: { color: "#98A1AD", dash: "2 3", label: "uses" },
};

/** Geometry — shared between measuring (layout) and drawing (canvas). */
export const GEOM = {
  leafHeight: 34,
  leafMinWidth: 120,
  leafMaxWidth: 300,
  headerHeight: 38, // service / database / domain title row
  containerPad: 14,
  iconChip: 20,
  domainLabelGap: 6,
} as const;

/** Estimated width of a leaf card for the given name (icon chip + 12.5px medium text). */
export function leafWidth(name: string): number {
  const text = Math.ceil(name.length * 6.9);
  return Math.max(GEOM.leafMinWidth, Math.min(GEOM.leafMaxWidth, 12 + GEOM.iconChip + 9 + text + 14));
}

/** Minimum width for a container so its header row (icon + name + tech) never collides. */
export function headerWidth(name: string, tech?: string): number {
  const nameW = Math.ceil(name.length * 7.4);
  const techW = tech ? 20 + Math.ceil(tech.length * 6.4) : 0;
  return 10 + GEOM.iconChip + 8 + nameW + techW + 16;
}

export const SIDEBAR_WIDTH = 248;
export const DETAIL_WIDTH = 304;
export const PANEL_GAP = 14;
