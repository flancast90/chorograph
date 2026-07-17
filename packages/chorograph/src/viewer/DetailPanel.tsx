/**
 * Detail panel — everything the map knows about the selected node, written as sentences.
 *
 * Connections are listed in both directions with their verb (“reads → orders-db”, “← called by
 * gateway”), and every named node navigates on click, so the panel doubles as a way to walk the
 * graph without hunting on the canvas.
 *
 * `HoverCard` is the panel's lightweight sibling: hovering a node pops a read-only preview in
 * the same right-hand slot, because long doc-comment prose can't fit on the canvas itself.
 */
import { KindIcon } from "./icons.tsx";
import { DETAIL_WIDTH, EDGE, KIND, PANEL_GAP, theme } from "./theme.ts";
import type { Edge, Graph, Node } from "./types.ts";

interface Props {
  graph: Graph;
  selected: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
}

/**
 * Hover preview — name, kind, and the full doc-comment description, in the detail panel's slot.
 * Hidden while a node is pinned (the panel owns the slot then). `pointerEvents: none` so the
 * card can never steal the hover that opened it.
 */
export function HoverCard({ graph, hovered }: { graph: Graph; hovered: string | null }) {
  if (!hovered) return null;
  const node = graph.nodes.find((n) => n.id === hovered);
  if (!node) return null;
  const k = KIND[node.kind];

  return (
    <aside
      data-ui
      style={{
        position: "absolute",
        top: PANEL_GAP,
        right: PANEL_GAP,
        width: DETAIL_WIDTH,
        maxHeight: `calc(100% - ${PANEL_GAP * 2}px)`,
        overflow: "hidden",
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        boxShadow: theme.shadow,
        zIndex: 2,
        fontFamily: theme.fontSans,
        color: theme.ink,
        pointerEvents: "none",
      }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px" }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: k.chip,
            color: k.color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <KindIcon kind={node.kind} size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650, wordBreak: "break-word" }}>{node.name}</div>
          <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 1 }}>
            {k.label}
            {node.tech ? ` · ${node.tech}` : ""}
          </div>
        </div>
      </header>
      {node.description && (
        <p
          style={{
            margin: 0,
            padding: "0 14px 12px",
            fontSize: 12,
            lineHeight: 1.55,
            color: theme.inkMuted,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 8,
            overflow: "hidden",
          }}
        >
          {node.description}
        </p>
      )}
      <div
        style={{
          padding: "8px 14px",
          borderTop: `1px solid ${theme.border}`,
          fontFamily: theme.fontMono,
          fontSize: 10,
          color: theme.inkFaint,
        }}
      >
        click to pin details
      </div>
    </aside>
  );
}

