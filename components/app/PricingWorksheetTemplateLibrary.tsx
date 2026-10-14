"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ChevronDown, Copy, Edit3, FileSpreadsheet, Plus, Search, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { createDefaultWorksheetData, createDefaultWorksheetExtractedPricingData, createDefaultWorksheetPricingSummary } from "@/lib/opportunity-pricing-worksheet-defaults";
import { archivePricingWorksheetTemplate, createBlankPricingWorksheetTemplate, duplicatePricingWorksheetTemplate, listPricingWorksheetTemplates, updatePricingWorksheetTemplateMetadata, type PricingWorksheetTemplate } from "@/lib/pricing-worksheet-templates";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PricingWorksheetTemplateLibrary() {
  const router = useRouter();
  const { session } = useAuth();
  const [templates, setTemplates] = useState<PricingWorksheetTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PricingWorksheetTemplate | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const supabase = useMemo(() => {
    try { return createBrowserSupabaseClient(); } catch { return null; }
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !session?.organizationId) return;
    setIsLoading(true);
    setError(null);
    try {
      setTemplates(await listPricingWorksheetTemplates({ supabase, organizationId: session.organizationId, includeArchived: true }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load templates.");
    } finally { setIsLoading(false); }
  }, [session?.organizationId, supabase]);

  useEffect(() => { void load(); }, [load]);

  const categories = Array.from(new Set(templates.filter((template) => template.status === "active").map((template) => template.category).filter(Boolean))) as string[];
  const filtered = templates.filter((template) => {
    const haystack = `${template.name} ${template.category ?? ""} ${template.description ?? ""}`.toLowerCase();
    const statusMatches = category === "archived" ? template.status === "archived" : template.status === "active";
    const categoryMatches = category === "all" || category === "archived" || template.category === category;
    return statusMatches && haystack.includes(search.trim().toLowerCase()) && categoryMatches;
  });

  const archive = async (template: PricingWorksheetTemplate) => {
    if (!supabase || !session?.organizationId || !session.id) return;
    setBusyId(template.id);
    try {
      await archivePricingWorksheetTemplate({ supabase, organizationId: session.organizationId, templateId: template.id, userId: session.id });
      await load();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to archive template.");
    } finally { setBusyId(null); }
  };

  const saveMetadata = async () => {
    if (!editing || !supabase || !session?.organizationId || !session.id) return;
    setBusyId(editing.id);
    try {
      await updatePricingWorksheetTemplateMetadata({ supabase, organizationId: session.organizationId, templateId: editing.id, userId: session.id, name: editName, category: editCategory, description: editDescription });
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update template.");
    } finally { setBusyId(null); }
  };

  const duplicate = async (template: PricingWorksheetTemplate) => {
    if (!supabase || !session?.organizationId || !session.id) return;
    setBusyId(template.id);
    try {
      await duplicatePricingWorksheetTemplate({ supabase, organizationId: session.organizationId, templateId: template.id, userId: session.id, requestId: crypto.randomUUID() });
      await load();
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Unable to duplicate template.");
    } finally { setBusyId(null); }
  };

  const createBlankTemplate = async () => {
    if (!supabase || !session?.organizationId || !session.id) return;
    const name = createName.trim();
    if (!name) return;
    setBusyId("create");
    setError(null);
    try {
      const worksheet = createDefaultWorksheetData({ sheetName: "New Worksheet" });
      const result = await createBlankPricingWorksheetTemplate({
        supabase,
        organizationId: session.organizationId,
        userId: session.id,
        name,
        category: createCategory.trim() || null,
        description: createDescription.trim() || null,
        sheets: [{
          name: worksheet.sheetName,
          sheetOrder: 0,
          isDefault: true,
          worksheetData: worksheet,
          pricingSummary: createDefaultWorksheetPricingSummary(),
          extractedPricingData: createDefaultWorksheetExtractedPricingData(worksheet.version),
          version: worksheet.version,
        }],
        inputManifest: [],
        requestId: crypto.randomUUID(),
      });
      setIsCreateDialogOpen(false);
      setCreateName("");
      setCreateCategory("");
      setCreateDescription("");
      router.push(`/app/settings/pricing-worksheet-templates/${result.template.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create template.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader title="Pricing Worksheet Templates" description="Manage reusable company estimating workbooks." actions={<Button type="button" onClick={() => setIsCreateDialogOpen(true)} disabled={Boolean(busyId)}><Plus className="mr-2 h-4 w-4" />New blank template</Button>} />
      {error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--text-secondary)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" className="pl-9" /></div>
        <div className="relative w-full shrink-0 sm:w-64">
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full appearance-none rounded-[10px] border border-[var(--border)] bg-white px-4 pr-11 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]">
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="archived">Archived</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" strokeWidth={1.75} />
        </div>
      </div>
      {isLoading ? <p className="py-10 text-center text-sm text-[var(--text-secondary)]">Loading templates...</p> : null}
      {!isLoading && filtered.length === 0 ? <OperationalEmptyState title="No pricing worksheet templates" description="Save a worksheet as a template to make it available to your company." /> : null}
      {!isLoading && filtered.length > 0 ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((template) => <div key={template.id} className={`rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-5 ${template.status === "archived" ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--surface-muted)]"><FileSpreadsheet className="h-5 w-5" /></div><span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">{template.status === "archived" ? "Archived" : template.category ?? "Uncategorised"}</span></div><h2 className="mt-4 font-semibold text-[var(--text-primary)]">{template.name}</h2>{template.description ? <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{template.description}</p> : null}<p className="mt-4 text-xs text-[var(--text-secondary)]">Updated {new Date(template.updatedAt).toLocaleDateString("en-NZ")}</p>{template.status === "active" ? <div className="mt-4 grid grid-cols-4 gap-2"><Button type="button" variant="secondary" title="Edit template spreadsheet" aria-label="Edit spreadsheet" className="h-10 w-full px-0" onClick={() => router.push(`/app/settings/pricing-worksheet-templates/${template.id}`)} disabled={busyId === template.id}><Edit3 className="h-4 w-4 shrink-0" /><span className="sr-only">Edit spreadsheet</span></Button><Button type="button" variant="secondary" title="Edit template details" aria-label="Edit details" className="h-10 w-full px-0" onClick={() => { setEditing(template); setEditName(template.name); setEditCategory(template.category ?? ""); setEditDescription(template.description ?? ""); }} disabled={busyId === template.id}><Settings2 className="h-4 w-4 shrink-0" /><span className="sr-only">Edit details</span></Button><Button type="button" variant="secondary" title="Duplicate template" aria-label="Duplicate" className="h-10 w-full px-0" onClick={() => void duplicate(template)} disabled={busyId === template.id}><Copy className="h-4 w-4 shrink-0" /><span className="sr-only">Duplicate</span></Button><Button type="button" variant="secondary" title="Archive template" aria-label="Archive" className="h-10 w-full px-0" onClick={() => void archive(template)} disabled={busyId === template.id}><Archive className="h-4 w-4 shrink-0" /><span className="sr-only">Archive</span></Button></div> : null}</div>)}</div> : null}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="w-[min(92vw,34rem)] max-w-[34rem] rounded-[20px] p-6 sm:p-7">
          <DialogHeader className="pr-10">
            <DialogTitle className="text-xl">Edit template details</DialogTitle>
          </DialogHeader>
          <div className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Name
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-2 h-11" />
            </label>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Category
              <Input value={editCategory} onChange={(event) => setEditCategory(event.target.value)} className="mt-2 h-11" />
            </label>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Description
              <Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="mt-2 min-h-24 resize-y" />
            </label>
          </div>
          <DialogFooter className="mt-7 gap-2 border-t border-[var(--border)] pt-5">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" onClick={() => void saveMetadata()} disabled={!editName.trim() || Boolean(busyId)}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="w-[min(92vw,34rem)] max-w-[34rem] rounded-[20px] p-6 sm:p-7">
          <DialogHeader className="pr-10">
            <DialogTitle className="text-xl">Create blank template</DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">Start with a blank pricing worksheet and build the reusable workbook in the same editor used for job estimates.</p>
          <div className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Name
              <Input autoFocus value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="e.g. Suspended ceilings" className="mt-2 h-11" />
            </label>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Category <span className="font-normal text-[var(--text-secondary)]">(optional)</span>
              <Input value={createCategory} onChange={(event) => setCreateCategory(event.target.value)} placeholder="e.g. Ceilings" className="mt-2 h-11" />
            </label>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Description <span className="font-normal text-[var(--text-secondary)]">(optional)</span>
              <Textarea value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="What is this template used for?" className="mt-2 min-h-24 resize-y" />
            </label>
          </div>
          <DialogFooter className="mt-7 gap-2 border-t border-[var(--border)] pt-5">
            <Button type="button" variant="secondary" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => void createBlankTemplate()} disabled={!createName.trim() || busyId === "create"}>{busyId === "create" ? "Creating..." : "Create template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
