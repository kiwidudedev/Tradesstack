import type { AssistantRoleMode } from "./types";

export type AssistantAnswerType = "lookup" | "aggregation" | "comparison" | "cross_module" | "diagnostic" | "priority" | "action";

export type AssistantQuestionPlan = {
  answerType: AssistantAnswerType;
  requiredFacts: string[];
  depth: "register" | "detail" | "lineage";
  selectedTools: string[];
  mode: AssistantRoleMode;
};

export function planAssistantQuestion(message: string, selectedTools: string[], mode: AssistantRoleMode = "auto"): AssistantQuestionPlan {
  const text = message.toLowerCase();
  const action = /create|make|send|approve|submit|issue|assign|schedule|follow up/.test(text);
  const aggregation = /total|how much|value|amount|sum|count|percentage|spent|committed|claimed/.test(text);
  const comparison = /highest|lowest|largest|smallest|closest|over|under|compare|versus|vs\.?/.test(text);
  const crossModule = /estimate|allowance|takeoff/.test(text) && /purchase order|\bpo\b|variation|invoice|claim|cost|actual/.test(text)
    || /purchase order|\bpo\b|variation|invoice|claim/.test(text) && /ordered|bought|purchased|spent|committed|estimate|quote|takeoff|actual|cost/.test(text);
  const priority = /what should i chase|what needs my attention|who are we waiting on|priority|next step/.test(text);
  const diagnostic = /why|exposed|risk|losing money|over budget|holding us up|blocked/.test(text);
  const answerType: AssistantAnswerType = action ? "action" : priority ? "priority" : diagnostic ? "diagnostic" : crossModule ? "cross_module" : comparison ? "comparison" : aggregation ? "aggregation" : "lookup";
  const requiredFacts: string[] = [];
  if (/variation|change order|\bvo\b|material|labour|labor|component|line item/.test(text)) requiredFacts.push("structured commercial line items");
  if (/purchase order|\bpo\b|ordered|bought|committed/.test(text)) requiredFacts.push("purchase-order status and line items");
  if (/claim|claimed|payment|retention/.test(text)) requiredFacts.push("claim lines and source lineage");
  if (/estimate|allowance|takeoff|quantity/.test(text)) requiredFacts.push("estimate or takeoff evidence");
  if (/qa|quality|inspection|defect|hold point/.test(text)) requiredFacts.push("QA definitions, runs, evidence and defects");
  if (/file|drawing|document|spec/.test(text)) requiredFacts.push("authorized document content or metadata");
  if (requiredFacts.length === 0) requiredFacts.push("project-scoped source records");
  return { answerType, requiredFacts: [...new Set(requiredFacts)], depth: answerType === "cross_module" ? "lineage" : answerType === "aggregation" || answerType === "comparison" ? "detail" : "register", selectedTools, mode };
}
