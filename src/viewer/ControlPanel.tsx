/**
 * Control rail: search, role/comms filters, dead toggle, legend counts.
 * Collapsible — `[` toggles; fit-view subtracts panel width when open.
 *
 * @chorograph group="Viewer" role=component comms=in-proc
 */
import { forwardRef, useMemo } from "react";
import type { GraphIndex } from "./index-graph.ts";
import type { Filters } from "./types.ts";
import { PANEL_INSET, PANEL_WIDTH, roleColor, theme } from "./theme.ts";

interface Props {
  index: GraphIndex;
  filters: Filters;
  search: string;
  matchCount: number;
  visibleCount: number;
  open: boolean;
  onToggleOpen: () => void;
  onSearch: (q: string) => void;
  onToggleRole: (role: string) => void;
  onToggleComms: (comms: string) => void;
  onToggleDead: () => void;
  onToggleChangedOnly: () => void;
  onClearFilters: () => void;
}

export const ControlPanel = forwardRef<HTMLInputElement, Props>(function ControlPanel(
  {
    index,
    filters,
    search,
    matchCount,
    visibleCount,
    open,
    onToggleOpen,
    onSearch,
    onToggleRole,
    onToggleComms,
    onToggleDead,
    onToggleChangedOnly,
    onClearFilters,
  },
  ref,
) {
  const roles = useMemo(
    () => Object.entries(index.graph.meta.roles).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [index],
  );
  const c = index.graph.meta.counts;
  const diff = index.graph.meta.diff;
  const filterOn =
    filters.roles.size > 0 ||
    filters.comms.size > 0 ||
    filters.deadOnly ||
    (filters.changedOnly === false);

  if (!open) {
    return (
      <button
        data-ui
        type="button"
        onClick={onToggleOpen}
        title="Show panel ([)"
        aria-label="Show control panel"
        style={{
          position: "absolute",
          top: PANEL_INSET,
          left: PANEL_INSET,
          zIndex: 2,
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: theme.radius,
          color: theme.textMuted,
          fontFamily: theme.fontMono,
          fontSize: 11,
          padding: "6px 10px",
          cursor: "pointer",
        }}
      >
        ▸ panel
      </button>
    );
  }

  return (
    <aside
      data-ui
      style={{
        position: "absolute",
        top: PANEL_INSET,
        left: PANEL_INSET,
        width: PANEL_WIDTH,
        maxHeight: `calc(100% - ${PANEL_INSET * 2}px)`,
        overflow: "auto",
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        display: "flex",
        flexDirection: "column",
        fontFamily: theme.fontSans,
        color: theme.text,
        zIndex: 2,
      }}
    >
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" }}>chorograph</div>
          {diff ? (
            <>
              <div style={{ fontFamily: theme.fontMono, fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                <span style={{ color: theme.diffAdded }}>+{diff.nodesAdded}</span>
                {" · "}
                <span style={{ color: theme.diffRemoved }}>−{diff.nodesRemoved}</span>
                {" · "}
                <span style={{ color: theme.diffTouched }}>~{diff.nodesTouched}</span>
                {" · "}
                <span style={{ color: theme.diffAdded }}>+{diff.edgesAdded}e</span>
                {" · "}
                <span style={{ color: theme.diffRemoved }}>−{diff.edgesRemoved}e</span>
              </div>
              <div
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 10,
                  color: theme.textFaint,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={`${diff.base}…${diff.head}`}
              >
                {diff.base}…{diff.head}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: theme.fontMono, fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
              {c.regions}r · {c.modules}m · {c.symbols}s · {c.externals}x · {c.edges}e
            </div>
          )}
          <div style={{ fontFamily: theme.fontMono, fontSize: 10, color: theme.textFaint, marginTop: 2 }}>
            {visibleCount} visible
            {search ? ` · ${matchCount} match` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          title="Hide panel ([)"
          aria-label="Hide control panel"
          style={{
            background: "transparent",
            border: "none",
            color: theme.textFaint,
            cursor: "pointer",
            fontFamily: theme.fontMono,
            fontSize: 11,
            padding: "2px 4px",
            lineHeight: 1,
          }}
        >
          ◂
        </button>
      </div>

      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${theme.border}` }}>
        <label style={{ fontSize: 10, color: theme.textFaint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Search
        </label>
        <input
          ref={ref}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="/ to focus"
          spellCheck={false}
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
            background: theme.bg,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            color: theme.text,
            fontFamily: theme.fontMono,
            fontSize: 12,
            padding: "5px 7px",
            outline: "none",
          }}
        />
      </div>

      {diff && (
        <Section title="Diff">
          <button type="button" onClick={onToggleChangedOnly} style={rowBtn(filters.changedOnly === true)}>
            <span style={{ flex: 1, textAlign: "left" }}>
              {filters.changedOnly ? "changed only" : "show all"}
            </span>
            <span style={{ fontFamily: theme.fontMono, color: theme.textFaint }}>
              {filters.changedOnly ? "blast" : "full"}
            </span>
          </button>
          <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 6, lineHeight: 1.4 }}>
            <span style={{ color: theme.diffAdded }}>green</span> added ·{" "}
            <span style={{ color: theme.diffRemoved }}>red</span> removed ·{" "}
            <span style={{ color: theme.diffTouched }}>amber</span> touched
            {filters.changedOnly ? " · +1-hop neighbors" : ""}
          </div>
        </Section>
      )}

      <Section title="Roles">
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {roles.map(([role, count]) => {
            const on = filters.roles.has(role);
            return (
              <button key={role} type="button" onClick={() => onToggleRole(role)} style={rowBtn(on)}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 1,
                    background: roleColor(role),
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>{role}</span>
                <span style={{ fontFamily: theme.fontMono, color: theme.textFaint }}>{count}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Comms">
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {index.allComms.map((comms) => {
            const on = filters.comms.has(comms);
            return (
              <button key={comms} type="button" onClick={() => onToggleComms(comms)} style={rowBtn(on)}>
                <span style={{ flex: 1, textAlign: "left" }}>{comms}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Dead code">
        <button type="button" onClick={onToggleDead} style={rowBtn(filters.deadOnly)}>
          <span style={{ flex: 1, textAlign: "left" }}>orphans & unreachable</span>
          <span style={{ fontFamily: theme.fontMono, color: theme.textFaint }}>
            {index.orphan.size + index.unreachable.size}
          </span>
        </button>
        <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 6, lineHeight: 1.4 }}>
          Dashed = orphan/unreachable · ochre = deprecated ({index.deprecated.size})
        </div>
      </Section>

      {filterOn && (
        <div style={{ padding: "8px 12px 10px" }}>
          <button
            type="button"
            onClick={onClearFilters}
            style={{
              ...rowBtn(false),
              justifyContent: "center",
              color: theme.textMuted,
              border: `1px solid ${theme.border}`,
            }}
          >
            clear filters
          </button>
        </div>
      )}

      <div
        style={{
          padding: "8px 12px 10px",
          borderTop: `1px solid ${theme.border}`,
          fontFamily: theme.fontMono,
          fontSize: 10,
          color: theme.textFaint,
          lineHeight: 1.5,
        }}
      >
        / search · [ panel · ↑↓←→ walk · enter open · f fit · esc clear
      </div>
    </aside>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 12px", borderBottom: `1px solid ${theme.border}` }}>
      <div
        style={{
          fontSize: 10,
          color: theme.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function rowBtn(on: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "4px 6px",
    background: on ? theme.panelRaised : "transparent",
    border: on ? `1px solid ${theme.borderStrong}` : "1px solid transparent",
    borderRadius: theme.radius,
    color: theme.text,
    fontSize: 12,
    cursor: "pointer",
  };
}
