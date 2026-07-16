/**
 * Pan/zoom viewport helpers + keyboard bindings.
 *
 * @chorograph group="Viewer" role=usecase comms=in-proc
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export function useCamera(initial?: Partial<Camera>) {
  const [camera, setCamera] = useState<Camera>({ x: 40, y: 40, scale: 1, ...initial });
  const dragging = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    const fn = () => {
      reduced.current = mq.matches;
    };
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setCamera((c) => {
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const next = Math.min(3, Math.max(0.15, c.scale * factor));
      const wx = (mx - c.x) / c.scale;
      const wy = (my - c.y) / c.scale;
      return { scale: next, x: mx - wx * next, y: my - wy * next };
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    // Don't start pan when clicking interactive controls.
    const t = e.target as HTMLElement;
    if (t.closest("[data-node], [data-ui]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { px: e.clientX, py: e.clientY, cx: camera.x, cy: camera.y };
  }, [camera.x, camera.y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    setCamera((c) => ({
      ...c,
      x: d.cx + (e.clientX - d.px),
      y: d.cy + (e.clientY - d.py),
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  const fit = useCallback((bounds: { width: number; height: number }, view: { width: number; height: number }) => {
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const pad = 64;
    const sx = (view.width - pad * 2) / bounds.width;
    const sy = (view.height - pad * 2) / bounds.height;
    const scale = Math.min(1.2, Math.max(0.2, Math.min(sx, sy)));
    setCamera({
      scale,
      x: (view.width - bounds.width * scale) / 2,
      y: (view.height - bounds.height * scale) / 2,
    });
  }, []);

  const focusBox = useCallback(
    (box: { x: number; y: number; width: number; height: number }, view: { width: number; height: number }) => {
      const pad = 80;
      const sx = (view.width - pad * 2) / Math.max(box.width, 1);
      const sy = (view.height - pad * 2) / Math.max(box.height, 1);
      const scale = Math.min(1.5, Math.max(0.35, Math.min(sx, sy)));
      setCamera({
        scale,
        x: view.width / 2 - (box.x + box.width / 2) * scale,
        y: view.height / 2 - (box.y + box.height / 2) * scale,
      });
    },
    [],
  );

  return { camera, setCamera, onWheel, onPointerDown, onPointerMove, onPointerUp, fit, focusBox, reduced };
}

export function useKeyboard(handlers: {
  onSearch: () => void;
  onFit: () => void;
  onEscape: () => void;
  onArrow: (dir: "up" | "down" | "left" | "right") => void;
  onEnter: () => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        ref.current.onSearch();
        return;
      }
      if (typing) {
        if (e.key === "Escape") ref.current.onEscape();
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        ref.current.onFit();
      } else if (e.key === "Escape") {
        ref.current.onEscape();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        ref.current.onArrow("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        ref.current.onArrow("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        ref.current.onArrow("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        ref.current.onArrow("right");
      } else if (e.key === "Enter") {
        e.preventDefault();
        ref.current.onEnter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
