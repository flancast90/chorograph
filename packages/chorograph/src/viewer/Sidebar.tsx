/**
 * Sidebar — the map's legend and its controls, in one always-visible column.
 *
 * Every kind that exists in this system is listed with its icon, its count, and a show/hide
 * toggle: the legend *is* the filter, one list to learn instead of two. On big maps a Detail
 * row offers the two ends of the fold spectrum (overview / everything); double-clicking boxes
 * on the canvas covers everything in between. Search shows ranked results that navigate — and
 * unfold — straight to the match.
 */
import { forwardRef } from "react";
import { KindIcon } from "./icons.tsx";
import { EDGE, KIND, SIDEBAR_WIDTH, PANEL_GAP, theme } from "./theme.ts";
import type { EdgeKind, Filters, Graph, Node, NodeKind } from "./types.ts";
import { EDGE_KINDS, NODE_KINDS } from "./types.ts";

interface Props {
  graph: Graph;
  filters: Filters;
  search: string;
  matchCount: number;
  /** Best matches, ranked; clicking one navigates (and unfolds) straight to it. */
  results: readonly Node[];
  /** Whether the map has anything to fold; hides the detail controls on flat maps. */
  foldable: boolean;
  foldedCount: number;
  onSearch: (q: string) => void;
  onNavigate: (id: string) => void;
  onToggleNodeKind: (kind: NodeKind) => void;
  onToggleEdgeKind: (kind: EdgeKind) => void;
  onShowEverything: () => void;
  onFoldAll: () => void;
  onUnfoldAll: () => void;
}

