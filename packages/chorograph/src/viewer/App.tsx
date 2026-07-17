/**
 * Viewer shell — owns the little state there is: filters, folding, search, selection, camera.
 *
 * The scene is a pure function of (graph, filters, folded); toggling anything re-runs layout so
 * the map re-flows around what's left instead of leaving holes. Search never hides anything —
 * it dims non-matches, because spatial memory is the point of a map. Big maps start folded to
 * their domains; double-clicking unfolds one level at a time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./Canvas.tsx";
import { DetailPanel } from "./DetailPanel.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { useCamera, useKeyboard, type ViewInsets } from "./hooks.ts";
import { buildScene, containerIds } from "./layout.ts";
import { DETAIL_WIDTH, PANEL_GAP, SIDEBAR_WIDTH, theme } from "./theme.ts";
import type { EdgeKind, Filters, Graph, Node, NodeKind, Scene } from "./types.ts";

const NO_FILTERS: Filters = { hiddenNodeKinds: new Set(), hiddenEdgeKinds: new Set() };

/** Maps larger than this start folded to their top-level containers. */
const FOLD_THRESHOLD = 150;

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function depthOf(byId: ReadonlyMap<string, Node>, id: string): number {
  let d = 0;
  for (let cur = byId.get(id); cur?.parent; cur = byId.get(cur.parent)) d++;
  return d;
}

/** The initial fold: big maps collapse every non-root container, small maps show everything. */
function initialFolded(graph: Graph): Set<string> {
  if (graph.nodes.length <= FOLD_THRESHOLD) return new Set();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return new Set([...containerIds(graph)].filter((id) => depthOf(byId, id) >= 1));
}

