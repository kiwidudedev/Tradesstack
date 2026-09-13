"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import {
  SIGNATURE_DPR_CAP,
  analyzeSignature,
  type SignatureArtifactMetadata,
  type SignatureStroke,
} from "./signature-pad-model";

export type SignaturePadArtifact = { blob: Blob; metadata: SignatureArtifactMetadata };
export type SignaturePadHandle = { clear: () => void; exportPng: () => Promise<SignaturePadArtifact> };

function drawStrokes(context: CanvasRenderingContext2D, strokes: SignatureStroke[], width: number, height: number) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#172033";
  context.lineWidth = 2.5;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    context.beginPath();
    context.moveTo(stroke[0].x * width, stroke[0].y * height);
    for (let index = 1; index < stroke.length; index += 1) context.lineTo(stroke[index].x * width, stroke[index].y * height);
    context.stroke();
  }
}

export const SignaturePad = forwardRef<SignaturePadHandle, {
  disabled?: boolean;
  className?: string;
  onValidityChange?: (meaningful: boolean) => void;
}>(function SignaturePad({ disabled = false, className, onValidityChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instructionsId = useId();
  const strokesRef = useRef<SignatureStroke[]>([]);
  const activePointerRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 600, height: 200, dpr: 1 });
  const [hasInk, setHasInk] = useState(false);

  const redraw = useCallback((nextSize = sizeRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixelWidth = Math.max(1, Math.round(nextSize.width * nextSize.dpr));
    const pixelHeight = Math.max(1, Math.round(nextSize.height * nextSize.dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.setTransform(nextSize.dpr, 0, 0, nextSize.dpr, 0, 0);
    drawStrokes(context, strokesRef.current, nextSize.width, nextSize.height);
  }, []);

  const publishValidity = useCallback((nextSize = sizeRef.current) => {
    const analysis = analyzeSignature(strokesRef.current, nextSize.width, nextSize.height);
    setHasInk(analysis.pointCount > 0);
    onValidityChange?.(analysis.meaningful);
  }, [onValidityChange]);

  const clear = useCallback(() => {
    strokesRef.current = [];
    activePointerRef.current = null;
    redraw();
    publishValidity();
  }, [publishValidity, redraw]);

  useImperativeHandle(ref, () => ({
    clear,
    exportPng: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Signature pad is unavailable.");
      const size = sizeRef.current;
      const analysis = analyzeSignature(strokesRef.current, size.width, size.height);
      if (!analysis.meaningful) throw new Error("Draw a fuller signature before saving.");
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to prepare signature image.")), "image/png"));
      return {
        blob,
        metadata: {
          schemaVersion: 1, rendererVersion: 1, mimeType: "image/png",
          logicalWidth: Math.round(size.width), logicalHeight: Math.round(size.height),
          pixelWidth: canvas.width, pixelHeight: canvas.height, devicePixelRatio: size.dpr,
          strokeCount: analysis.strokeCount, pointCount: analysis.pointCount,
          totalDistance: Math.round(analysis.totalDistance * 100) / 100,
          bounds: Object.fromEntries(Object.entries(analysis.bounds).map(([key, value]) => [key, Math.round(value * 100) / 100])) as SignatureArtifactMetadata["bounds"],
        },
      };
    },
  }), [clear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const next = { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr: Math.min(window.devicePixelRatio || 1, SIGNATURE_DPR_CAP) };
      sizeRef.current = next;
      redraw(next);
      publishValidity(next);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [publishValidity, redraw]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1))), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1))) };
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || !event.isPrimary || event.button !== 0 || activePointerRef.current !== null) return;
    event.preventDefault();
    activePointerRef.current = event.pointerId;
    strokesRef.current = [...strokesRef.current, [point(event)]];
    event.currentTarget.setPointerCapture?.(event.pointerId);
    redraw();
    publishValidity();
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const next = point(event);
    const strokes = strokesRef.current;
    const stroke = strokes[strokes.length - 1];
    const previous = stroke?.[stroke.length - 1];
    const size = sizeRef.current;
    if (!stroke || (previous && Math.hypot((next.x - previous.x) * size.width, (next.y - previous.y) * size.height) < 0.75)) return;
    stroke.push(next);
    redraw();
    publishValidity();
  }

  function pointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    publishValidity();
  }

  return <div className={cn("relative", className)}>
    <canvas
      ref={canvasRef}
      data-testid="signature-pad-canvas"
      aria-label="Draw signature"
      aria-describedby={instructionsId}
      className={cn("block h-[180px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white shadow-inner sm:h-auto sm:aspect-[3/1]", disabled ? "cursor-not-allowed opacity-70" : "cursor-crosshair")}
      style={{ touchAction: "none" }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onLostPointerCapture={pointerEnd}
    />
    {!hasInk ? <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--text-muted)]">Draw signature here</span> : null}
    <p id={instructionsId} className="sr-only">Use a mouse, trackpad, finger, or stylus. A small tap is not accepted as a signature.</p>
  </div>;
});
