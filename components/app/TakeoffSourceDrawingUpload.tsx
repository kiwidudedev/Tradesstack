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
import styles from "@/components/app/trade-pack-builder.module.css";
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
    opportunityId,
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
    <div className="flex h-full min-h-[560px] w-full items-center justify-center overflow-auto bg-[radial-gradient(circle_at_top,_rgba(241,90,41,0.10),_transparent_32%),linear-gradient(180deg,#FBFEFE_0%,#F4F7FB_100%)] px-6 py-10">
      <section className="w-full max-w-[1120px] rounded-[24px] border border-[#E2E8F1] bg-[rgba(251,254,254,0.96)] p-6 shadow-[0_24px_64px_rgba(15,23,42,0.08)] backdrop-blur-sm md:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] lg:items-stretch">
          <div className="rounded-[20px] border border-[#D9E3EE] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] md:p-7">
            <div className="space-y-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#F15A29]">
                Measure workspace
              </p>
              <h3 style={leadsSectionTitleStyle}>Upload plans to start measuring</h3>
              <p className="max-w-[42rem] text-[15px] leading-[1.7] text-[#6B7C93]">
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
              className={`${styles.dropZone} ${isDropZoneActive ? styles.dropZoneActive : ""} mt-6 min-h-[360px] rounded-[18px] border-[#F3C6B5] bg-[linear-gradient(180deg,#FFF8F4_0%,#FFFDFB_100%)] px-6 py-10 ${
                isUploading ? "pointer-events-none opacity-70" : "cursor-pointer"
              }`}
            >
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#F15A29] text-white shadow-[0_10px_24px_rgba(241,90,41,0.28)]">
                {isUploading ? (
                  <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2.1} />
                ) : (
                  <CloudUpload className="h-7 w-7" strokeWidth={2.1} />
                )}
              </span>
              <div className="space-y-3 text-center">
                <p className={`${ibmPlexSans.className} text-[1.2rem] font-semibold text-[#111827]`}>
                  Drag and drop your PDF plans here
                </p>
                <p className="mx-auto max-w-[34rem] text-sm leading-[1.7] text-[#6B7C93]">
                  Drop in your source drawing set or use the file picker to upload and move straight into the Measure workflow.
                </p>
                <p className="text-sm text-[#7A7F87]">
                  Supported format: PDF. File size max {formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}
                </p>
              </div>
              <Button
                type="button"
                variant="orange"
                size="default"
                onClick={onChooseFile}
                disabled={isUploading}
                className="h-11 gap-2 rounded-[10px] px-5 text-sm font-semibold shadow-[0_10px_24px_rgba(241,90,41,0.22)]"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {buttonLabel}
              </Button>
            </label>

            <div className="pt-4">
              {status ? <p className="text-sm text-[#6B7C93]">{status}</p> : null}
              {error ? <p className="text-sm text-[#9A3412]">{error}</p> : null}
            </div>
          </div>

          <aside className="flex flex-col gap-4 rounded-[20px] border border-[#D9E3EE] bg-[#F8FAFC] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] md:p-6">
            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A94A6]">
                What happens next
              </p>
              <p className="text-[15px] leading-[1.7] text-[#4B5D79]">
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
                className="rounded-[16px] border border-[#E2E8F1] bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF1EB] text-[12px] font-semibold text-[#F15A29]">
                    {item.step}
                  </span>
                  <div className="space-y-1">
                    <p className="text-[15px] font-semibold text-[#111827]">{item.title}</p>
                    <p className="text-sm leading-[1.6] text-[#6B7C93]">{item.body}</p>
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