export function App({ graph }: { graph: Graph }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => initialFolded(graph));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 1200, height: 800 });
  const { camera, onWheel, onPointerDown, onPointerMove, onPointerUp, wasDrag, fit, focusBox } = useCamera();
  const layoutGen = useRef(0);
  /** Node to bring into view once the next layout lands (set by toggles and navigation). */
  const pendingFocus = useRef<string | null>(null);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const allContainers = useMemo(() => containerIds(graph), [graph]);

  /** Double-click: unfold a chip (children start folded, one level at a time) or fold a container. */
  const toggleFold = useCallback(
    (id: string) => {
      if (!allContainers.has(id)) return;
      setFolded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          // Progressive disclosure: unfolding shows one level; child containers stay chips.
          for (const n of graph.nodes) {
            if (n.parent === id && allContainers.has(n.id)) next.add(n.id);
          }
        } else {
          next.add(id);
        }
        return next;
      });
      pendingFocus.current = id;
    },
    [graph, allContainers],
  );

  const foldAll = useCallback(() => {
    setFolded(new Set([...allContainers].filter((id) => depthOf(byId, id) >= 1)));
    pendingFocus.current = null;
  }, [allContainers, byId]);

  const unfoldAll = useCallback(() => {
    setFolded(new Set());
    pendingFocus.current = null;
  }, []);

  const insets: ViewInsets = useMemo(
    () => ({
      left: PANEL_GAP + SIDEBAR_WIDTH + PANEL_GAP,
      right: selected ? PANEL_GAP + DETAIL_WIDTH + PANEL_GAP : PANEL_GAP,
      top: PANEL_GAP,
      bottom: PANEL_GAP,
    }),
    [selected],
  );

  // Layout is async (ELK); guard against out-of-order results.
  useEffect(() => {
    const gen = ++layoutGen.current;
    void buildScene(graph, filters, folded).then((s) => {
      if (gen === layoutGen.current) setScene(s);
    });
  }, [graph, filters, folded]);

  // Track viewport size.
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

  // When a new layout arrives: focus the node that caused it (a fold toggle or a navigation),
  // else re-frame the whole map — the re-flow made the old camera position meaningless.
  // Hover/selection never rebuilds the scene.
  const lastScene = useRef<Scene | null>(null);
  useEffect(() => {
    if (!scene || scene === lastScene.current) return;
    lastScene.current = scene;
    const target = pendingFocus.current !== null ? scene.byId.get(pendingFocus.current) : undefined;
    pendingFocus.current = null;
    if (target) focusBox(target, view, insets);
    else fit({ width: scene.width, height: scene.height }, view, insets);
  }, [scene, fit, focusBox, view, insets]);

  const fitScene = useCallback(() => {
    if (scene) fit({ width: scene.width, height: scene.height }, view, insets);
  }, [scene, fit, view, insets]);

  const { matches, matchCount, matchList } = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return { matches: new Set<string>(), matchCount: 0, matchList: [] as Node[] };
    const hit = new Set<string>();
    const found: { n: Node; rank: number }[] = [];
    for (const n of graph.nodes) {
      const hay = [n.name, n.id, n.kind, n.tech ?? "", ...n.tags].join(" ").toLowerCase();
      if (hay.includes(q)) {
        const name = n.name.toLowerCase();
        found.push({ n, rank: name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3 });
        hit.add(n.id);
        // Keep ancestors readable so matches have context.
        let parent = n.parent;
        while (parent) {
          hit.add(parent);
          parent = byId.get(parent)?.parent ?? null;
        }
      }
    }
    found.sort((a, b) => a.rank - b.rank || a.n.name.length - b.n.name.length);
    return { matches: hit, matchCount: found.length, matchList: found.slice(0, 12).map((f) => f.n) };
  }, [graph, byId, search]);

  const navigateTo = useCallback(
    (id: string) => {
      setSelected(id);
      const box = scene?.byId.get(id);
      if (box) {
        focusBox(box, view, insets);
        return;
      }
      // The target is folded away — unfold its ancestors and focus once the layout lands.
      const ancestors: string[] = [];
      for (let cur = byId.get(id)?.parent; cur; cur = byId.get(cur)?.parent ?? null) ancestors.push(cur);
      setFolded((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.delete(a);
        return next;
      });
      pendingFocus.current = id;
    },
    [scene, byId, focusBox, view, insets],
  );

  useKeyboard({
    onSearch: () => searchRef.current?.focus(),
    onFit: fitScene,
    onEscape: () => {
      if (document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        setSearch("");
        return;
      }
      if (search) setSearch("");
      else setSelected(null);
    },
  });

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: theme.canvas,
        color: theme.ink,
        fontFamily: theme.fontSans,
      }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        if (wasDrag.current) return;
        if ((e.target as HTMLElement).closest("[data-node], [data-ui]")) return;
        setSelected(null);
      }}
    >
      {scene && (
        <Canvas
          scene={scene}
          camera={camera}
          selected={selected}
          hovered={hovered}
          matches={matches}
          searchActive={search.trim().length > 0}
          onSelect={setSelected}
          onHover={setHovered}
          onToggle={toggleFold}
        />
      )}

      <Sidebar
        ref={searchRef}
        graph={graph}
        filters={filters}
        search={search}
        matchCount={matchCount}
        results={matchList}
        foldable={allContainers.size > 0 && graph.nodes.length > FOLD_THRESHOLD}
        foldedCount={folded.size}
        onSearch={setSearch}
        onNavigate={navigateTo}
        onToggleNodeKind={(kind: NodeKind) =>
          setFilters((f) => ({ ...f, hiddenNodeKinds: toggle(f.hiddenNodeKinds, kind) }))
        }
        onToggleEdgeKind={(kind: EdgeKind) =>
          setFilters((f) => ({ ...f, hiddenEdgeKinds: toggle(f.hiddenEdgeKinds, kind) }))
        }
        onShowEverything={() => setFilters(NO_FILTERS)}
        onFoldAll={foldAll}
        onUnfoldAll={unfoldAll}
      />

      {/* One card, two modes: hovering previews a node, clicking pins it. While hovering, the
          preview temporarily replaces the pinned card; mouse-out restores it. */}
      <DetailPanel
        graph={graph}
        nodeId={hovered ?? selected}
        pinned={hovered === null && selected !== null}
        onNavigate={navigateTo}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
