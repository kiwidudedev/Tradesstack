import {
  buildCommercialItemLockedMetadata,
  buildCommercialItemSourceLink,
  buildCommercialItemWorksheetSnapshot,
  buildWorksheetSelectionRangeLabel,
} from "@/lib/commercial-items/snapshot";
import { buildCommercialItemSourceSignature } from "@/lib/commercial-items/source-signature";
import { createCommercialItem, listCommercialItemsForOpportunity } from "@/lib/commercial-items/service";
import type { WorksheetPublishDestinationAdapter } from "@/lib/commercial-items/destination-adapter";
import type {
  PublishedWorksheetCommercialRow,
  PublishedWorksheetCommercialRowWithItem,
  PublishedWorksheetSelection,
} from "@/lib/commercial-items/published-worksheet-selection";
import { detectPublishedWorksheetRows } from "@/lib/commercial-items/worksheet-commercial-row-detection";
import type { CommercialItemsClient } from "@/lib/commercial-items/types";
import type { WorksheetData } from "@/lib/opportunity-pricing-worksheet-defaults";
import type { WorksheetSelectionRange } from "@/lib/opportunity-pricing-worksheet-copy";
import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";
import type { Json } from "@/lib/supabase/types";

function buildReuseKey(params: {
  sourceWorkbookId: string;
  sourceWorksheetId: string;
  sourceSheetId: string;
  sourceRange: string;
  sourceSignature: string;
  projectId: string | null;
}) {
  return [
    params.projectId ?? "no-project",
    params.sourceWorkbookId,
    params.sourceWorksheetId,
    params.sourceSheetId,
    params.sourceRange,
    params.sourceSignature,
  ].join(":");
}

export function buildPublishedWorksheetSelection(params: {
  destination: PublishedWorksheetSelection["destination"];
  worksheet: WorksheetData;
  selectionRange: WorksheetSelectionRange;
  workbookId: string;
  worksheetId: string;
  sheetId: string;
  worksheetName: string;
  sheetName: string;
  owner?: PricingWorksheetOwnerContextValue | null;
}) : PublishedWorksheetSelection {
  const detected = detectPublishedWorksheetRows({
    worksheet: params.worksheet,
    selectionRange: params.selectionRange,
  });

  const commercialRows: PublishedWorksheetCommercialRow[] = detected.commercialRows.map((row) => {
    const snapshot = buildCommercialItemWorksheetSnapshot({
      worksheet: params.worksheet,
      range: row.sourceRange,
      sheetName: params.sheetName,
    });
    const sourceLink = buildCommercialItemSourceLink({
      workbookId: params.workbookId,
      worksheetId: params.worksheetId,
      sheetId: params.sheetId,
      worksheetName: params.worksheetName,
      sheetName: params.sheetName,
      worksheet: params.worksheet,
      range: row.sourceRange,
      owner: params.owner,
    });
    const lockedMetadata = buildCommercialItemLockedMetadata({
      worksheet: params.worksheet,
      range: row.sourceRange,
      sheetName: params.sheetName,
    });
    const sourceSignature = buildCommercialItemSourceSignature({
      workbookId: params.workbookId,
      sheetId: params.sheetId,
      worksheet: params.worksheet,
      range: row.sourceRange,
    });

    return {
      ...row,
      sourceRangeLabel: buildWorksheetSelectionRangeLabel(params.worksheet, row.sourceRange),
      snapshotJson: snapshot as unknown as Json,
      sourceLinkJson: sourceLink as unknown as Json,
      lockedMetadataJson: lockedMetadata as unknown as Json,
      sourceSignature,
    };
  });

  return {
    destination: params.destination,
    selectionRange: params.selectionRange,
    commercialRows,
    skippedRows: detected.skippedRows,
  };
}

