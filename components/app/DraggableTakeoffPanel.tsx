"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { GripVertical } from "lucide-react";

export const TAKEOFF_PANEL_SAFETY_MARGIN = 10;

export interface TakeoffPanelPoint {
  x: number;
  y: number;
}

export interface TakeoffPanelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ClampedTakeoffPanelOffset {
  offset: TakeoffPanelPoint;
  canMove: boolean;
}

export function clampTakeoffPanelOffset({
  anchorRect,
  boundaryRect,
  requestedOffset,
  margin = TAKEOFF_PANEL_SAFETY_MARGIN,
}: {
  anchorRect: TakeoffPanelRect;
  boundaryRect: TakeoffPanelRect;
  requestedOffset: TakeoffPanelPoint;
  margin?: number;
}): ClampedTakeoffPanelOffset {
  const availableWidth = Math.max(0, boundaryRect.width - margin * 2);
  const availableHeight = Math.max(0, boundaryRect.height - margin * 2);

  if (anchorRect.width > availableWidth || anchorRect.height > availableHeight) {
    return { offset: { x: 0, y: 0 }, canMove: false };
  }

  const minX = boundaryRect.left + margin - anchorRect.left;
  const maxX = boundaryRect.right - margin - anchorRect.right;
  const minY = boundaryRect.top + margin - anchorRect.top;
  const maxY = boundaryRect.bottom - margin - anchorRect.bottom;

  return {
    offset: {
      x: Math.min(maxX, Math.max(minX, requestedOffset.x)),
      y: Math.min(maxY, Math.max(minY, requestedOffset.y)),
    },
    canMove: true,
  };
}

function rectWithoutOffset(rect: DOMRect, offset: TakeoffPanelPoint): TakeoffPanelRect {
  return {
    left: rect.left - offset.x,
    top: rect.top - offset.y,
    right: rect.right - offset.x,
    bottom: rect.bottom - offset.y,
    width: rect.width,
    height: rect.height,
  };
}

interface ActivePanelDrag {
  pointerId: number;
  startClient: TakeoffPanelPoint;
  startOffset: TakeoffPanelPoint;
  anchorRect: TakeoffPanelRect;
}

export function DraggableTakeoffPanel({
  accessibleLabel,
  children,
  resetKey,
}: {
  accessibleLabel: string;
  children: ReactNode;
  resetKey: string;
}) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<ActivePanelDrag | null>(null);
  const requestedOffsetRef = useRef<TakeoffPanelPoint>({ x: 0, y: 0 });
  const appliedOffsetRef = useRef<TakeoffPanelPoint>({ x: 0, y: 0 });
  const transformFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [canMove, setCanMove] = useState(true);

  const applyOffset = useCallback((offset: TakeoffPanelPoint) => {
    requestedOffsetRef.current = offset;
    if (transformFrameRef.current !== null) {
      window.cancelAnimationFrame(transformFrameRef.current);
    }
    transformFrameRef.current = window.requestAnimationFrame(() => {
      transformFrameRef.current = null;
      appliedOffsetRef.current = offset;
      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;
      }
    });
  }, []);

  const resetOffset = useCallback(() => {
    if (transformFrameRef.current !== null) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = null;
    }
    requestedOffsetRef.current = { x: 0, y: 0 };
    appliedOffsetRef.current = { x: 0, y: 0 };
    activeDragRef.current = null;
    if (panelRef.current) {
      panelRef.current.style.transform = "translate3d(0px, 0px, 0)";
    }
  }, []);

  const reclampPanel = useCallback(() => {
    const boundary = boundaryRef.current;
    const panel = panelRef.current;
    if (!boundary || !panel) {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const result = clampTakeoffPanelOffset({
      anchorRect: rectWithoutOffset(panelRect, appliedOffsetRef.current),
      boundaryRect: boundary.getBoundingClientRect(),
      requestedOffset: requestedOffsetRef.current,
    });
    setCanMove((current) => (current === result.canMove ? current : result.canMove));
    applyOffset(result.offset);
  }, [applyOffset]);

  useEffect(() => {
    resetOffset();
    const resetFrame = window.requestAnimationFrame(() => {
      setCanMove(true);
      reclampPanel();
    });
    return () => window.cancelAnimationFrame(resetFrame);
  }, [reclampPanel, resetKey, resetOffset]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    const panel = panelRef.current;
    if (!boundary || !panel || typeof ResizeObserver === "undefined") {
      return;
    }

    const scheduleReclamp = () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        reclampPanel();
      });
    };
    const observer = new ResizeObserver(scheduleReclamp);
    observer.observe(boundary);
    observer.observe(panel);
    scheduleReclamp();

    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [reclampPanel]);

  useEffect(() => () => {
    if (transformFrameRef.current !== null) {
      window.cancelAnimationFrame(transformFrameRef.current);
    }
  }, []);

  function stopViewerEventPropagation(event: SyntheticEvent) {
    event.stopPropagation();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!event.isPrimary || event.button !== 0 || !canMove) {
      return;
    }

    const boundary = boundaryRef.current;
    const panel = panelRef.current;
    if (!boundary || !panel) {
      return;
    }

    event.preventDefault();
    const panelRect = panel.getBoundingClientRect();
    const anchorRect = rectWithoutOffset(panelRect, appliedOffsetRef.current);
    const startResult = clampTakeoffPanelOffset({
      anchorRect,
      boundaryRect: boundary.getBoundingClientRect(),
      requestedOffset: requestedOffsetRef.current,
    });
    if (!startResult.canMove) {
      setCanMove(false);
      resetOffset();
      return;
    }

    applyOffset(startResult.offset);
    activeDragRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startOffset: startResult.offset,
      anchorRect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const activeDrag = activeDragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const boundary = boundaryRef.current;
    if (!boundary) {
      return;
    }

    const result = clampTakeoffPanelOffset({
      anchorRect: activeDrag.anchorRect,
      boundaryRect: boundary.getBoundingClientRect(),
      requestedOffset: {
        x: activeDrag.startOffset.x + event.clientX - activeDrag.startClient.x,
        y: activeDrag.startOffset.y + event.clientY - activeDrag.startClient.y,
      },
    });
    applyOffset(result.offset);
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const activeDrag = activeDragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={boundaryRef}
      data-testid="draggable-takeoff-panel-boundary"
      className="pointer-events-none absolute inset-0 z-30"
    >
      <div
        className="absolute inset-x-0 flex justify-center px-4"
        style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-label={accessibleLabel}
          data-testid="draggable-takeoff-panel"
          className="pointer-events-auto relative w-full max-w-[400px] will-change-transform"
          onPointerDown={stopViewerEventPropagation}
          onClick={stopViewerEventPropagation}
          onDoubleClick={stopViewerEventPropagation}
          onWheel={stopViewerEventPropagation}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Move setup dialog"
            title={canMove ? "Move setup dialog" : "Setup dialog cannot move at this viewer size"}
            disabled={!canMove}
            data-testid="draggable-takeoff-panel-handle"
            className="absolute left-1/2 top-0.5 z-10 inline-flex h-5 w-8 -translate-x-1/2 touch-none items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F15A29]/30 active:cursor-grabbing disabled:cursor-default disabled:opacity-50 enabled:cursor-grab"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerDrag}
            onPointerCancel={finishPointerDrag}
            onLostPointerCapture={finishPointerDrag}
          >
            <GripVertical className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
