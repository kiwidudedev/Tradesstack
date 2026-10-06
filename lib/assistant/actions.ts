import "server-only";

import type { AssistantActionProposal, AssistantContext } from "./types";

export function proposeAssistantAction(message: string, context: AssistantContext): AssistantActionProposal | null {
  const text = message.trim();
  const lower = text.toLowerCase();
  let kind: AssistantActionProposal["kind"] | null = null;
  let title = "";
  let permission: string | null = null;

  if (/\b(create|draft|prepare)\b.*\b(task|follow[- ]?up|todo)\b/.test(lower)) {
    kind = "create_draft_task";
    title = "Prepare a draft project follow-up task";
    permission = "project_todos.write";
  } else if (/\b(create|draft|prepare)\b.*\b(variation|vo|extra|change)\b/.test(lower)) {
    kind = "create_draft_variation";
    title = "Prepare a draft variation";
    permission = "variations.write";
  } else if (/\b(create|draft|prepare)\b.*\b(po|purchase order)\b/.test(lower)) {
    kind = "create_draft_purchase_order";
    title = "Prepare a draft purchase order";
    permission = "purchase_orders.write";
  } else if (/\b(create|draft|prepare)\b.*\b(qa|quality|hold point)\b/.test(lower)) {
    kind = "create_draft_qa_item";
    title = "Prepare a draft QA follow-up";
    permission = "qa.write";
  } else if (/\b(prepare|generate|compile)\b.*\b(briefing|report)\b/.test(lower)) {
    kind = "prepare_briefing";
    title = "Prepare a project briefing";
  }

  if (!kind) return null;
  const idempotencyKey = `assistant:${kind}:${context.organizationId}:${context.projectId}:${text.toLowerCase().replace(/\s+/g, " ").slice(0, 180)}`;
  return {
    kind,
    status: kind === "prepare_briefing" ? "proposed" : "confirmation_required",
    title,
    summary: kind === "prepare_briefing" ? "The Assistant can prepare this from authorised project evidence." : "This is a draft-only proposal. It must be permission-checked, previewed and explicitly confirmed before any domain action is called.",
    projectId: context.projectId,
    projectSlug: context.projectSlug,
    requiresConfirmation: kind !== "prepare_briefing",
    permission,
    input: { request: text },
    idempotencyKey,
  };
}