async function findOrCreatePublishedCommercialRows(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
  workbookId: string;
  worksheetId: string;
  sheetId: string;
  worksheetName: string;
  sheetName: string;
  worksheet: WorksheetData;
  selection: PublishedWorksheetSelection;
}): Promise<PublishedWorksheetCommercialRowWithItem[]> {
  const existingItems = await listCommercialItemsForOpportunity(params.client, {
    organizationId: params.organizationId,
    opportunityId: params.opportunityId,
  });

  const existingByKey = new Map(
    existingItems
      .filter((item) => item.projectId === (params.projectId ?? null))
      .map((item) => [
        buildReuseKey({
          sourceWorkbookId: item.sourceWorkbookId,
          sourceWorksheetId: item.sourceWorksheetId,
          sourceSheetId: item.sourceSheetId,
          sourceRange: item.sourceRange,
          sourceSignature: item.sourceSignature,
          projectId: item.projectId,
        }),
        item,
      ]),
  );

  const results: PublishedWorksheetCommercialRowWithItem[] = [];

  for (const row of params.selection.commercialRows) {
    const reuseKey = buildReuseKey({
      sourceWorkbookId: params.workbookId,
      sourceWorksheetId: params.worksheetId,
      sourceSheetId: params.sheetId,
      sourceRange: row.sourceRangeLabel,
      sourceSignature: row.sourceSignature,
      projectId: params.projectId,
    });
    const existing = existingByKey.get(reuseKey);

    if (existing) {
      results.push({
        ...row,
        commercialItem: existing,
        reusedCommercialItem: true,
      });
      continue;
    }

    const created = await createCommercialItem(params.client, {
      organizationId: params.organizationId,
      opportunityId: params.opportunityId,
      projectId: params.projectId,
      sourceWorkbookId: params.workbookId,
      sourceWorksheetId: params.worksheetId,
      sourceSheetId: params.sheetId,
      sourceRange: row.sourceRangeLabel,
      sourceSignature: row.sourceSignature,
      sourceVersion: params.worksheet.version,
      sourceStatus: "current",
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      rate: row.rate,
      total: row.total,
      snapshotJson: row.snapshotJson,
      sourceLinkJson: row.sourceLinkJson,
      lockedMetadataJson: row.lockedMetadataJson,
    });

    existingByKey.set(reuseKey, created);
    results.push({
      ...row,
      commercialItem: created,
      reusedCommercialItem: false,
    });
  }

  return results;
}

export async function publishWorksheetSelection<TTarget, TResult>(params: {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
  workbookId: string;
  worksheetId: string;
  sheetId: string;
  worksheetName: string;
  sheetName: string;
  worksheet: WorksheetData;
  selectionRange: WorksheetSelectionRange;
  owner?: PricingWorksheetOwnerContextValue | null;
  selection?: PublishedWorksheetSelection;
  adapter: WorksheetPublishDestinationAdapter<TTarget, TResult>;
  target: TTarget;
}): Promise<{
  publishedSelection: PublishedWorksheetSelection;
  publishedRows: PublishedWorksheetCommercialRowWithItem[];
  result: TResult;
}> {
  const publishedSelection = params.selection ?? buildPublishedWorksheetSelection({
    destination: params.adapter.destination,
    worksheet: params.worksheet,
    selectionRange: params.selectionRange,
    workbookId: params.workbookId,
    worksheetId: params.worksheetId,
    sheetId: params.sheetId,
    worksheetName: params.worksheetName,
    sheetName: params.sheetName,
    owner: params.owner,
  });

  if (publishedSelection.commercialRows.length === 0) {
    throw new Error("No valid commercial rows were found in the selected worksheet rows.");
  }

  const publishedRows = await findOrCreatePublishedCommercialRows({
    client: params.client,
    organizationId: params.organizationId,
    opportunityId: params.opportunityId,
    projectId: params.projectId,
    workbookId: params.workbookId,
    worksheetId: params.worksheetId,
    sheetId: params.sheetId,
    worksheetName: params.worksheetName,
    sheetName: params.sheetName,
    worksheet: params.worksheet,
    selection: publishedSelection,
  });

  const result = await params.adapter.publish({
    client: params.client,
    organizationId: params.organizationId,
    opportunityId: params.opportunityId,
    projectId: params.projectId,
    publishedSelection,
    publishedRows,
    target: params.target,
  });

  return {
    publishedSelection,
    publishedRows,
    result,
  };
}
