import type { CommercialItemsClient } from "@/lib/commercial-items/types";
import type {
  PublishedWorksheetCommercialRowWithItem,
  PublishedWorksheetSelection,
} from "@/lib/commercial-items/published-worksheet-selection";

export interface WorksheetPublishDestinationContext {
  client: CommercialItemsClient;
  organizationId: string;
  opportunityId: string;
  projectId: string | null;
}

export interface WorksheetPublishDestinationAdapter<TTarget, TResult> {
  destination: PublishedWorksheetSelection["destination"];
  publishSelection?(input: WorksheetPublishDestinationContext & {
    workbookId: string;
    worksheetId: string;
    sheetId: string;
    worksheetVersion: number;
    publishedSelection: PublishedWorksheetSelection;
    target: TTarget;
  }): Promise<{
    publishedRows: PublishedWorksheetCommercialRowWithItem[];
    result: TResult;
  }>;
  publish(input: WorksheetPublishDestinationContext & {
    publishedSelection: PublishedWorksheetSelection;
    publishedRows: PublishedWorksheetCommercialRowWithItem[];
    target: TTarget;
  }): Promise<TResult>;
}
