/**
 * One hand-drawn-feeling line icon per node kind, in a shared 16×16 grid.
 *
 * Icons are stroke-only (1.5px, round caps) so they read at small sizes and inherit colour from
 * the kind palette. Rendered both on canvas cards and in the sidebar legend, so the mapping
 * kind → shape is learned once and works everywhere.
 */
import type { NodeKind } from "./types.ts";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const PATHS: Record<NodeKind, React.ReactNode> = {
  // Bounded frame with a name tab — a region on the drawing.
  domain: (
    <>
      <rect x="2" y="4" width="12" height="9.5" rx="1.5" {...STROKE} />
      <path d="M2 7 H8" {...STROKE} />
    </>
  ),
  // Isometric cube — a deployable box.
  service: (
    <>
      <path d="M8 1.8 L13.6 4.8 V11.2 L8 14.2 L2.4 11.2 V4.8 Z" {...STROKE} />
      <path d="M2.4 4.8 L8 7.8 L13.6 4.8 M8 7.8 V14.2" {...STROKE} />
    </>
  ),
  // Plug — the socket a caller connects to.
  endpoint: (
    <>
      <path d="M5.5 1.5 V5 M10.5 1.5 V5" {...STROKE} />
      <path d="M3.5 5 H12.5 V8 A4.5 4.5 0 0 1 8 12.5 A4.5 4.5 0 0 1 3.5 8 Z" {...STROKE} />
      <path d="M8 12.5 V14.5" {...STROKE} />
    </>
  ),
  // Open package — code grouped in a box, lid ajar: not deployable, just organized.
  module: (
    <>
      <rect x="2.5" y="5.5" width="11" height="8.5" rx="1" {...STROKE} />
      <path d="M2.5 5.5 L4 2.5 H12 L13.5 5.5" {...STROKE} />
      <path d="M6.5 8.5 H9.5" {...STROKE} />
    </>
  ),
  // ƒ — a function worth naming on the map.
  function: (
    <text
      x="8"
      y="12.5"
      textAnchor="middle"
      fontSize="13"
      fontStyle="italic"
      fontFamily="Georgia, 'Times New Roman', serif"
      fill="currentColor"
    >
      ƒ
    </text>
  ),
  // Clock — scheduled work.
  job: (
    <>
      <circle cx="8" cy="8" r="6" {...STROKE} />
      <path d="M8 4.5 V8 L10.8 9.6" {...STROKE} />
    </>
  ),
  // Cylinder.
  database: (
    <>
      <ellipse cx="8" cy="3.6" rx="5.4" ry="2.1" {...STROKE} />
      <path d="M2.6 3.6 V12.4 A5.4 2.1 0 0 0 13.4 12.4 V3.6" {...STROKE} />
      <path d="M2.6 8 A5.4 2.1 0 0 0 13.4 8" {...STROKE} />
    </>
  ),
  // Grid.
  table: (
    <>
      <rect x="2.2" y="3" width="11.6" height="10" rx="1" {...STROKE} />
      <path d="M2.2 6.4 H13.8 M7 6.4 V13" {...STROKE} />
    </>
  ),
  // Stacked slabs — a hot layer.
  cache: (
    <>
      <path d="M8 2.2 L14 5 L8 7.8 L2 5 Z" {...STROKE} />
      <path d="M2 8.2 L8 11 L14 8.2" {...STROKE} />
      <path d="M2 11.2 L8 14 L14 11.2" {...STROKE} />
    </>
  ),
  // Bucket.
  bucket: (
    <>
      <path d="M2.8 5 L4.4 13.2 A1.6 1.6 0 0 0 6 14.4 H10 A1.6 1.6 0 0 0 11.6 13.2 L13.2 5" {...STROKE} />
      <ellipse cx="8" cy="4.6" rx="5.2" ry="1.9" {...STROKE} />
    </>
  ),
  // Ordered bars flowing right.
  queue: (
    <>
      <path d="M2 4.5 H10 M2 8 H10 M2 11.5 H10" {...STROKE} />
      <path d="M12 5.5 L14.5 8 L12 10.5" {...STROKE} />
    </>
  ),
  // Bolt.
  event: <path d="M9 1.5 L3.5 9 H7.5 L7 14.5 L12.5 7 H8.5 Z" {...STROKE} />,
  // Globe.
  external: (
    <>
      <circle cx="8" cy="8" r="6" {...STROKE} />
      <path d="M2 8 H14 M8 2 A9.5 9.5 0 0 1 8 14 A9.5 9.5 0 0 1 8 2" {...STROKE} />
    </>
  ),
};

export function KindIcon({ kind, size = 16 }: { kind: NodeKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
      {PATHS[kind]}
    </svg>
  );
}
