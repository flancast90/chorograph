/**
 * SVG canvas — nodes, rolled edges, viewport culling, pan/zoom.
 *
 * @chorograph group="Viewer" role=component comms=in-proc
 */
import { memo, useMemo } from "react";
import type { GraphIndex } from "./index-graph.ts";
import type { Camera } from "./hooks.ts";
import type { Scene } from "./layout.ts";
import type { AbsBox, EdgeDiff, Filters, NodeDiff, RolledEdge } from "./types.ts";
import { commsColor, edgeStrokeWidth, roleColor, theme } from "./theme.ts";

interface Props {
  scene: Scene;
  rolled: readonly RolledEdge[];
  index: GraphIndex;
  camera: Camera;
  view: { width: number; height: number };
  selected: string | null;
  hovered: string | null;
  matches: ReadonlySet<string>;
  filters: Filters;
  connected: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
}

function cullBoxes(boxes: readonly AbsBox[], camera: Camera, view: { width: number; height: number }): AbsBox[] {
  const pad = 80;
  const x0 = (-camera.x) / camera.scale - pad;
  const y0 = (-camera.y) / camera.scale - pad;
  const x1 = (view.width - camera.x) / camera.scale + pad;
  const y1 = (view.height - camera.y) / camera.scale + pad;
  return boxes.filter((b) => b.x + b.width >= x0 && b.x <= x1 && b.y + b.height >= y0 && b.y <= y1);
}

function diffStroke(d: NodeDiff | undefined, fallback: string): string {
  if (d === "added") return theme.diffAdded;
  if (d === "removed") return theme.diffRemoved;
  if (d === "touched") return theme.diffTouched;
  return fallback;
}

function edgeDiffStroke(d: EdgeDiff | undefined, fallback: string): string {
  if (d === "added") return theme.diffAdded;
  if (d === "removed") return theme.diffRemoved;
  return fallback;
}

function NodeRect({
  box,
  index,
  selected,
  hovered,
  matched,
  faded,
  deadStyle,
  onSelect,
  onHover,
  onToggle,
}: {
  box: AbsBox;
  index: GraphIndex;
  selected: boolean;
  hovered: boolean;
  matched: boolean;
  faded: boolean;
  deadStyle: "none" | "orphan" | "deprecated";
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  const n = box.node;
  const isContainer = n.containment === "region" || (n.containment === "module" && box.childCount > 0);
  const role = n.roles[0];
  const accent = n.diff
    ? diffStroke(n.diff, theme.borderStrong)
    : role
      ? roleColor(role)
      : theme.borderStrong;
  const fill = n.containment === "region" ? theme.regionFill : theme.nodeFill;
  const baseStroke = selected ? theme.selection : hovered ? theme.accent : matched ? theme.match : theme.border;
  const stroke = n.diff && !selected ? diffStroke(n.diff, baseStroke) : baseStroke;
  const strokeW = selected || hovered || n.diff === "touched" ? 1.5 : n.diff ? 1.35 : 1;
  const dash = n.diff === "removed" ? "5 3" : deadStyle === "orphan" ? "4 3" : undefined;
  let opacity = faded ? 0.22 : deadStyle === "orphan" ? 0.65 : 1;
  if (n.diff === "removed") opacity = Math.min(opacity, 0.55);
  const label = n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label;
  const sub =
    n.diff
      ? n.diff
      : n.containment === "region"
        ? `${box.childCount} · ${index.descendantCount(n.id)} ↓`
        : n.roles.filter((r) => r !== "module").slice(0, 2).join(" · ") || n.containment;

  return (
    <g
      data-node
      transform={`translate(${box.x},${box.y})`}
      opacity={opacity}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(n.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isContainer) onToggle(n.id);
      }}
    >
      <rect
        width={box.width}
        height={box.height}
        rx={theme.radius}
        fill={fill}
        stroke={deadStyle === "deprecated" && !n.diff ? theme.warning : stroke}
        strokeWidth={strokeW}
        strokeDasharray={dash}
      />
      <rect x={0} y={0} width={3} height={box.height} fill={deadStyle === "deprecated" && !n.diff ? theme.warning : accent} rx={1} />
      {isContainer && (
        <text
          x={10}
          y={18}
          fill={theme.textMuted}
          fontFamily={theme.fontMono}
          fontSize={11}
          style={{ userSelect: "none" }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(n.id);
          }}
        >
          {box.expanded ? "▾" : "▸"}
        </text>
      )}
      <text
        x={isContainer ? 24 : 12}
        y={n.containment === "region" && box.expanded ? 18 : box.height / 2 + 4}
        fill={theme.text}
        fontFamily={theme.fontSans}
        fontSize={n.containment === "symbol" ? 11 : 12}
        fontWeight={n.containment === "region" ? 600 : 500}
        style={{ userSelect: "none" }}
      >
        {label}
      </text>
      {!(n.containment === "region" && box.expanded) && (
        <text
          x={box.width - 10}
          y={box.height / 2 + 4}
          textAnchor="end"
          fill={n.diff ? diffStroke(n.diff, theme.textFaint) : theme.textFaint}
          fontFamily={theme.fontMono}
          fontSize={10}
          style={{ userSelect: "none" }}
        >
          {sub}
        </text>
      )}
      {n.containment === "region" && box.expanded && (
        <text x={24} y={box.height - 8} fill={theme.textFaint} fontFamily={theme.fontMono} fontSize={10}>
          {n.group ?? n.label}
        </text>
      )}
    </g>
  );
}

