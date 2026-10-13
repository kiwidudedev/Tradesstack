"use client";

import { useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { buildTakeoffHref, buildTakeoffOwnerApiQuery } from "@/lib/takeoff/navigation";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MAX_DRAWING_SET_UPLOAD_SIZE_BYTES,
  formatFileSize,
} from "@/lib/drawing-sets";
import { uploadSourceDrawingSetToProject } from "@/lib/project-drawing-set-upload";
import type { ProjectDrawingSet } from "@/lib/project-drawing-set-upload";

interface UseTakeoffSourceDrawingUploadOptions {
  owner: TakeoffRouteOwner;
  organizationId: string;
  projectId: string;
  completionBehavior?: "open-measure" | "stay-on-register";
  onUploaded?: (drawingSet: ProjectDrawingSet) => void;
}

export function useTakeoffSourceDrawingUpload({
  owner,
  organizationId,
  projectId,
  completionBehavior = "open-measure",
  onUploaded,
}: UseTakeoffSourceDrawingUploadOptions) {
  const router = useRouter();
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

      setStatus("Preparing drawing set...");
      const preparationUrl = `/api/takeoff/pages/prepare?${buildTakeoffOwnerApiQuery(owner)}&drawingSetId=${encodeURIComponent(insertedRow.id)}`;
      try {
        await fetch(preparationUrl, {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
      } catch {
        // The drawing remains authoritative and its preparation workspace owns retry/recovery.
      }
      onUploaded?.(insertedRow);
      if (completionBehavior === "stay-on-register") {
        setStatus("Drawing added. Preparation is running.");
        router.refresh();
      } else {
        const nextUrl = buildTakeoffHref(owner, "measure", {
          drawingSetId: insertedRow.id,
        });
        router.push(nextUrl);
      }
    } catch (uploadError) {
      const fallback = `${file.name} could not be uploaded. Max size is ${formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}.`;
      setError(uploadError instanceof Error && uploadError.message ? uploadError.message : fallback);
      setStatus(null);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    const supported = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (supported.length === 0) {
      setError("Select one or more PDF drawing files.");
      return;
    }
    if (supported.length === 1) {
      await uploadFile(supported[0]);
      return;
    }
    setError(null);
    setStatus(`Uploading 0 of ${supported.length} drawing files...`);
    for (let index = 0; index < supported.length; index += 1) {
      try {
        await uploadFile(supported[index]);
        setStatus(`Uploaded ${index + 1} of ${supported.length} drawing files. Preparing is running.`);
      } catch {
        // uploadFile presents the individual error; continue the batch so one
        // failed drawing cannot discard successful files.
      }
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await uploadFiles(files);
  };

  return {
    inputRef,
    isUploading,
    status,
    error,
    onChooseFile,
    onFileChange,
    uploadFile,
    uploadFiles,
  };
}
