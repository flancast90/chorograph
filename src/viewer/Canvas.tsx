/**
 * SVG canvas — draws the laid-out scene.
 *
 * Three visual layers, in paint order: domain frames (thin outlines that group without shouting),
 * container cards (services and databases with a header row and a tinted child area), and leaf
 * cards (icon chip + name). Edges sit between frames and cards so lines never cross text.
 * Hovering or selecting a node lights its edges and fades the rest; nothing else moves.
 */
import { Fragment, memo } from "react";
import { KindIcon } from "./icons.tsx";
import { EDGE, GEOM, KIND, theme } from "./theme.ts";
import type { Camera } from "./hooks.ts";
import type { EdgeKind, PlacedEdge, PlacedNode, Scene } from "./types.ts";
import { EDGE_KINDS } from "./types.ts";

interface Props {
  scene: Scene;
  camera: Camera;
  selected: string | null;
  hovered: string | null;
  /** Node ids matching the current search; empty set = no search active. */
  matches: ReadonlySet<string>;
  searchActive: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

/** Polyline → SVG path with rounded elbows. */
function roundedPath(points: readonly { x: number; y: number }[], r = 7): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    if (rr < 1) {
      d += ` L ${p.x} ${p.y}`;
      continue;
    }
    const inX = p.x - ((p.x - prev.x) / inLen) * rr;
    const inY = p.y - ((p.y - prev.y) / inLen) * rr;
    const outX = p.x + ((next.x - p.x) / outLen) * rr;
    const outY = p.y + ((next.y - p.y) / outLen) * rr;
    d += ` L ${inX} ${inY} Q ${p.x} ${p.y} ${outX} ${outY}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function midpoint(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  const mid = points[Math.floor(points.length / 2)]!;
  const prev = points[Math.floor(points.length / 2) - 1] ?? mid;
  return { x: (mid.x + prev.x) / 2, y: (mid.y + prev.y) / 2 };
}

function EdgeLine({ pe, lit, dim }: { pe: PlacedEdge; lit: boolean; dim: boolean }) {
  const style = EDGE[pe.edge.kind];
  const d = roundedPath(pe.points);
  const label = pe.edge.label ? `${style.label} · ${pe.edge.label}` : style.label;
  const mid = lit ? midpoint(pe.points) : null;
  return (
    <g opacity={dim ? 0.14 : lit ? 1 : 0.75}>
      <path
        d={d}
        fill="none"
        stroke={style.color}
        strokeWidth={lit ? 2 : 1.4}
        strokeDasharray={style.dash}
        markerEnd={`url(#arrow-${pe.edge.kind})`}
      />
      {mid && (
        <g transform={`translate(${mid.x},${mid.y})`} pointerEvents="none">
          <rect
            x={-label.length * 3.1 - 6}
            y={-9}
            width={label.length * 6.2 + 12}
            height={18}
            rx={9}
            fill={theme.card}
            stroke={style.color}
            strokeWidth={1}
          />
          <text textAnchor="middle" y={3.5} fontSize={10.5} fontFamily={theme.fontMono} fill={style.color}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function DomainFrame({ p, selected, onSelect, onHover }: NodeProps) {
  const k = KIND.domain;
  return (
    <g
      data-node
      transform={`translate(${p.x},${p.y})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p.id);
      }}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer" }}
    >
      <rect
        width={p.width}
        height={p.height}
        rx={theme.radius + 2}
        fill="transparent"
        stroke={selected ? theme.accent : theme.borderStrong}
        strokeWidth={selected ? 1.6 : 1}
        strokeDasharray="7 5"
      />
      <g transform={`translate(12, ${(GEOM.headerHeight - 16) / 2 + 2})`} color={k.color}>
        <KindIcon kind="domain" size={15} />
      </g>
      <text
        x={33}
        y={GEOM.headerHeight / 2 + 6}
        fontSize={12}
        fontWeight={650}
        letterSpacing="0.05em"
        fill={theme.inkMuted}
        fontFamily={theme.fontSans}
        style={{ userSelect: "none", textTransform: "uppercase" }}
      >
        {p.node.name}
      </text>
    </g>
  );
}

interface NodeProps {
  p: PlacedNode;
  selected: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function ContainerCard({ p, selected, hovered, faded, onSelect, onHover }: NodeProps) {
  const k = KIND[p.node.kind];
  const stroke = selected ? theme.accent : hovered ? theme.borderStrong : theme.border;
  return (
    <g
      data-node
      transform={`translate(${p.x},${p.y})`}
      opacity={faded ? 0.35 : 1}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p.id);
      }}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer" }}
    >
      <rect width={p.width} height={p.height} rx={theme.radius} fill={theme.card} stroke={stroke} strokeWidth={selected ? 1.6 : 1} />
      <rect
        x={1}
        y={GEOM.headerHeight}
        width={p.width - 2}
        height={p.height - GEOM.headerHeight - 1}
        fill={theme.cardTint}
        rx={theme.radius - 2}
      />
      <line x1={0} y1={GEOM.headerHeight} x2={p.width} y2={GEOM.headerHeight} stroke={theme.border} strokeWidth={1} />
      <g transform={`translate(10, ${(GEOM.headerHeight - GEOM.iconChip) / 2})`}>
        <rect width={GEOM.iconChip} height={GEOM.iconChip} rx={5} fill={k.chip} />
        <g transform="translate(2.5, 2.5)" color={k.color}>
          <KindIcon kind={p.node.kind} size={15} />
        </g>
      </g>
      <text
        x={10 + GEOM.iconChip + 8}
        y={GEOM.headerHeight / 2 + 4.5}
        fontSize={12.5}
        fontWeight={600}
        fill={theme.ink}
        fontFamily={theme.fontSans}
        style={{ userSelect: "none" }}
      >
        {p.node.name}
      </text>
      {p.node.tech && (
        <text
          x={p.width - 10}
          y={GEOM.headerHeight / 2 + 4}
          textAnchor="end"
          fontSize={10}
          fill={theme.inkFaint}
          fontFamily={theme.fontMono}
          style={{ userSelect: "none" }}
        >
          {p.node.tech}
        </text>
      )}
    </g>
  );
}

function LeafCard({ p, selected, hovered, faded, onSelect, onHover }: NodeProps) {
  const k = KIND[p.node.kind];
  const stroke = selected ? theme.accent : hovered ? k.color : theme.border;
  return (
    <g
      data-node
      transform={`translate(${p.x},${p.y})`}
      opacity={faded ? 0.35 : 1}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p.id);
      }}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer" }}
    >
      <rect width={p.width} height={p.height} rx={theme.radius} fill={theme.card} stroke={stroke} strokeWidth={selected ? 1.6 : 1} />
      <g transform={`translate(8, ${(p.height - GEOM.iconChip) / 2})`}>
        <rect width={GEOM.iconChip} height={GEOM.iconChip} rx={5} fill={k.chip} />
        <g transform="translate(2.5, 2.5)" color={k.color}>
          <KindIcon kind={p.node.kind} size={15} />
        </g>
      </g>
      <text
        x={8 + GEOM.iconChip + 9}
        y={p.height / 2 + 4.5}
        fontSize={12.5}
        fontWeight={520}
        fill={theme.ink}
        fontFamily={theme.fontSans}
        style={{ userSelect: "none" }}
      >
        {p.node.name}
      </text>
    </g>
  );
}

export const Canvas = memo(function Canvas({ scene, camera, selected, hovered, matches, searchActive, onSelect, onHover }: Props) {
  const focus = hovered ?? selected;

  const isLit = (pe: PlacedEdge): boolean => {
    if (!focus) return false;
    return pe.edge.from === focus || pe.edge.to === focus;
  };

  const frames = scene.placed.filter((p) => p.node.kind === "domain");
  const containers = scene.placed.filter((p) => p.node.kind !== "domain" && p.isContainer);
  const leaves = scene.placed.filter((p) => p.node.kind !== "domain" && !p.isContainer);

  const nodeFaded = (p: PlacedNode): boolean => (searchActive ? !matches.has(p.id) : false);

  const common = { onSelect, onHover };
  const litEdges = scene.edges.filter(isLit);
  const restEdges = scene.edges.filter((pe) => !isLit(pe));

  return (
    <svg width="100%" height="100%" style={{ display: "block", background: theme.canvas }}>
      <defs>
        {EDGE_KINDS.map((kind: EdgeKind) => (
          <marker
            key={kind}
            id={`arrow-${kind}`}
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="3.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill={EDGE[kind].color} />
          </marker>
        ))}
        <pattern id="dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#DFE4EA" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dotgrid)" />
      <g transform={`translate(${camera.x},${camera.y}) scale(${camera.scale})`}>
        {frames.map((p) => (
          <DomainFrame key={p.id} p={p} selected={selected === p.id} hovered={hovered === p.id} faded={false} {...common} />
        ))}
        {containers.map((p) => (
          <ContainerCard key={p.id} p={p} selected={selected === p.id} hovered={hovered === p.id} faded={nodeFaded(p)} {...common} />
        ))}
        {restEdges.map((pe) => (
          <EdgeLine key={pe.edge.id} pe={pe} lit={false} dim={focus !== null} />
        ))}
        {leaves.map((p) => (
          <LeafCard key={p.id} p={p} selected={selected === p.id} hovered={hovered === p.id} faded={nodeFaded(p)} {...common} />
        ))}
        {litEdges.map((pe) => (
          <Fragment key={pe.edge.id}>
            <EdgeLine pe={pe} lit dim={false} />
          </Fragment>
        ))}
      </g>
    </svg>
  );
});
