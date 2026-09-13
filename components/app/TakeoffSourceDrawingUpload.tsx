"use client";

import { useState, type DragEvent } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ibmPlexSans } from "@/lib/fonts";
import {
  MAX_DRAWING_SET_UPLOAD_SIZE_BYTES,
  formatFileSize,
} from "@/lib/drawing-sets";
import { leadsSectionTitleStyle } from "@/components/app/LeadsPagePrimitives";
import { useTakeoffSourceDrawingUpload } from "@/components/app/useTakeoffSourceDrawingUpload";

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
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const {
    inputRef,
    isUploading,
    status,
    error,
    onChooseFile,
    onFileChange,
    uploadFile,
  } = useTakeoffSourceDrawingUpload({
    owner: { kind: "opportunity", slug: opportunityId },
    organizationId,
    projectId,
  });

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
    <div className="flex h-full min-h-[560px] w-full items-center justify-center overflow-auto bg-[var(--background)] px-6 py-10">
      <section className="w-full max-w-[1120px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card-elevated)] md:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] lg:items-stretch">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card-elevated)] md:p-7">
            <div className="space-y-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                Measure workspace
              </p>
              <h3 style={leadsSectionTitleStyle}>Upload plans to start measuring</h3>
              <p className="max-w-[42rem] text-[15px] leading-[1.7] text-[var(--text-secondary)]">
                Add your PDF drawing set to begin takeoff, calibration, and quantity tracking.
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
              className={`mt-6 flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border-2 border-dashed px-6 py-10 transition-colors ${
                isDropZoneActive
                  ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                  : "border-[var(--border)] bg-[var(--surface-muted)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
              } ${isUploading ? "pointer-events-none opacity-70" : "cursor-pointer"}`}
            >
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-[var(--shadow-md)]">
                {isUploading ? (
                  <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2.1} />
                ) : (
                  <CloudUpload className="h-7 w-7" strokeWidth={2.1} />
                )}
              </span>
              <div className="space-y-3 text-center">
                <p className={`${ibmPlexSans.className} text-[1.2rem] font-semibold text-[var(--text-primary)]`}>
                  Drag and drop your PDF plans here
                </p>
                <p className="mx-auto max-w-[34rem] text-sm leading-[1.7] text-[var(--text-secondary)]">
                  Drop in your source drawing set or use the file picker to upload and move straight into the Measure workflow.
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  Supported format: PDF. File size max {formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}
                </p>
              </div>
              <Button
                type="button"
                variant="orange"
                size="default"
                onClick={onChooseFile}
                disabled={isUploading}
                className="h-11 gap-2 rounded-[var(--radius-sm)] px-5 text-sm font-semibold shadow-[var(--shadow-md)]"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {buttonLabel}
              </Button>
            </label>

            <div className="pt-4">
              {status ? <p className="text-sm text-[var(--text-secondary)]">{status}</p> : null}
              {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
            </div>
          </div>

          <aside className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-5 shadow-[var(--shadow-card-elevated)] md:p-6">
            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                What happens next
              </p>
              <p className="text-[15px] leading-[1.7] text-[var(--text-secondary)]">
                Once drawings are uploaded, Measure opens the active plan so your team can calibrate scale and begin takeoff immediately.
              </p>
            </div>

            {[
              {
                step: "01",
                title: "Upload drawings",
                body: "Add the source PDF drawing set for this opportunity.",
              },
              {
                step: "02",
                title: "Calibrate scale",
                body: "Set the page scale so lengths, areas, and counts resolve accurately.",
              },
              {
                step: "03",
                title: "Start measuring",
                body: "Create takeoff measurements and roll them into quantity tracking.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[12px] font-semibold text-[var(--primary)]">
                    {item.step}
                  </span>
                  <div className="space-y-1">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <p className="text-sm leading-[1.6] text-[var(--text-secondary)]">{item.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </aside>
        </div>
      </section>
    </div>
  );
}
