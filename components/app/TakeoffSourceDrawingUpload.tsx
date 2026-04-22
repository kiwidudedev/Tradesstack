"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ibmPlexSans } from "@/lib/fonts";
import { buildTakeoffHref } from "@/lib/takeoff/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  MAX_DRAWING_SET_UPLOAD_SIZE_BYTES,
  formatFileSize,
} from "@/lib/drawing-sets";
import { uploadSourceDrawingSetToProject } from "@/lib/project-drawing-set-upload";
import { leadsSectionTitleStyle } from "@/components/app/LeadsPagePrimitives";
import styles from "@/components/app/trade-pack-builder.module.css";

interface TakeoffSourceDrawingUploadProps {
  opportunityId: string;
  organizationId: string;
  projectId: string;
  buttonLabel?: string;
}

export function TakeoffSourceDrawingUpload({
  opportunityId,
  organizationId,
  projectId,
  buttonLabel = "Choose file",
}: TakeoffSourceDrawingUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const onChooseFile = (event?: MouseEvent<HTMLButtonElement>) => {
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

      const nextUrl = buildTakeoffHref(opportunityId, "measure", { drawingSetId: insertedRow.id });
      router.push(nextUrl);
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

  const onDropZoneDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (isUploading) {
      return;
    }
    setIsDropZoneActive(true);
  };

  const onDropZoneDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDropZoneActive(false);
  };

  const onDropZoneDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDropZoneActive(false);
    if (isUploading) {
      return;
    }
    void uploadFile(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <section className="rounded-[14px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)] md:p-6">
      <div className="space-y-2 pb-5">
        <h3 style={leadsSectionTitleStyle}>Upload Plans to Start Measuring</h3>
        <p className="max-w-[42rem] text-[14px] leading-[1.6] text-[#6B7C93]">
          Upload a source PDF drawing set to begin the Measure workflow. Once plans exist, this page will transition into the takeoff viewer.
        </p>
      </div>

      <input
        ref={inputRef}
        id="takeoffSourcePdfInput"
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onFileChange}
        disabled={isUploading}
      />
      <label
        htmlFor="takeoffSourcePdfInput"
        onDragOver={onDropZoneDragOver}
        onDragLeave={onDropZoneDragLeave}
        onDrop={onDropZoneDrop}
        className={`${styles.dropZone} ${styles.opportunityDropZone} ${isDropZoneActive ? styles.dropZoneActive : ""} ${
          isUploading ? "pointer-events-none opacity-70" : "cursor-pointer"
        }`}
      >
        <span className={styles.dropZoneIcon}>
          {isUploading ? <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2.1} /> : <CloudUpload className="h-7 w-7" strokeWidth={2.1} />}
        </span>
        <div className="space-y-2 text-center">
          <p className={`${ibmPlexSans.className} text-[1.05rem] font-medium text-[#111827]`}>
            Drag and drop your PDF plans here
          </p>
          <p className="text-sm text-[#7A7F87]">
            Or use the file chooser to upload a new source drawing set for Measure.
          </p>
          <p className="text-sm text-[#7A7F87]">
            Supported format: PDF. File size max {formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}
          </p>
        </div>
        <Button
          type="button"
          variant="orange"
          size="sm"
          onClick={onChooseFile}
          disabled={isUploading}
          className="gap-2"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {buttonLabel}
        </Button>
      </label>
      <div className="pt-3">
        {status ? <p className="text-xs text-[#6B7C93]">{status}</p> : null}
        {error ? <p className="text-xs text-[#9A3412]">{error}</p> : null}
      </div>
    </section>
  );
}