export function DetailPanel({ graph, selected, onNavigate, onClose }: Props) {
  if (!selected) return null;
  const node = graph.nodes.find((n) => n.id === selected);
  if (!node) return null;

  const k = KIND[node.kind];
  const parent = node.parent ? graph.nodes.find((n) => n.id === node.parent) : null;
  const children = graph.nodes.filter((n) => n.parent === node.id);
  const outbound = graph.edges.filter((e) => e.from === node.id);
  const inbound = graph.edges.filter((e) => e.to === node.id);

  return (
    <aside
      data-ui
      style={{
        position: "absolute",
        top: PANEL_GAP,
        right: PANEL_GAP,
        width: DETAIL_WIDTH,
        maxHeight: `calc(100% - ${PANEL_GAP * 2}px)`,
        overflow: "auto",
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        boxShadow: theme.shadow,
        zIndex: 2,
        fontFamily: theme.fontSans,
        color: theme.ink,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "14px 16px",
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: k.chip,
            color: k.color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <KindIcon kind={node.kind} size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 650, wordBreak: "break-word" }}>{node.name}</div>
          <div style={{ fontSize: 11.5, color: theme.inkMuted, marginTop: 2 }}>
            {k.label}
            {node.tech ? ` · ${node.tech}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          style={{
            background: "transparent",
            border: "none",
            color: theme.inkFaint,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </header>

      {node.description && (
        <p style={{ margin: 0, padding: "12px 16px 0", fontSize: 12.5, lineHeight: 1.55, color: theme.inkMuted }}>
          {node.description}
        </p>
      )}

      {node.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 16px 0" }}>
          {node.tags.map((t) => (
            <span
              key={t}
              style={{
                fontFamily: theme.fontMono,
                fontSize: 10.5,
                color: theme.inkMuted,
                background: theme.canvas,
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {parent && (
        <Section label="Lives in">
          <NodeLink node={parent} onNavigate={onNavigate} />
        </Section>
      )}

      {children.length > 0 && (
        <Section label={`Contains · ${children.length}`}>
          {children.map((c) => (
            <NodeLink key={c.id} node={c} onNavigate={onNavigate} />
          ))}
        </Section>
      )}

      {outbound.length > 0 && (
        <Section label={`Outgoing · ${outbound.length}`}>
          {outbound.map((e) => (
            <EdgeRow key={e.id} edge={e} otherId={e.to} direction="out" graph={graph} onNavigate={onNavigate} />
          ))}
        </Section>
      )}

      {inbound.length > 0 && (
        <Section label={`Incoming · ${inbound.length}`}>
          {inbound.map((e) => (
            <EdgeRow key={e.id} edge={e} otherId={e.from} direction="in" graph={graph} onNavigate={onNavigate} />
          ))}
        </Section>
      )}

      <div
        style={{
          padding: "10px 16px 14px",
          fontFamily: theme.fontMono,
          fontSize: 10,
          color: theme.inkFaint,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {node.file && (
          <span style={{ wordBreak: "break-all" }}>
            {node.file}
            {node.line !== undefined ? `:${node.line}` : ""}
          </span>
        )}
        <span>{node.id}</span>
      </div>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 16px 0" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 650,
          color: theme.inkFaint,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </div>
  );
}

function NodeLink({ node, onNavigate }: { node: Node; onNavigate: (id: string) => void }) {
  const k = KIND[node.kind];
  return (
    <button
      type="button"
      onClick={() => onNavigate(node.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        border: "none",
        borderRadius: theme.radius,
        padding: "4px 6px",
        margin: "0 -6px",
        cursor: "pointer",
        fontSize: 12.5,
        fontFamily: theme.fontSans,
        color: theme.ink,
        textAlign: "left",
      }}
    >
      <span style={{ color: k.color, display: "inline-flex", flexShrink: 0 }}>
        <KindIcon kind={node.kind} size={13} />
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      <span style={{ fontSize: 10.5, color: theme.inkFaint, marginLeft: "auto" }}>{k.label}</span>
    </button>
  );
}

function EdgeRow({
  edge,
  otherId,
  direction,
  graph,
  onNavigate,
}: {
  edge: Edge;
  otherId: string;
  direction: "in" | "out";
  graph: Graph;
  onNavigate: (id: string) => void;
}) {
  const other = graph.nodes.find((n) => n.id === otherId);
  const e = EDGE[edge.kind];
  return (
    <button
      type="button"
      onClick={() => other && onNavigate(other.id)}
      style={{
        display: "block",
        width: "calc(100% + 12px)",
        background: "transparent",
        border: "none",
        borderRadius: theme.radius,
        padding: "4px 6px",
        margin: "0 -6px",
        cursor: "pointer",
        fontSize: 12.5,
        fontFamily: theme.fontSans,
        color: theme.ink,
        textAlign: "left",
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: theme.fontMono, fontSize: 10.5, color: e.color, minWidth: 66, flexShrink: 0 }}>
          {direction === "out" ? `${edge.kind} →` : `← ${edge.kind}`}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {other?.name ?? otherId}
        </span>
      </span>
      {/* The label is the annotation's "why" — give it its own wrapped line, never truncate it. */}
      {edge.label && (
        <span
          style={{
            display: "block",
            fontSize: 10.5,
            lineHeight: 1.5,
            color: theme.inkFaint,
            paddingLeft: 74,
            wordBreak: "break-word",
          }}
        >
          {edge.label}
        </span>
      )}
    </button>
  );
}
