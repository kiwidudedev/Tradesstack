"use client";

import Link from "next/link";
import { ChevronLeft, Eye, ListPlus, MoreHorizontal, Play, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QABuilderMode, QADefinition } from "@/lib/quality-assurance/definitions/types";

export function QABuilderHeader({
  mode,
  definition,
  backHref,
  canWrite,
  statusLabel,
  saveState,
  isDirty,
  canManageLifecycle,
  onOpenToolbox,
  onOpenInspector,
  onPreview,
  onSave,
  onLifecycle,
  onMakeReady,
  onStartQA,
}: {
  mode: QABuilderMode;
  definition: QADefinition;
  backHref: string;
  canWrite: boolean;
  statusLabel: string;
  saveState: "idle" | "saving" | "error";
  isDirty: boolean;
  canManageLifecycle: boolean;
  onOpenToolbox: () => void;
  onOpenInspector: () => void;
  onPreview: () => void;
  onSave: () => void;
  onLifecycle: (action: "archive" | "delete") => void;
  onMakeReady?: () => void;
  onStartQA?: () => void;
}) {
  return (
    <header className="flex min-h-[68px] shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--topbar)] px-3 text-white sm:gap-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-white hover:bg-white/10 hover:text-white sm:h-10 sm:w-10">
          <Link href={backHref} aria-label="Back"><ChevronLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="min-w-0">
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60 sm:block">
            {mode === "company-template" ? "Company QA Template" : "Project QA"}
          </p>
          <p className="max-w-[60px] truncate text-sm font-semibold min-[400px]:max-w-[100px] sm:max-w-[240px] sm:text-base lg:max-w-[360px]">
            {definition.name || "Untitled QA"}
          </p>
          {definition.sourceTemplateName ? <p className="hidden truncate text-[11px] text-white/60 md:block">Created from {definition.sourceTemplateName}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <span className={`hidden text-xs lg:inline ${saveState === "error" ? "text-red-200" : "text-white/70"}`}>{statusLabel}</span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Open field library"
          className="h-8 w-8 text-white hover:bg-white/10 hover:text-white sm:h-9 sm:w-9 xl:hidden"
          onClick={onOpenToolbox}
        >
          <ListPlus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Open settings"
          className="h-8 w-8 text-white hover:bg-white/10 hover:text-white sm:h-9 sm:w-9 xl:hidden"
          onClick={onOpenInspector}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        {mode === "project-qa" && canManageLifecycle ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Project QA actions" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white sm:h-9 sm:w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onLifecycle("archive")}>Archive</DropdownMenuItem>
              {definition.status === "draft" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-[var(--error)]" onSelect={() => onLifecycle("delete")}>Delete unused draft</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button size="sm" variant="secondary" aria-label="Preview QA" className="h-8 w-8 border-0 bg-white/10 px-0 text-white hover:bg-white/15 hover:text-white sm:h-9 sm:w-auto sm:px-3" onClick={onPreview}>
          <Eye className="h-4 w-4" /><span className="hidden md:inline">Preview</span>
        </Button>
        {mode === "project-qa" && definition.status === "draft" && onMakeReady ? <Button size="sm" variant="secondary" className="h-8 bg-white text-[var(--navy-primary)] hover:bg-white/90 sm:h-9" onClick={onMakeReady} disabled={!canWrite || isDirty || saveState === "saving"}><span className="hidden sm:inline">Make Ready</span><span className="sm:hidden">Ready</span></Button> : null}
        {mode === "project-qa" && definition.status === "active" && onStartQA ? <Button size="sm" className="h-8 sm:h-9" onClick={onStartQA} disabled={isDirty || saveState === "saving"}><Play className="h-4 w-4" /><span className="hidden sm:inline">Start QA</span></Button> : null}
        <Button size="sm" aria-label="Save QA" className="h-8 w-8 px-0 sm:h-9 sm:w-auto sm:px-3" onClick={onSave} disabled={!canWrite || !isDirty || saveState === "saving"}>
          <Save className="h-4 w-4" /><span className="hidden sm:inline">{saveState === "saving" ? "Saving..." : "Save"}</span>
        </Button>
      </div>
    </header>
  );
}
