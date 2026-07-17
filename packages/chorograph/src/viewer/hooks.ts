/**
 * Pan/zoom camera + the three keyboard shortcuts (`/` search, `f` fit, `esc` clear).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** Pixels reserved by floating chrome (sidebar on the left, detail panel on the right). */
export interface ViewInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function useCamera() {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const dragging = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-ui]")) return; // panels scroll their own content, never the camera
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setCamera((c) => {
      const factor = e.deltaY < 0 ? 1.09 : 1 / 1.09;
      const next = Math.min(3, Math.max(0.1, c.scale * factor));
      const wx = (mx - c.x) / c.scale;
      const wy = (my - c.y) / c.scale;
      return { scale: next, x: mx - wx * next, y: my - wy * next };
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-ui]")) return; // panels own their own pointer events
      dragging.current = { px: e.clientX, py: e.clientY, cx: camera.x, cy: camera.y };
    },
    [camera.x, camera.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    // Capture only once a real drag starts. Capturing on pointerdown retargets pointerup to the
    // wrapper, which swallows the click that selects a node.
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setCamera((c) => ({ ...c, x: d.cx + (e.clientX - d.px), y: d.cy + (e.clientY - d.py) }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  /** True if the last pointer interaction was a drag (so click shouldn't clear selection). */
  const wasDrag = useRef(false);
  const onPointerMoveTracked = useCallback(
    (e: React.PointerEvent) => {
      if (dragging.current) {
        const d = dragging.current;
        if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) wasDrag.current = true;
      }
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerDownTracked = useCallback(
    (e: React.PointerEvent) => {
      wasDrag.current = false;
      onPointerDown(e);
    },
    [onPointerDown],
  );

  const fit = useCallback(
    (bounds: { width: number; height: number }, view: { width: number; height: number }, insets: ViewInsets) => {
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const pad = 40;
      const availW = Math.max(120, view.width - insets.left - insets.right - pad * 2);
      const availH = Math.max(120, view.height - insets.top - insets.bottom - pad * 2);
      const scale = Math.min(1.15, Math.max(0.05, Math.min(availW / bounds.width, availH / bounds.height)));
      const frameW = view.width - insets.left - insets.right;
      const frameH = view.height - insets.top - insets.bottom;
      setCamera({
        scale,
        x: insets.left + (frameW - bounds.width * scale) / 2,
        y: insets.top + (frameH - bounds.height * scale) / 2,
      });
    },
    [],
  );

  const focusBox = useCallback(
    (
      box: { x: number; y: number; width: number; height: number },
      view: { width: number; height: number },
      insets: ViewInsets,
    ) => {
      const frameW = Math.max(120, view.width - insets.left - insets.right);
      const frameH = Math.max(120, view.height - insets.top - insets.bottom);
      setCamera((c) => {
        const scale = Math.max(0.5, Math.min(1.15, c.scale));
        return {
          scale,
          x: insets.left + frameW / 2 - (box.x + box.width / 2) * scale,
          y: insets.top + frameH / 2 - (box.y + box.height / 2) * scale,
        };
      });
    },
    [],
  );

  return {
    camera,
    onWheel,
    onPointerDown: onPointerDownTracked,
    onPointerMove: onPointerMoveTracked,
    onPointerUp,
    wasDrag,
    fit,
    focusBox,
  };
}

export function useKeyboard(handlers: { onSearch: () => void; onFit: () => void; onEscape: () => void }) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;
      if (e.key === "Escape") {
        ref.current.onEscape();
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        ref.current.onSearch();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        ref.current.onFit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
