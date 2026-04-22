"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface TakeoffPreparationWorkspaceProps {
  title: string;
  body: string;
  pageId?: string | null;
}

export function TakeoffPreparationWorkspace({
  title,
  body,
  pageId = null,
}: TakeoffPreparationWorkspaceProps) {
  const router = useRouter();
  const workerRunningRef = useRef(false);
  const refreshTriggeredRef = useRef(false);
  const [helperText, setHelperText] = useState("Measure is starting the preview preparation pipeline for this drawing set.");

  useEffect(() => {
    let cancelled = false;

    async function kickWorker() {
      if (workerRunningRef.current || cancelled) {
        return;
      }

      workerRunningRef.current = true;
      try {
        await fetch("/api/takeoff/render-jobs/run?limit=1", {
          method: "POST",
          cache: "no-store",
        });
      } catch {
        // Leave the workspace message calm and keep polling.
      } finally {
        workerRunningRef.current = false;
      }
    }

    void kickWorker();
    const workerInterval = window.setInterval(() => {
      void kickWorker();
    }, 4000);

    let statusInterval: number | null = null;
    if (pageId) {
      statusInterval = window.setInterval(async () => {
        if (cancelled || refreshTriggeredRef.current) {
          return;
        }

        try {
          const response = await fetch(
            `/api/takeoff/pages/status?pageId=${encodeURIComponent(pageId)}`,
            { cache: "no-store" }
          );

          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as {
            previewStatus?: string;
            hasPreviewAsset?: boolean;
          };

          if (payload.previewStatus === "processing") {
            setHelperText("Measure is rendering the active drawing sheet in the background.");
            return;
          }

          if (payload.previewStatus === "pending") {
            setHelperText("Measure has queued this sheet and is waiting for the renderer.");
            return;
          }

          if (
            payload.previewStatus === "ready" ||
            payload.previewStatus === "failed" ||
            (payload.previewStatus === "ready" && payload.hasPreviewAsset)
          ) {
            refreshTriggeredRef.current = true;
            router.refresh();
          }
        } catch {
          // Keep polling quietly.
        }
      }, 1500);
    } else {
      statusInterval = window.setInterval(() => {
        if (cancelled || refreshTriggeredRef.current) {
          return;
        }

        refreshTriggeredRef.current = true;
        router.refresh();
      }, 4000);
    }

    return () => {
      cancelled = true;
      window.clearInterval(workerInterval);
      if (statusInterval !== null) {
        window.clearInterval(statusInterval);
      }
    };
  }, [pageId, router]);

  return (
    <div className="flex h-full min-h-[560px] w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(241,90,41,0.08),_transparent_28%),linear-gradient(180deg,#F6F8FB_0%,#E8EEF5_100%)] px-6">
      <div className="max-w-xl rounded-[18px] border border-white/75 bg-white/92 px-6 py-5 text-center shadow-[0_20px_52px_rgba(15,23,42,0.10)] backdrop-blur-sm">
        <p className="text-[18px] font-semibold text-[#1d2433]">{title}</p>
        <p className="mt-2 text-[14px] leading-[1.7] text-[#6B7C93]">{body}</p>
        <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.12em] text-[#8A94A6]">{helperText}</p>
      </div>
    </div>
  );
}