function Edges({
  rolled,
  scene,
  selected,
  hovered,
  connected,
}: {
  rolled: readonly RolledEdge[];
  scene: Scene;
  selected: string | null;
  hovered: string | null;
  connected: ReadonlySet<string>;
}) {
  const focus = selected ?? hovered;
  return (
    <g>
      {rolled.map((e) => {
        const d = scene.edgePaths.get(e.id);
        if (!d) return null;
        const lit = focus ? e.from === focus || e.to === focus || connected.has(e.id) : false;
        const dim = focus ? !lit : false;
        const base = dim ? theme.edgeDim : lit ? commsColor(e.comms) : theme.edgeDefault;
        const stroke = edgeDiffStroke(e.diff, base);
        const w = edgeStrokeWidth(e.weight) * (lit ? 1.35 : e.diff ? 1.2 : 1);
        const opacity = dim ? 0.25 : e.diff === "removed" ? 0.45 : lit ? 1 : e.diff ? 0.85 : 0.7;
        return (
          <path
            key={e.id}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={w}
            opacity={opacity}
            strokeDasharray={e.diff === "removed" ? "5 3" : undefined}
            markerEnd={dim ? "url(#arrow-dim)" : lit ? "url(#arrow-lit)" : e.diff === "added" ? "url(#arrow-added)" : e.diff === "removed" ? "url(#arrow-removed)" : "url(#arrow)"}
            style={{ pointerEvents: "none" }}
          />
        );
      })}
    </g>
  );
}

export const Canvas = memo(function Canvas({
  scene,
  rolled,
  index,
  camera,
  view,
  selected,
  hovered,
  matches,
  filters,
  connected,
  onSelect,
  onHover,
  onToggle,
}: Props) {
  const visibleBoxes = useMemo(() => cullBoxes(scene.boxes, camera, view), [scene.boxes, camera, view]);

  const drawBoxes = useMemo(() => {
    const ids = new Set(visibleBoxes.map((b) => b.id));
    const extra: AbsBox[] = [];
    for (const id of [selected, hovered]) {
      if (id && !ids.has(id)) {
        const b = scene.byId.get(id);
        if (b) extra.push(b);
      }
    }
    return extra.length ? [...visibleBoxes, ...extra] : visibleBoxes;
  }, [visibleBoxes, selected, hovered, scene.byId]);

  const filterActive = filters.roles.size > 0 || filters.comms.size > 0 || filters.deadOnly;
  const showAllDiff = filters.changedOnly === false;

  return (
    <svg width="100%" height="100%" style={{ display: "block", background: theme.bg }}>
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={theme.edgeDefault} />
        </marker>
        <marker id="arrow-dim" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={theme.edgeDim} />
        </marker>
        <marker id="arrow-lit" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={theme.accent} />
        </marker>
        <marker id="arrow-added" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={theme.diffAdded} />
        </marker>
        <marker id="arrow-removed" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={theme.diffRemoved} />
        </marker>
      </defs>
      <g transform={`translate(${camera.x},${camera.y}) scale(${camera.scale})`}>
        <Edges rolled={rolled} scene={scene} selected={selected} hovered={hovered} connected={connected} />
        {drawBoxes.map((box) => {
          const deadStyle =
            index.deprecated.has(box.id) || box.node.status === "deprecated"
              ? "deprecated"
              : index.orphan.has(box.id) || index.unreachable.has(box.id)
                ? "orphan"
                : "none";
          const faded =
            (showAllDiff && !box.node.diff) ||
            (filterActive && !index.subtreeMatches(box.id, filters));
          return (
            <NodeRect
              key={box.id}
              box={box}
              index={index}
              selected={selected === box.id}
              hovered={hovered === box.id}
              matched={matches.has(box.id)}
              faded={faded}
              deadStyle={deadStyle}
              onSelect={onSelect}
              onHover={onHover}
              onToggle={onToggle}
            />
          );
        })}
      </g>
    </svg>
  );
});
