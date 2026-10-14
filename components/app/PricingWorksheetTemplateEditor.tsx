"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OpportunityPricingWorksheetBoard } from "@/components/app/OpportunityPricingWorksheetBoard";
import { PricingWorksheetOwnerProvider } from "@/components/app/PricingWorksheetOwnerProvider";
import { useAuth } from "@/hooks/use-auth";
import {
  loadPricingWorksheetTemplateVersion,
  type PricingWorksheetTemplateVersion,
} from "@/lib/pricing-worksheet-templates";
import { buildPricingWorksheetTemplateOwner } from "@/lib/pricing-worksheet-owner";
import type { OpportunityPricingWorkbook } from "@/lib/opportunity-pricing-workbook";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function buildTemplateWorkbook(version: PricingWorksheetTemplateVersion, userId: string, organizationId: string): OpportunityPricingWorkbook {
  const sheets = [...version.sheets]
    .sort((left, right) => left.sheetOrder - right.sheetOrder)
    .map((sheet) => ({
      createdAt: version.createdAt,
      createdBy: userId,
      extractedPricingData: sheet.extractedPricingData,
      id: sheet.id,
      isDefault: sheet.isDefault,
      name: sheet.name,
      pricingSummary: sheet.pricingSummary,
      sheetOrder: sheet.sheetOrder,
      updatedAt: version.createdAt,
      updatedBy: userId,
      version: sheet.version,
      workbookId: version.id,
      worksheet: sheet.worksheetData,
    }));

  return {
    archivedAt: null,
    createdAt: version.createdAt,
    createdBy: userId,
    id: version.id,
    lastActiveSheetId: sheets.find((sheet) => sheet.isDefault)?.id ?? sheets[0]?.id ?? null,
    legacySheetFallback: false,
    name: version.metadataSnapshot.workbookName as string || "Pricing Worksheet Template",
    opportunityId: null,
    organizationId,
    projectId: null,
    quoteId: null,
    sortOrder: null,
    tradePackage: typeof version.metadataSnapshot.tradePackage === "string" ? version.metadataSnapshot.tradePackage : null,
    updatedAt: version.createdAt,
    updatedBy: userId,
    variationId: null,
    version: version.versionNumber,
    sheets,
  };
}

export function PricingWorksheetTemplateEditor() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const { session, isLoading: isAuthLoading } = useAuth();
  const [templateVersion, setTemplateVersion] = useState<PricingWorksheetTemplateVersion | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => {
    try { return createBrowserSupabaseClient(); } catch { return null; }
  }, []);

  useEffect(() => {
    if (isAuthLoading || !supabase || !session?.organizationId || !params.templateId) return;
    let cancelled = false;
    void loadPricingWorksheetTemplateVersion({
      supabase,
      organizationId: session.organizationId,
      templateId: params.templateId,
    }).then((loaded) => {
      if (!cancelled) {
        setTemplateName(loaded.template.name);
        setTemplateVersion(loaded.version);
      }
    }).catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load template.");
    });
    return () => { cancelled = true; };
  }, [isAuthLoading, params.templateId, session?.organizationId, supabase]);

  const onSaved = useCallback(() => {
    router.push("/app/settings/pricing-worksheet-templates");
  }, [router]);

  if (error) return <div className="p-6"><OperationalAlert variant="error">{error}</OperationalAlert></div>;
  if (!session || !session.organizationId || !session.id || !templateVersion) return <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">Loading template editor...</div>;

  const owner = buildPricingWorksheetTemplateOwner({ organizationId: session.organizationId });
  const workbook = buildTemplateWorkbook(templateVersion, session.id, session.organizationId);

  return (
    <PricingWorksheetOwnerProvider owner={owner}>
      <OpportunityPricingWorksheetBoard
        onClose={() => router.push("/app/settings/pricing-worksheet-templates")}
        templateEditor={{
          templateId: params.templateId,
          versionId: templateVersion.id,
          versionNumber: templateVersion.versionNumber,
          name: templateName ?? undefined,
          workbook,
          inputManifest: templateVersion.inputManifest,
          onSaved,
        }}
      />
    </PricingWorksheetOwnerProvider>
  );
}
