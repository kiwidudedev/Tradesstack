import { createHash } from "node:crypto";

export function buildUniversalLearningRunPromptHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function buildUniversalLearningActionKey(input: {
  reviewRunId: string;
  action: string;
  basedOnLearningId: string;
  targetMemoryId?: string | null;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}
