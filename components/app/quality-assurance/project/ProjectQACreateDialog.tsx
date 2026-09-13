"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { createBlankProjectQAAction, createProjectQAFromTemplateAction } from "@/lib/quality-assurance/definitions/actions";
import type { QARegisterRow } from "@/lib/quality-assurance/definitions/server";

type CreateStep = "start" | "template" | "blank";

export type ProjectQACreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  templates: QARegisterRow[];
  canViewTemplates: boolean;
  canManageTemplates: boolean;
};

export function ProjectQACreateDialog({
  open,
  onOpenChange,
  projectSlug,
  templates,
  canViewTemplates,
  canManageTemplates,
}: ProjectQACreateDialogProps) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [step, setStep] = useState<CreateStep>("start");
  const [templateId, setTemplateId] = useState("");
  const [unavailableTemplateIds, setUnavailableTemplateIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const availableTemplates = templates.filter((template) => template.status === "active" && !unavailableTemplateIds.includes(template.id));
  const selectedTemplate = availableTemplates.find((template) => template.id === templateId) ?? null;
  const editHref = (id: string) => `/app/projects/${projectSlug}/job-management/quality-assurance/${id}/edit`;

  const reset = () => {
    submittingRef.current = false;
    setStep("start");
    setTemplateId("");
    setUnavailableTemplateIds([]);
    setName("");
    setDescription("");
    setError(null);
    setSubmitting(false);
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && submittingRef.current) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const showTemplateStep = () => {
    const firstTemplate = availableTemplates[0];
    setError(null);
    setStep("template");
    if (firstTemplate) {
      setTemplateId(firstTemplate.id);
      setName(firstTemplate.name);
    }
  };

  const showBlankStep = () => {
    setError(null);
    setStep("blank");
    setName("");
    setDescription("");
  };

  const selectTemplate = (nextTemplate: QARegisterRow) => {
    const previousTemplateName = selectedTemplate?.name ?? "";
    setTemplateId(nextTemplate.id);
    setName((currentName) => !currentName.trim() || currentName === previousTemplateName ? nextTemplate.name : currentName);
    setError(null);
  };

  const goBack = () => {
    setError(null);
    setStep("start");
  };

  const create = async () => {
    if (submittingRef.current) return;
    if (step === "template" && !templateId) return;
    if (step === "blank" && !name.trim()) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const result = step === "template"
      ? await createProjectQAFromTemplateAction({ projectSlug, templateId, name: name.trim() || undefined })
      : await createBlankProjectQAAction({ projectSlug, name: name.trim(), description: description.trim() });

    if (!result.ok) {
      const staleTemplate = step === "template" && /active qa template not found/i.test(result.error);
      if (staleTemplate) {
        setUnavailableTemplateIds((current) => current.includes(templateId) ? current : [...current, templateId]);
        const nextTemplate = availableTemplates.find((template) => template.id !== templateId);
        setTemplateId(nextTemplate?.id ?? "");
        setError(nextTemplate
          ? "That company template is no longer active. Select another template and try again."
          : "That company template is no longer active. Go back to start this Project QA blank.");
      } else {
        setError(result.error);
      }
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    onOpenChange(false);
    router.push(editHref(result.data.id));
    submittingRef.current = false;
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>Create Project QA</DialogTitle>
          <DialogDescription>
            {step === "start" ? "How would you like to start?" : step === "template" ? "Choose a reusable company QA template." : "Create a QA specifically for this project."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-5">
          {error ? <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">{error}</p> : null}

          {step === "start" ? <div className="space-y-3">
            {canViewTemplates ? <button type="button" className="flex min-h-20 w-full items-center gap-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4 text-left transition-colors hover:border-[var(--brand-blue)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2" onClick={showTemplateStep}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"><Building2 aria-hidden className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-[var(--text-primary)]">Use Company Template</span><span className="mt-1 block text-sm text-[var(--text-secondary)]">Start from one of your reusable company QA templates.</span></span>
            </button> : null}
            <button type="button" className="flex min-h-20 w-full items-center gap-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4 text-left transition-colors hover:border-[var(--brand-blue)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2" onClick={showBlankStep}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"><FilePlus2 aria-hidden className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-[var(--text-primary)]">Start Blank</span><span className="mt-1 block text-sm text-[var(--text-secondary)]">Create a QA specifically for this project.</span></span>
            </button>
            {!canViewTemplates ? <p className="text-sm text-[var(--text-muted)]">You do not have access to Company QA Templates.</p> : null}
          </div> : null}

          {step === "template" ? <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">Select Company QA Template</h3>
              {availableTemplates.length ? <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Company QA Template">
                {availableTemplates.map((template) => {
                  const selected = template.id === templateId;
                  return <label key={template.id} className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-[var(--brand-blue)] focus-within:ring-offset-2 ${selected ? "bg-[var(--surface-muted)]" : "bg-white hover:bg-[var(--surface-subtle)]"}`}>
                    <Radio name="project-qa-template" value={template.id} checked={selected} onChange={() => selectTemplate(template)} className="shrink-0" />
                    <span className="min-w-0 font-medium text-[var(--text-primary)]">{template.name}</span>
                  </label>;
                })}
              </div> : <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] p-5 text-center">
                <p className="font-semibold text-[var(--text-primary)]">No active company QA templates</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{canManageTemplates ? "Create reusable templates in Settings → QA Templates, or start this Project QA from scratch." : "Ask a company QA template manager to make a template available, or start this Project QA from scratch."}</p>
              </div>}
            </div>

            {availableTemplates.length ? <div><label className="mb-1 block text-[13px] font-semibold" htmlFor="project-qa-name">Project QA Name</label><Input id="project-qa-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={selectedTemplate?.name ?? "Project QA name"} /></div> : null}
          </div> : null}

          {step === "blank" ? <div className="space-y-4">
            <div><label className="mb-1 block text-[13px] font-semibold" htmlFor="blank-project-qa-name">Name</label><Input id="blank-project-qa-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></div>
            <div><label className="mb-1 block text-[13px] font-semibold" htmlFor="blank-project-qa-description">Description</label><Textarea id="blank-project-qa-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
          </div> : null}
        </div>

        {step !== "start" ? <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={goBack} disabled={submitting}>Back</Button>
          {step === "template" && !availableTemplates.length ? <>
            <Button variant="outline" asChild><Link href="/app/settings/qa-templates">Company QA Templates</Link></Button>
            <Button variant="orange" onClick={showBlankStep}>Start Blank</Button>
          </> : <Button variant="orange" onClick={create} disabled={submitting || (step === "template" ? !templateId : !name.trim())}>{submitting ? "Creating…" : "Create Project QA"}</Button>}
        </DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
