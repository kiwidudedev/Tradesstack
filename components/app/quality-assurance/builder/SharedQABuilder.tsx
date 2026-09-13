"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QAActionResult } from "@/lib/quality-assurance/definitions/actions";
import { normalizeDefinition } from "@/lib/quality-assurance/definitions/model";
import type {
  QABuilderMode,
  QADefinition,
  QAFieldDefinition,
  QAFieldType,
  QASectionDefinition,
} from "@/lib/quality-assurance/definitions/types";
import {
  addFieldFromToolboxState,
  addFieldToSectionState,
  addSectionState,
  deleteFieldState,
  deleteSectionState,
  duplicateFieldState,
  duplicateSectionState,
  moveFieldState,
  moveSectionState,
  reorderFieldState,
  updateFieldState,
  updateSectionState,
  type MobileBuilderPanel,
  type QABuilderEditResult,
  type QABuilderSelection,
} from "./builder-state";
import { QABuilderHeader } from "./QABuilderHeader";
import type { QABuilderScrollTarget } from "./QABuilderCanvas";
import { QABuilderWorkspace } from "./QABuilderWorkspace";
import { QAPreview } from "./QAPreview";

export function SharedQABuilder({ mode, initialDefinition, backHref, canWrite, onSave, onLifecycle, onMakeReady, onStartQA, initialPreview = false }: {
  mode: QABuilderMode;
  initialDefinition: QADefinition;
  backHref: string;
  canWrite: boolean;
  onSave: (definition: QADefinition) => Promise<QAActionResult<{ version: number }>>;
  initialPreview?: boolean;
  onLifecycle?: (action: "archive" | "delete") => Promise<QAActionResult>;
  onMakeReady?: () => Promise<QAActionResult<{ version: number }>>;
  onStartQA?: () => void;
}) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [selection, setSelectionState] = useState<QABuilderSelection>({ type: "template" });
  const [mobilePanel, setMobilePanel] = useState<MobileBuilderPanel>(null);
  const [isWideWorkspace, setIsWideWorkspace] = useState(false);
  const [isDirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [preview, setPreview] = useState(initialPreview);
  const [scrollTarget, setScrollTarget] = useState<QABuilderScrollTarget | null>(null);
  const definitionRef = useRef(definition);
  const selectionRef = useRef(selection);
  const isWideRef = useRef(isWideWorkspace);
  const scrollRequestRef = useRef(0);

  const setSelection = useCallback((next: QABuilderSelection) => {
    selectionRef.current = next;
    setSelectionState(next);
  }, []);

  const commit = useCallback((result: QABuilderEditResult | null) => {
    if (!result || !canWrite) return false;
    definitionRef.current = result.definition;
    selectionRef.current = result.selection;
    setDefinition(result.definition);
    setSelectionState(result.selection);
    setDirty(true);
    setSaveState("idle");
    setSaveError(null);
    return true;
  }, [canWrite]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const sync = () => {
      isWideRef.current = query.matches;
      setIsWideWorkspace(query.matches);
      if (query.matches) setMobilePanel(null);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!isDirty || event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || event.metaKey || event.ctrlKey) return;
      if (anchor.href !== window.location.href && !window.confirm("You have unsaved QA changes. Leave and discard them?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    let restoring = false;
    const popState = () => {
      if (restoring) { restoring = false; return; }
      if (!window.confirm("You have unsaved QA changes. Leave and discard them?")) {
        restoring = true;
        window.history.forward();
      }
    };
    window.addEventListener("popstate", popState);
    return () => window.removeEventListener("popstate", popState);
  }, [isDirty]);

  const selectedSection = useMemo(() => {
    if (selection.type === "template") return null;
    return definition.sections.find((section) => section.id === selection.sectionId) ?? null;
  }, [definition, selection]);

  const selectedField = useMemo(() => {
    if (selection.type !== "field") return null;
    return selectedSection?.fields.find((field) => field.id === selection.fieldId) ?? null;
  }, [selectedSection, selection]);

  const openInspectorOnNarrowScreen = useCallback(() => {
    if (!isWideRef.current) setMobilePanel("inspector");
  }, []);

  const queueCanvasScroll = useCallback((kind: "section" | "field", id: string) => {
    scrollRequestRef.current += 1;
    setScrollTarget({ kind, id, requestId: scrollRequestRef.current, focusSelection: kind === "field" && isWideRef.current });
  }, []);

  const focusSectionTitleOnWideScreen = useCallback(() => {
    if (!isWideRef.current) return;
    window.requestAnimationFrame(() => document.getElementById("qa-section-title")?.focus());
  }, []);

  const clearCanvasScroll = useCallback(() => setScrollTarget(null), []);

  const updateTemplate = useCallback((next: QADefinition) => {
    commit({ definition: next, selection: selectionRef.current });
  }, [commit]);

  const addSection = useCallback(() => {
    const result = addSectionState(definitionRef.current);
    if (!commit(result) || result.selection.type !== "section") return;
    queueCanvasScroll("section", result.selection.sectionId);
    openInspectorOnNarrowScreen();
    focusSectionTitleOnWideScreen();
  }, [commit, focusSectionTitleOnWideScreen, openInspectorOnNarrowScreen, queueCanvasScroll]);

  const updateSection = useCallback((section: QASectionDefinition) => {
    commit(updateSectionState(definitionRef.current, selectionRef.current, section));
  }, [commit]);

  const moveSection = useCallback((sectionIndex: number, direction: -1 | 1) => {
    commit(moveSectionState(definitionRef.current, selectionRef.current, sectionIndex, direction));
  }, [commit]);

  const duplicateSection = useCallback((sectionIndex: number) => {
    if (commit(duplicateSectionState(definitionRef.current, sectionIndex))) openInspectorOnNarrowScreen();
  }, [commit, openInspectorOnNarrowScreen]);

  const deleteSection = useCallback((sectionIndex: number) => {
    if (!canWrite) return;
    const section = definitionRef.current.sections[sectionIndex];
    if (!section || !window.confirm(`Delete section “${section.title}” and its fields?`)) return;
    commit(deleteSectionState(definitionRef.current, selectionRef.current, sectionIndex));
  }, [canWrite, commit]);

  const addFieldFromToolbox = useCallback((fieldType: QAFieldType, label: string) => {
    const result = addFieldFromToolboxState(definitionRef.current, selectionRef.current, fieldType, label);
    if (!commit(result) || !result || result.selection.type !== "field") return;
    queueCanvasScroll("field", result.selection.fieldId);
    openInspectorOnNarrowScreen();
  }, [commit, openInspectorOnNarrowScreen, queueCanvasScroll]);

  const addField = useCallback((sectionId: string, fieldType: QAFieldType, label: string) => {
    const result = addFieldToSectionState(definitionRef.current, sectionId, fieldType, label);
    if (!commit(result) || !result || result.selection.type !== "field") return;
    queueCanvasScroll("field", result.selection.fieldId);
    openInspectorOnNarrowScreen();
  }, [commit, openInspectorOnNarrowScreen, queueCanvasScroll]);

  const updateField = useCallback((field: QAFieldDefinition) => {
    const currentSelection = selectionRef.current;
    if (currentSelection.type !== "field") return;
    commit(updateFieldState(definitionRef.current, currentSelection, currentSelection.sectionId, field));
  }, [commit]);

  const moveField = useCallback((sectionId: string, fieldIndex: number, direction: -1 | 1) => {
    commit(moveFieldState(definitionRef.current, selectionRef.current, sectionId, fieldIndex, direction));
  }, [commit]);

  const reorderField = useCallback((sectionId: string, fromIndex: number, toIndex: number) => {
    commit(reorderFieldState(definitionRef.current, selectionRef.current, sectionId, fromIndex, toIndex));
  }, [commit]);

  const duplicateField = useCallback((sectionId: string, fieldIndex: number) => {
    if (commit(duplicateFieldState(definitionRef.current, sectionId, fieldIndex))) openInspectorOnNarrowScreen();
  }, [commit, openInspectorOnNarrowScreen]);

  const deleteField = useCallback((sectionId: string, fieldId: string) => {
    commit(deleteFieldState(definitionRef.current, selectionRef.current, sectionId, fieldId));
  }, [commit]);

  const selectTemplate = useCallback(() => setSelection({ type: "template" }), [setSelection]);
  const selectSection = useCallback((sectionId: string) => {
    setSelection({ type: "section", sectionId });
    openInspectorOnNarrowScreen();
  }, [openInspectorOnNarrowScreen, setSelection]);
  const selectField = useCallback((sectionId: string, fieldId: string) => {
    setSelection({ type: "field", sectionId, fieldId });
    openInspectorOnNarrowScreen();
  }, [openInspectorOnNarrowScreen, setSelection]);

  const save = async () => {
    if (!canWrite || saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);
    const normalized = normalizeDefinition(definitionRef.current);
    const result = await onSave(normalized);
    if (!result.ok) {
      setSaveState("error");
      setSaveError(result.error);
      return;
    }
    const savedDefinition = { ...normalized, definitionVersion: result.data.version };
    definitionRef.current = savedDefinition;
    setDefinition(savedDefinition);
    setDirty(false);
    setSaveState("idle");
    setLastSavedAt(new Date().toISOString());
  };

  const lifecycle = async (action: "archive" | "delete") => {
    const verb = action === "archive" ? "Archive" : "Delete";
    const currentDefinition = definitionRef.current;
    if (!onLifecycle || !window.confirm(`${verb} “${currentDefinition.name}”?${isDirty ? " Unsaved changes will be discarded." : ""}`)) return;
    setSaveState("saving");
    setSaveError(null);
    const result = await onLifecycle(action);
    if (!result.ok) {
      setSaveState("error");
      setSaveError(result.error);
      return;
    }
    setDirty(false);
    window.setTimeout(() => window.location.assign(backHref), 0);
  };

  const makeReady = async () => {
    if (!onMakeReady || isDirty || saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);
    const result = await onMakeReady();
    if (!result.ok) { setSaveState("error"); setSaveError(result.error); return; }
    window.location.assign(backHref);
  };

  const statusLabel = saveState === "saving"
    ? "Saving..."
    : saveState === "error"
      ? "Save failed"
      : isDirty
        ? "Unsaved changes"
        : lastSavedAt
          ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}`
          : "Saved";

  return <div className="fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-[var(--background)] font-[family-name:var(--font-ibm-plex-sans)]">
    <QABuilderHeader
      mode={mode}
      definition={definition}
      backHref={backHref}
      canWrite={canWrite}
      statusLabel={statusLabel}
      saveState={saveState}
      isDirty={isDirty}
      canManageLifecycle={Boolean(canWrite && onLifecycle)}
      onOpenToolbox={() => setMobilePanel("toolbox")}
      onOpenInspector={() => setMobilePanel("inspector")}
      onPreview={() => setPreview(true)}
      onSave={() => void save()}
      onLifecycle={(action) => void lifecycle(action)}
      onMakeReady={onMakeReady ? () => void makeReady() : undefined}
      onStartQA={onStartQA}
    />
    {saveError ? <div role="alert" className="shrink-0 border-b border-[var(--error-light)] bg-[var(--error-light)] px-5 py-2 text-sm text-[var(--error)]">{saveError}{isDirty ? " Your local changes have been kept." : ""}</div> : null}
    <QABuilderWorkspace
      definition={definition}
      mode={mode}
      selection={selection}
      selectedSection={selectedSection}
      selectedField={selectedField}
      canWrite={canWrite}
      isWide={isWideWorkspace}
      mobilePanel={mobilePanel}
      onMobilePanelChange={setMobilePanel}
      onSelectTemplate={selectTemplate}
      onSelectSection={selectSection}
      onSelectField={selectField}
      onUpdateTemplate={updateTemplate}
      onAddSection={addSection}
      onUpdateSection={updateSection}
      onMoveSection={moveSection}
      onDuplicateSection={duplicateSection}
      onDeleteSection={deleteSection}
      onAddFieldFromToolbox={addFieldFromToolbox}
      onAddField={addField}
      onUpdateField={updateField}
      onMoveField={moveField}
      onReorderField={reorderField}
      onDuplicateField={duplicateField}
      onDeleteField={deleteField}
      scrollTarget={scrollTarget}
      onScrollHandled={clearCanvasScroll}
    />
    <QAPreview definition={definition} open={preview} onOpenChange={setPreview} />
  </div>;
}
