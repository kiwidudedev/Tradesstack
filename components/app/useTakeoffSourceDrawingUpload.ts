"use client";

import { useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MAX_DRAWING_SET_UPLOAD_SIZE_BYTES,
  formatFileSize,
} from "@/lib/drawing-sets";
import { uploadSourceDrawingSetToProject } from "@/lib/project-drawing-set-upload";

interface UseTakeoffSourceDrawingUploadOptions {
  opportunityId: string;
  organizationId: string;
  projectId: string;
}

const MEASURE_VIEWER_POLL_INTERVAL_MS = 1000;
const MEASURE_VIEWER_POLL_TIMEOUT_MS = 30000;

function wait(delayMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export function useTakeoffSourceDrawingUpload({
  opportunityId,
  organizationId,
  projectId,
}: UseTakeoffSourceDrawingUploadOptions) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const onChooseFile = (event?: MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    inputRef.current?.click();
  };

  const waitForMeasurePageHref = async (drawingSetId: string) => {
    const deadline = Date.now() + MEASURE_VIEWER_POLL_TIMEOUT_MS;
    const measureViewerUrl = new URL("/api/takeoff/measure-viewer", window.location.origin);
    measureViewerUrl.searchParams.set("opportunityId", opportunityId);
    measureViewerUrl.searchParams.set("drawingSetId", drawingSetId);

    while (Date.now() < deadline) {
      try {
        const response = await fetch(measureViewerUrl.toString(), {
          cache: "no-store",
        });

        if (response.ok) {
          const payload = (await response.json()) as {
            ok?: boolean;
            data?: { pageId?: string | null };
          };
          const pageId = payload.data?.pageId?.trim() ?? "";

          if (payload.ok && pageId) {
            return buildTakeoffHref(opportunityId, "measure", {
              drawingSetId,
              pageId,
            });
          }
        }
      } catch {
        // Keep polling quietly while the first takeoff page is being prepared.
      }

      await wait(MEASURE_VIEWER_POLL_INTERVAL_MS);
    }

    throw new Error("The drawing uploaded successfully, but Measure is still preparing the first page. Please refresh in a moment.");
  };

  const uploadFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured.");
      setStatus(null);
      return;
    }

    setError(null);
    setStatus(null);
    setIsUploading(true);

    try {
      const insertedRow = await uploadSourceDrawingSetToProject({
        supabase,
        organizationId,
        projectId,
        file,
        onProgress(uploadedBytes, totalBytes) {
          if (totalBytes <= 0) {
            setStatus("Uploading source drawing...");
            return;
          }

          const pct = Math.min(100, Math.max(0, Math.round((uploadedBytes / totalBytes) * 100)));
          setStatus(`Uploading source drawing... (${pct}%)`);
        },
      });

      setStatus("Preparing measure workspace...");
      const nextUrl = await waitForMeasurePageHref(insertedRow.id);
      window.location.assign(nextUrl);
    } catch (uploadError) {
      const fallback = `${file.name} could not be uploaded. Max size is ${formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}.`;
      setError(uploadError instanceof Error && uploadError.message ? uploadError.message : fallback);
      setStatus(null);
    } finally {
      setIsUploading(false);
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    await uploadFile(file);
  };

  return {
    inputRef,
    isUploading,
    status,
    error,
    onChooseFile,
    onFileChange,
    uploadFile,
  };
}
