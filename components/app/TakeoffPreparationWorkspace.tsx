"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildTakeoffOwnerApiQuery } from "@/lib/takeoff/navigation";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

interface TakeoffPreparationWorkspaceProps {
  title: string;
  owner?: TakeoffRouteOwner;
  opportunityId?: string;
  drawingSetId: string;
}

async function fetchTakeoffPreparation(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function TakeoffPreparationWorkspace({
  title,
  owner: ownerProp,
  opportunityId,
  drawingSetId,
}: TakeoffPreparationWorkspaceProps) {
  const owner = ownerProp ?? { kind: "opportunity" as const, slug: opportunityId ?? "" };
  const router = useRouter();
  const workerRunningRef = useRef(false);
  const refreshTriggeredRef = useRef(false);
  const [helperText, setHelperText] = useState("Measure is starting the preview preparation pipeline for this drawing set.");
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const preparationUrl = `/api/takeoff/pages/prepare?${buildTakeoffOwnerApiQuery(owner)}&drawingSetId=${encodeURIComponent(drawingSetId)}`;

  useEffect(() => {
    let cancelled = false;
    let terminal = false;
    const preparationDeadline = Date.now() + 120_000;
    refreshTriggeredRef.current = false;

    async function enqueuePreparation() {
      try {
        const response = await fetchTakeoffPreparation(preparationUrl, { method: "POST", cache: "no-store" });
        if (!response.ok) {
          terminal = true;
          setTerminalError("Measure could not start page preparation. You can retry safely.");
        }
      } catch {
        terminal = true;
        setTerminalError("Measure could not start page preparation. Check your connection and retry.");
      }
    }

    async function kickWorker() {
      if (workerRunningRef.current || cancelled || terminal) {
        return;
      }

      workerRunningRef.current = true;
      try {
        await fetchTakeoffPreparation("/api/takeoff/render-jobs/run?limit=1", {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        // Leave the workspace message calm and keep polling.
      } finally {
        workerRunningRef.current = false;
      }
    }

    void enqueuePreparation().then(kickWorker);
    const workerInterval = window.setInterval(() => {
      void kickWorker();
    }, 4000);

    const statusInterval = window.setInterval(async () => {
        if (cancelled || refreshTriggeredRef.current) {
          return;
        }

        if (Date.now() >= preparationDeadline) {
          terminal = true;
          setHelperText("Page preparation did not complete within the expected window.");
          setTerminalError("Measure preparation timed out. Retry to start a fresh worker attempt.");
          return;
        }

        try {
          const response = await fetchTakeoffPreparation(preparationUrl, { cache: "no-store" });

          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as {
            status?: string;
            error?: string | null;
          };

          if (payload.status === "processing") {
            setHelperText("");
            return;
          }

          if (payload.status === "pending") {
            setHelperText("Measure has queued this drawing and is waiting for a worker.");
            return;
          }

          if (payload.status === "ready") {
            refreshTriggeredRef.current = true;
            router.refresh();
            return;
          }

          if (payload.status === "failed") {
            terminal = true;
            setTerminalError(payload.error || "Measure could not prepare this PDF.");
          }
        } catch {
          // Keep polling quietly.
        }
      }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(workerInterval);
      window.clearInterval(statusInterval);
    };
  }, [attempt, preparationUrl, router]);

  const retry = () => {
    setTerminalError(null);
    setHelperText("Measure is retrying page preparation.");
    setAttempt((current) => current + 1);
  };

  return (
    <div className="flex h-full min-h-[560px] w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(241,90,41,0.08),_transparent_28%),linear-gradient(180deg,#F6F8FB_0%,#E8EEF5_100%)] px-6">
      <div className="max-w-xl rounded-[18px] border border-white/75 bg-white/92 px-6 py-5 text-center shadow-[0_20px_52px_rgba(15,23,42,0.10)] backdrop-blur-sm">
        <p className="text-[18px] font-semibold text-[#1d2433]">{title}</p>
        {helperText ? (
          <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.12em] text-[#8A94A6]">{helperText}</p>
        ) : null}
        {terminalError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{terminalError}</p>
            <button type="button" onClick={() => void retry()} className="mt-3 rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white">
              Retry preparation
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
