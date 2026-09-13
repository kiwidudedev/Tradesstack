"use client";

import type {
  OpportunityCreationRequest,
  OpportunityCreationResponse,
} from "@/lib/opportunity-creation-contract";

export type OpportunityCreationSurface = "dialog" | "full-page";

const REQUEST_KEY_PREFIX = "tradesstack:opportunity-creation:v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(surface: OpportunityCreationSurface) {
  return `${REQUEST_KEY_PREFIX}:${surface}`;
}

export function getStableOpportunityCreationRequestId(
  surface: OpportunityCreationSurface,
) {
  const key = storageKey(surface);
  const existing = window.sessionStorage.getItem(key);
  if (existing && UUID_PATTERN.test(existing)) return existing;

  const requestId = crypto.randomUUID();
  window.sessionStorage.setItem(key, requestId);
  return requestId;
}

export function clearStableOpportunityCreationRequestId(
  surface: OpportunityCreationSurface,
) {
  window.sessionStorage.removeItem(storageKey(surface));
}

export async function submitAuthoritativeOpportunityCreation(
  request: OpportunityCreationRequest,
): Promise<OpportunityCreationResponse> {
  const response = await fetch("/api/leads-clients/opportunities/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = (await response.json().catch(() => null)) as
    | OpportunityCreationResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : "Unable to create opportunity.",
    );
  }
  return payload as OpportunityCreationResponse;
}
