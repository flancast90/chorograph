/**
 * Viewer app shell — expansion, filters, search, layout, keyboard.
 *
 * @chorograph group="Viewer" role=component comms=in-proc
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./Canvas.tsx";
import { ControlPanel } from "./ControlPanel.tsx";
import { DetailPanel } from "./DetailPanel.tsx";
import { useCamera, useKeyboard, type ViewInsets } from "./hooks.ts";
import {
  buildIndex,
  expandToReveal,
  searchNodes,
  seedExpanded,
  visibleFrontier,
} from "./index-graph.ts";
import { buildScene, type Scene } from "./layout.ts";
import { rollupEdges } from "./rollup.ts";
import { DETAIL_WIDTH, PANEL_INSET, PANEL_WIDTH, SHALLOW_EXPAND_MAX, theme } from "./theme.ts";
import type { Filters, Graph, RolledEdge } from "./types.ts";

const emptyFilters: Filters = { roles: new Set(), comms: new Set(), deadOnly: false };

export function App({ graph }: { graph: Graph }) {
  const index = useMemo(() => buildIndex(graph), [graph]);
  const seeded = useMemo(() => seedExpanded(index), [index]);
  const [expanded, setExpanded] = useState(() => seeded.expanded);
  const [childCaps, setChildCaps] = useState(() => seeded.childCaps);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [scene, setScene] = useState<Scene | null>(null);
  const [rolled, setRolled] = useState<RolledEdge[]>([]);
  const [layouting, setLayouting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 1200, height: 800 });
  const { camera, onWheel, onPointerDown, onPointerMove, onPointerUp, fit, focusBox } = useCamera();
  const fittedOnce = useRef(false);
  const layoutGen = useRef(0);

  const insets: ViewInsets = useMemo(
    () => ({
      left: panelOpen ? PANEL_INSET + PANEL_WIDTH + PANEL_INSET : PANEL_INSET + 40,
      right: selected ? PANEL_INSET + DETAIL_WIDTH + PANEL_INSET : PANEL_INSET,
      top: PANEL_INSET,
      bottom: PANEL_INSET,
    }),
    [panelOpen, selected],
  );

  const visible = useMemo(
    () => visibleFrontier(index, expanded, filters, childCaps),
    [index, expanded, filters, childCaps],
  );

  const matches = useMemo(() => {
    if (!search.trim()) return [] as ReturnType<typeof searchNodes>;
    return searchNodes(index, search);
  }, [index, search]);
  const matchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);

  // Auto-expand to reveal search hits.
  useEffect(() => {
    if (!search.trim() || matches.length === 0) return;
    setExpanded((prev) => expandToReveal(index, matches.map((m) => m.id), prev));
  }, [search, matches, index]);

  // Rebuild scene when frontier changes.
  useEffect(() => {
    const gen = ++layoutGen.current;
    setLayouting(true);
    const vis = visibleFrontier(index, expanded, filters, childCaps);
    const rolledNow = rollupEdges(index, vis);
    void buildScene(index, expanded, vis, rolledNow).then((s) => {
      if (gen !== layoutGen.current) return;
      setRolled(rolledNow);
      setScene(s);
      setLayouting(false);
    });
  }, [index, expanded, filters, childCaps]);

  // Measure viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setView({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    setView({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitScene = useCallback(() => {
    if (!scene) return;
    fit({ width: scene.width, height: scene.height }, view, insets);
  }, [scene, fit, view, insets]);

  // Fit once after first scene.
  useEffect(() => {
    if (!scene || fittedOnce.current) return;
    fittedOnce.current = true;
    fit({ width: scene.width, height: scene.height }, view, insets);
  }, [scene, fit, view, insets]);

  // Re-frame when panel chrome toggles (after initial fit).
  const prevPanel = useRef(panelOpen);
  useEffect(() => {
    if (!fittedOnce.current || !scene) return;
    if (prevPanel.current === panelOpen) return;
    prevPanel.current = panelOpen;
    fit({ width: scene.width, height: scene.height }, view, insets);
  }, [panelOpen, scene, fit, view, insets]);

  const connected = useMemo(() => {
    const focus = selected ?? hovered;
    const set = new Set<string>();
    if (!focus) return set;
    for (const e of rolled) {
      if (e.from === focus || e.to === focus) set.add(e.id);
    }
    return set;
  }, [rolled, selected, hovered]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Manual expand lifts the seed preview cap so the user can drill the full set.
    setChildCaps((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const pendingFocus = useRef<string | null>(null);

  const navigateTo = useCallback(
    (id: string) => {
      pendingFocus.current = id;
      setExpanded((prev) => expandToReveal(index, [id], prev));
      setSelected(id);
      const box = scene?.byId.get(id);
      if (box) focusBox(box, view, insets);
    },
    [index, scene, focusBox, view, insets],
  );

  // After expand-to-reveal finishes laying out, focus the pending node once.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id || !scene) return;
    const box = scene.byId.get(id);
    if (box) {
      focusBox(box, view, insets);
      pendingFocus.current = null;
    }
  }, [scene, focusBox, view, insets]);

  const walkables = useMemo(() => {
    if (!scene) return [] as string[];
    return scene.boxes
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((b) => b.id);
  }, [scene]);

  useKeyboard({
    onSearch: () => {
      if (!panelOpen) setPanelOpen(true);
      // Focus after panel mounts.
      requestAnimationFrame(() => searchRef.current?.focus());
    },
    onFit: fitScene,
    onTogglePanel: () => setPanelOpen((o) => !o),
    onEscape: () => {
      if (document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        setSearch("");
        return;
      }
      setSelected(null);
      setFilters(emptyFilters);
    },
    onArrow: (dir) => {
      if (walkables.length === 0) return;
      const cur = selected ? walkables.indexOf(selected) : -1;
      let next = cur;
      if (dir === "down" || dir === "right") next = Math.min(walkables.length - 1, cur + 1);
      else next = Math.max(0, cur < 0 ? 0 : cur - 1);
      const id = walkables[next];
      if (id) setSelected(id);
    },
    onEnter: () => {
      if (!selected) return;
      const kids = index.children.get(selected);
      if (kids && kids.length > 0) toggleExpand(selected);
    },
  });

  const toggleRole = (role: string) => {
    setFilters((f) => {
      const roles = new Set(f.roles);
      if (roles.has(role)) roles.delete(role);
      else roles.add(role);
      if (roles.has(role)) {
        const ids = index.graph.nodes.filter((n) => n.roles.includes(role)).map((n) => n.id);
        setExpanded((prev) => {
          let next = expandToReveal(index, ids.slice(0, 80), prev);
          for (const id of ids.slice(0, 20)) {
            for (const a of index.ancestors(id)) {
              const kids = index.children.get(a)?.length ?? 0;
              if (kids > SHALLOW_EXPAND_MAX) next.add(a);
            }
          }
          return next;
        });
        // Drop seed caps on huge ancestors so filter pruning owns the frontier.
        setChildCaps((prev) => {
          if (prev.size === 0) return prev;
          const next = new Map(prev);
          for (const id of ids.slice(0, 20)) {
            for (const a of index.ancestors(id)) next.delete(a);
          }
          return next;
        });
      }
      return { ...f, roles };
    });
  };

  const toggleComms = (comms: string) => {
    setFilters((f) => {
      const set = new Set(f.comms);
      if (set.has(comms)) set.delete(comms);
      else set.add(comms);
      return { ...f, comms: set };
    });
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: theme.bg,
        color: theme.text,
        fontFamily: theme.fontSans,
        cursor: "grab",
      }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-node], [data-ui]")) return;
        setSelected(null);
      }}
    >
      {scene && (
        <Canvas
          scene={scene}
          rolled={rolled}
          index={index}
          camera={camera}
          view={view}
          selected={selected}
          hovered={hovered}
          matches={matchIds}
          filters={filters}
          connected={connected}
          onSelect={setSelected}
          onHover={setHovered}
          onToggle={toggleExpand}
        />
      )}

      <ControlPanel
        ref={searchRef}
        index={index}
        filters={filters}
        search={search}
        matchCount={matches.length}
        visibleCount={visible.size}
        open={panelOpen}
        onToggleOpen={() => setPanelOpen((o) => !o)}
        onSearch={setSearch}
        onToggleRole={toggleRole}
        onToggleComms={toggleComms}
        onToggleDead={() => setFilters((f) => ({ ...f, deadOnly: !f.deadOnly }))}
        onClearFilters={() => setFilters(emptyFilters)}
      />

      <DetailPanel index={index} selected={selected} onNavigate={navigateTo} onClose={() => setSelected(null)} />

      {layouting && (
        <div
          data-ui
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radius,
            padding: "6px 12px",
            fontFamily: theme.fontMono,
            fontSize: 11,
            color: theme.textMuted,
            zIndex: 3,
            pointerEvents: "none",
          }}
        >
          laying out…
        </div>
      )}
    </div>
  );
}
