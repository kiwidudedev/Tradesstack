import type { StructuredInterpretationRequest, StructuredInterpretationResult } from "@/lib/document-intelligence/contracts";
import { interpretStructuredDocumentWithAnthropic } from "@/lib/document-intelligence/providers/anthropic";

export type StructuredDocumentProvider = "anthropic";

export type StructuredDocumentInterpreter = (
  request: StructuredInterpretationRequest
) => Promise<StructuredInterpretationResult>;

const PROVIDERS: Record<StructuredDocumentProvider, StructuredDocumentInterpreter> = {
  anthropic: interpretStructuredDocumentWithAnthropic,
};

export function interpretStructuredDocument(
  provider: StructuredDocumentProvider,
  request: StructuredInterpretationRequest
) {
  return PROVIDERS[provider](request);
}