export const Sidebar = forwardRef<HTMLInputElement, Props>(function Sidebar(
  {
    graph,
    filters,
    search,
    matchCount,
    results,
    foldable,
    foldedCount,
    onSearch,
    onNavigate,
    onToggleNodeKind,
    onToggleEdgeKind,
    onShowEverything,
    onFoldAll,
    onUnfoldAll,
  },
  searchRef,
) {
  const nodeKinds = NODE_KINDS.filter((k) => (graph.meta.counts.nodes[k] ?? 0) > 0);
  const edgeKinds = EDGE_KINDS.filter((k) => (graph.meta.counts.edges[k] ?? 0) > 0);
  const anythingHidden = filters.hiddenNodeKinds.size > 0 || filters.hiddenEdgeKinds.size > 0;

  return (
    <aside
      data-ui
      style={{
        position: "absolute",
        top: PANEL_GAP,
        left: PANEL_GAP,
        bottom: PANEL_GAP,
        width: SIDEBAR_WIDTH,
        display: "flex",
        flexDirection: "column",
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        boxShadow: theme.shadow,
        overflow: "auto",
        zIndex: 2,
      }}
    >
      <header style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 650, color: theme.ink }}>{graph.meta.name}</div>
        {graph.meta.description && (
          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: theme.inkMuted, marginTop: 4 }}>
            {graph.meta.description}
          </div>
        )}
        <div style={{ fontFamily: theme.fontMono, fontSize: 10, color: theme.inkFaint, marginTop: 6 }}>
          chorograph · {new Date(graph.meta.generatedAt).toLocaleDateString()}
        </div>
      </header>

      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}` }}>
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search the map…  ( / )"
          spellCheck={false}
          aria-label="Search nodes"
          style={{
            display: "block",
            width: "100%",
            background: theme.canvas,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            color: theme.ink,
            fontFamily: theme.fontSans,
            fontSize: 12.5,
            padding: "7px 9px",
            outline: "none",
          }}
        />
        {search.trim() && (
          <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 6 }}>
            {matchCount === 0 ? "Nothing matches — everything else is dimmed." : `${matchCount} match${matchCount === 1 ? "" : "es"} highlighted.`}
          </div>
        )}
        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 6 }}>
            {results.map((n) => {
              const parent = n.parent ? graph.nodes.find((p) => p.id === n.parent) : null;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onNavigate(n.id)}
                  title={n.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "3px 6px",
                    margin: "0 -6px",
                    background: "transparent",
                    border: "none",
                    borderRadius: theme.radius,
                    fontSize: 12,
                    fontFamily: theme.fontSans,
                    color: theme.ink,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ color: KIND[n.kind].color, display: "inline-flex", flexShrink: 0 }}>
                    <KindIcon kind={n.kind} size={12} />
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</span>
                  {parent && (
                    <span
                      style={{
                        fontSize: 10,
                        color: theme.inkFaint,
                        marginLeft: "auto",
                        flexShrink: 0,
                        maxWidth: 90,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {parent.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {foldable && (
        <>
          <SectionLabel>Detail · double-click a box to unfold it</SectionLabel>
          <div style={{ display: "flex", gap: 6, padding: "0 16px 4px" }}>
            <button
              type="button"
              onClick={onFoldAll}
              aria-pressed={foldedCount > 0}
              style={foldButtonStyle(foldedCount > 0)}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={onUnfoldAll}
              aria-pressed={foldedCount === 0}
              style={foldButtonStyle(foldedCount === 0)}
            >
              Everything
            </button>
          </div>
        </>
      )}

      <SectionLabel>Things · click to show or hide</SectionLabel>
      <div style={{ padding: "0 8px 10px" }}>
        {nodeKinds.map((kind) => {
          const hidden = filters.hiddenNodeKinds.has(kind);
          const k = KIND[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onToggleNodeKind(kind)}
              aria-pressed={!hidden}
              title={hidden ? `Show ${k.label}s` : `Hide ${k.label}s`}
              style={rowStyle(hidden)}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: hidden ? theme.canvas : k.chip,
                  color: hidden ? theme.inkFaint : k.color,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <KindIcon kind={kind} size={14} />
              </span>
              <span style={{ flex: 1, textAlign: "left", textDecoration: hidden ? "line-through" : "none" }}>
                {k.label}
              </span>
              <span style={{ fontFamily: theme.fontMono, fontSize: 10.5, color: theme.inkFaint }}>
                {graph.meta.counts.nodes[kind]}
              </span>
            </button>
          );
        })}
      </div>

      <SectionLabel>Connections · click to show or hide</SectionLabel>
      <div style={{ padding: "0 8px 10px" }}>
        {edgeKinds.map((kind) => {
          const hidden = filters.hiddenEdgeKinds.has(kind);
          const e = EDGE[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onToggleEdgeKind(kind)}
              aria-pressed={!hidden}
              title={hidden ? `Show ${e.label} connections` : `Hide ${e.label} connections`}
              style={rowStyle(hidden)}
            >
              <svg width="22" height="10" aria-hidden="true" style={{ flexShrink: 0 }}>
                <line
                  x1="1"
                  y1="5"
                  x2="21"
                  y2="5"
                  stroke={hidden ? theme.inkFaint : e.color}
                  strokeWidth="1.6"
                  strokeDasharray={e.dash}
                />
              </svg>
              <span style={{ flex: 1, textAlign: "left", textDecoration: hidden ? "line-through" : "none" }}>
                {kind}
              </span>
              <span style={{ fontFamily: theme.fontMono, fontSize: 10.5, color: theme.inkFaint }}>
                {graph.meta.counts.edges[kind]}
              </span>
            </button>
          );
        })}
      </div>

      {anythingHidden && (
        <div style={{ padding: "0 16px 12px" }}>
          <button
            type="button"
            onClick={onShowEverything}
            style={{
              width: "100%",
              padding: "7px 0",
              background: theme.accentSoft,
              color: theme.accent,
              border: "none",
              borderRadius: theme.radius,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Show everything
          </button>
        </div>
      )}

      <footer
        style={{
          marginTop: "auto",
          padding: "10px 16px 12px",
          borderTop: `1px solid ${theme.border}`,
          fontFamily: theme.fontMono,
          fontSize: 10,
          lineHeight: 1.7,
          color: theme.inkFaint,
        }}
      >
        / search · f fit view · esc clear
        <br />
        drag to pan · scroll to zoom
        {foldable && (
          <>
            <br />
            double-click a box to unfold it
          </>
        )}
      </footer>
    </aside>
  );
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 16px 6px",
        fontSize: 10,
        fontWeight: 650,
        color: theme.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
      }}
    >
      {children}
    </div>
  );
}

function foldButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "6px 0",
    background: active ? theme.accentSoft : theme.canvas,
    color: active ? theme.accent : theme.inkMuted,
    border: `1px solid ${active ? "transparent" : theme.border}`,
    borderRadius: theme.radius,
    fontSize: 11.5,
    fontWeight: 600,
    fontFamily: theme.fontSans,
    cursor: "pointer",
  };
}

function rowStyle(hidden: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: "5px 8px",
    background: "transparent",
    border: "none",
    borderRadius: theme.radius,
    color: hidden ? theme.inkFaint : theme.ink,
    fontSize: 12.5,
    fontFamily: theme.fontSans,
    cursor: "pointer",
  };
}
