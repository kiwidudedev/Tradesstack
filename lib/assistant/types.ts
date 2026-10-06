import "server-only";

export type AssistantProviderName = "openai" | "anthropic";

export type AssistantCitation = {
  entityType: string;
  entityId: string;
  label: string;
  href: string;
  projectId: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AssistantContext = {
  organizationId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  route: string | null;
  module: string | null;
  recordId: string | null;
  mode?: AssistantRoleMode;
};

export type AssistantRoleMode = "pm" | "qs" | "estimator" | "procurement" | "qa" | "accounts" | "auto";

export type AssistantActionKind =
  | "create_draft_task"
  | "create_draft_variation"
  | "create_draft_purchase_order"
  | "create_draft_qa_item"
  | "prepare_briefing";

export type AssistantActionProposal = {
  kind: AssistantActionKind;
  status: "proposed" | "confirmation_required" | "denied" | "unsupported";
  title: string;
  summary: string;
  projectId: string;
  projectSlug: string;
  requiresConfirmation: boolean;
  permission: string | null;
  input: Record<string, unknown>;
  idempotencyKey: string;
};

export type AssistantToolResult = {
  toolName: string;
  sourceService: string;
} & (
  | {
      status: "ok";
      data: unknown;
      citations: AssistantCitation[];
      truncated: boolean;
      returnedRows: number;
      totalRows: number | null;
      asOf: string;
    }
  | {
      status: "empty";
      data: [];
      citations: [];
      truncated: false;
      returnedRows: 0;
      totalRows: 0;
      asOf: string;
    }
  | {
      status: "denied" | "unavailable";
      reasonCode: string;
      safeMessage: string;
    }
  | {
      status: "failed";
      errorCode: string;
      safeMessage: string;
      diagnosticId: string;
    }
);

export type AssistantToolExecutionStatus =
  | "requested"
  | "started"
  | "succeeded"
  | "empty"
  | "denied"
  | "failed"
  | "truncated";

export type AssistantReadToolDefinition = {
  name: string;
  description: string;
  domain: string;
  sourceService: string;
  requiredPermission: string | null;
  projectScoped: boolean;
  organizationScoped: boolean;
  readOnly: true;
  maxRows: number;
};

export type AssistantProviderRequest = {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context: unknown;
  model?: string | null;
  signal?: AbortSignal;
};

export type AssistantProviderStream = {
  response: Response;
  provider: AssistantProviderName;
  model: string;
};
