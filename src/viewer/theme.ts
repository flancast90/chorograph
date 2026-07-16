/**
 * Semantic design tokens — calm instrument, not dashboard chrome.
 * Palette is fixed and small; role/comms hues map deterministically.
 *
 * @chorograph group="Viewer" role=config comms=in-proc
 */

export const theme = {
  bg: "#0b0d10",
  panel: "#111418",
  panelRaised: "#161a20",
  border: "#252a32",
  borderStrong: "#343a44",
  text: "#e6e7e9",
  textMuted: "#8b919a",
  textFaint: "#5c6370",
  accent: "#7d9cbe",
  warning: "#c4a35a",
  dead: "#6a6e76",
  selection: "#9eb6d4",
  match: "#c4a35a",
  /** Diff overlay — keep within the calm semantic set (no rainbow). */
  diffAdded: "#6a9a7a",
  diffRemoved: "#a07070",
  diffTouched: "#c4a35a",
  nodeFill: "#14181e",
  nodeFillHover: "#1a1f27",
  regionFill: "#0e1116",
  edgeDefault: "#2a3038",
  edgeDim: "#1a1e24",
  fontSans: 'ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  fontMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radius: 4,
  motionMs: 140,
} as const;

/** ≤10 perceptually-spaced hues for roles / comms. Index by stable hash. */
const HUES = [
  "#7d9cbe", // steel blue
  "#8fad8a", // sage
  "#c4a35a", // ochre
  "#b8877d", // clay
  "#9a8fb8", // dusty violet (kept muted, not neon purple)
  "#7aabbc", // teal-gray
  "#b89a7a", // warm sand
  "#8a9aa8", // slate
  "#a89090", // rose-gray
  "#7daba0", // sea-glass
] as const;

const KNOWN_COMMS: Record<string, string> = {
  "in-proc": "#5c6370",
  import: "#5c6370",
  http: "#7d9cbe",
  sse: "#7aabbc",
  sql: "#8fad8a",
  queue: "#b89a7a",
  grpc: "#8a9aa8",
  temporal: "#9a8fb8",
  oauth: "#b8877d",
  llm: "#c4a35a",
  embedding: "#c4a35a",
  s3: "#7daba0",
  smtp: "#a89090",
  mcp: "#9a8fb8",
  cron: "#8a9aa8",
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function roleColor(role: string): string {
  return HUES[hash(role) % HUES.length]!;
}

export function commsColor(comms: string): string {
  return KNOWN_COMMS[comms] ?? HUES[hash(comms) % HUES.length]!;
}

export function edgeStrokeWidth(weight: number): number {
  if (weight <= 1) return 1;
  if (weight <= 3) return 1.5;
  if (weight <= 8) return 2.25;
  if (weight <= 20) return 3;
  return 4;
}

export const NODE_W = {
  region: 220,
  module: 180,
  symbol: 140,
  external: 160,
} as const;

export const NODE_H = {
  regionCollapsed: 44,
  module: 36,
  symbol: 28,
  external: 32,
  header: 28,
  pad: 16,
} as const;

/** Auto-expand top-level containers only when their direct child count is at or below this. */
export const SHALLOW_EXPAND_MAX = 48;

/** Control panel chrome — fit-view subtracts this when the panel is open. */
export const PANEL_WIDTH = 260;
export const PANEL_INSET = 12; // left/top margin around floating panel
export const DETAIL_WIDTH = 300;
/** If the initial frontier is thinner than this, seed-expand large regions (top-N children). */
export const MIN_SEED_VISIBLE = 12;
/** Cap on children shown when seeding a huge collapsed region. */
export const SEED_PREVIEW_CHILDREN = 28;
