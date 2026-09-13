import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const register = readFileSync("components/app/quality-assurance/project/ProjectQARegister.tsx", "utf8");
const detail = readFileSync("components/app/quality-assurance/project/ProjectQADetail.tsx", "utf8");
const record = readFileSync("components/app/quality-assurance/project/ProjectQARecord.tsx", "utf8");
const recordRenderer = readFileSync("components/app/quality-assurance/presentation/RecordQAFieldRenderer.tsx", "utf8");
const responseControls = readFileSync("components/app/quality-assurance/presentation/QAResponseControls.tsx", "utf8");
const header = readFileSync("components/app/quality-assurance/builder/QABuilderHeader.tsx", "utf8");
const contextInspector = readFileSync("components/app/quality-assurance/builder/QAContextInspector.tsx", "utf8");
const recordRoute = readFileSync("app/app/(workspace)/projects/[projectId]/job-management/quality-assurance/[projectQaId]/records/[qaRunId]/page.tsx", "utf8");
const signatureControl = readFileSync("components/app/quality-assurance/project/QARecordOperationalControls.tsx", "utf8");
const signaturePad = readFileSync("components/ui/signature-pad.tsx", "utf8");
const executionActions = readFileSync("lib/quality-assurance/execution/actions.ts", "utf8");

describe("Project QA execution UI contracts", () => {
  it("uses the Project QA register model and preserves legacy QA Activity", () => {
    for (const heading of ["Name", "Status", "Scope", "Records", "Updated", "Actions"]) expect(register).toContain(`>${heading}<`);
    expect(register).toContain("Project QA");
    expect(register).toContain("Existing QA Activity");
    expect(register).toContain("ProjectQualityAssuranceBoard");
    expect(register).not.toContain("QA Plans");
    expect(register).toContain("Continue setup");
    expect(register).toContain("Start QA");
    expect(register).toContain("completedCount");
    expect(register).toContain("inProgressCount");
  });

  it("splits operational detail, edit, and nested QA Record routes", () => {
    expect(detail).toContain("QA in progress");
    expect(detail).toContain("Completed QA");
    expect(detail).toContain("Start QA");
    expect(detail).toContain("Edit QA");
    expect(register).toContain("`${detailHref(id)}/edit`");
    expect(recordRoute).toContain("getProjectQARun");
    expect(recordRoute).toContain('"qa.inspect"');
    expect(recordRoute).not.toContain("inspection");
  });

  it("removes raw project status editing and presents explicit lifecycle actions", () => {
    expect(contextInspector).toContain('mode === "company-template"');
    expect(contextInspector).toContain("Use the builder header to change the Project QA lifecycle");
    expect(header).toContain("Make Ready");
    expect(header).toContain("Start QA");
    expect(header).toContain('mode === "project-qa"');
  });

  it("provides mobile response controls, autosave states, navigation protection, and read-only completion", () => {
    for (const fieldType of ["short_text", "long_text", "number", "measurement", "date", "yes_no", "single_select", "multi_select", "checkbox", "inspection_check", "person", "location", "product_material"]) expect(recordRenderer).toContain(`case "${fieldType}"`);
    for (const fieldType of ["photo", "file", "signature"]) expect(recordRenderer).toContain(`case "${fieldType}"`);
    expect(recordRenderer).toContain("QARecordEvidenceControl");
    expect(recordRenderer).toContain("QARecordSignatureControl");
    expect(responseControls).toContain('"pass"');
    expect(record).toContain("Saving…");
    expect(record).toContain("Save failed");
    expect(record).toContain("Retry save");
    expect(record).toContain('window.addEventListener("beforeunload"');
    expect(record).toContain("protectClientNavigation");
    expect(record).toContain("Complete QA");
    expect(record).toContain("completeProjectQARunAction");
    expect(record).toContain("}, 650)");
    expect(record).toContain("read-only");
    expect(record).toContain("Reload latest record");
    expect(record).toContain("expectedLockVersion: runLockRef.current");
    expect(record).toContain('canVerify={canVerify && run.status === "in_progress"}');
    expect(signatureControl).toContain("props.canVerify ?");
    expect(record).toContain("RecordQAFieldRenderer");
    expect(recordRenderer).not.toContain("saveProjectQAResponseAction");
    expect(recordRenderer).not.toContain("completeProjectQARunAction");
  });

  it("provides an operational drawn signature with a visible typed fallback", () => {
    for (const token of ["Draw signature", "Typed acknowledgement", "Save signature", "Replace signature", "finalizeDrawnProjectQASignatureAction"]) expect(signatureControl).toContain(token);
    for (const token of ["onPointerDown", "onPointerMove", "setPointerCapture", "ResizeObserver", "toBlob", "touchAction: \"none\""]) expect(signaturePad).toContain(token);
  });

  it("keeps inspection editing and Hold Point verification as separate server authorities", () => {
    const responseSave = executionActions.slice(executionActions.indexOf("export async function saveProjectQAResponseAction"), executionActions.indexOf("export async function completeProjectQARunAction"));
    const holdDecision = executionActions.slice(executionActions.indexOf("export async function setProjectQAHoldReleaseAction"), executionActions.indexOf("export async function cancelProjectQARunAction"));
    expect(responseSave).toContain('requireExecutionPermission(input.projectSlug, "qa.inspect")');
    expect(responseSave).not.toContain('"qa.verify"');
    expect(holdDecision).toContain('requireExecutionPermission(input.projectSlug, "qa.verify")');
    expect(holdDecision).not.toContain('"qa.inspect"');
  });
});
