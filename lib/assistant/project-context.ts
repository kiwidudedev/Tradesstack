import "server-only";

import type { AssistantCitation, AssistantContext, AssistantToolResult, ProjectAIContext, ProjectAIEntity, JsonValue } from "./types";

type ReadProjectData = (toolName: string) => Promise<AssistantToolResult>;

const technicalKeys = new Set(["organization_id", "project_id", "created_at", "updated_at", "deleted_at", "sort_order"]);

function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonValue(item)]));
  return String(value);
}

function labelFor(record: Record<string, unknown>, fallback: string) {
  for (const key of ["name", "title", "label", "description", "number", "id"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return fallback;
}

function citationFor(citations: AssistantCitation[], id: string) {
  return citations.find((item) => item.entityId === id);
}

function toEntities(source: string, data: unknown, citations: AssistantCitation[], asOf: string): ProjectAIEntity[] {
  const records = data && typeof data === "object" && Array.isArray((data as { records?: unknown[] }).records)
    ? (data as { records: unknown[] }).records
    : [];
  const entities: ProjectAIEntity[] = [];
  const add = (record: Record<string, unknown>, index: number, parent?: { entityType: string; id: string; relationships?: ProjectAIEntity["relationships"] }) => {
    const id = typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : `${source}:${index}`;
    const citation = citationFor(citations, id);
    const fields: Record<string, JsonValue> = {};
    const relationships: ProjectAIEntity["relationships"] = [];
    for (const [key, value] of Object.entries(record)) {
      if (key === "id" || technicalKeys.has(key)) continue;
      if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
        for (const [childIndex, child] of (value as Array<Record<string, unknown>>).entries()) add(child, childIndex, { entityType: source, id });
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        fields[key] = jsonValue(value);
        continue;
      }
      fields[key] = jsonValue(value);
      if (key.endsWith("Id") && (typeof value === "string" || typeof value === "number")) relationships.push({ relationshipType: key.slice(0, -2), targetEntityType: key.slice(0, -2), targetId: String(value) });
    }
    const entity: ProjectAIEntity = {
      entityType: source,
      id,
      label: labelFor(record, `${source} ${index + 1}`),
      fields,
      relationships: relationships.length ? relationships : undefined,
      source: { authority: source, asOf },
      citation: citation ? { label: citation.label, href: citation.href } : undefined,
    };
    entities.push(entity);
    if (parent) parent.relationships = [...(parent.relationships ?? []), { relationshipType: source, targetEntityType: source, targetId: id }];
  };
  records.forEach((record, index) => { if (record && typeof record === "object" && !Array.isArray(record)) add(record as Record<string, unknown>, index); });
  return entities;
}

function authoritativeValues(source: string, data: unknown, entities: ProjectAIEntity[]): ProjectAIContext["authoritativeValues"] {
  if (!data || typeof data !== "object") return [];
  const values: ProjectAIContext["authoritativeValues"] = [];
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item && typeof item === "object") visit(item, `${path}.${key}`);
      else if (/budget|revenue|committed|actual|retention|total|claim|subtotal|gst/i.test(key) && (typeof item === "number" || typeof item === "string")) values.push({ name: `${source}.${path}.${key}`, value: jsonValue(item), basis: "stored authoritative TradesStack value", sourceEntityIds: entities.map((entity) => entity.id).slice(0, 20) });
    }
  };
  visit(data, source);
  return values;
}

export async function buildProjectAIContext(context: AssistantContext, toolNames: string[], read: ReadProjectData): Promise<{ context: ProjectAIContext; results: AssistantToolResult[]; citations: AssistantCitation[] }> {
  const results = await Promise.all(toolNames.map(read));
  const entities: ProjectAIEntity[] = [];
  const authoritative: ProjectAIContext["authoritativeValues"] = [];
  const availability: ProjectAIContext["availability"] = [];
  const citations: AssistantCitation[] = [];
  for (const result of results) {
    if (result.status === "ok" || result.status === "empty") {
      const resultCitations = result.status === "ok" ? result.citations : [];
      citations.push(...resultCitations);
      const sourceEntities = result.status === "ok" ? toEntities(result.toolName, result.data, resultCitations, result.asOf) : [];
      entities.push(...sourceEntities);
      authoritative.push(...authoritativeValues(result.toolName, result.status === "ok" ? result.data : null, sourceEntities));
      availability.push({ source: result.toolName, status: result.status === "ok" ? (result.truncated ? "truncated" : "available") : "empty", returnedRows: result.returnedRows, totalRows: result.totalRows, ...(result.truncated ? { message: "The source was truncated at the reader limit." } : {}) });
    } else {
      availability.push({ source: result.toolName, status: result.status, message: result.safeMessage });
    }
  }
  const currentEntity = context.recordId ? entities.find((entity) => entity.id === context.recordId) : undefined;
  return {
    context: {
      schemaVersion: "project-ai-context.v1",
      generatedAt: new Date().toISOString(),
      project: { id: context.projectId, label: context.projectName, slug: context.projectSlug },
      currentContext: { route: context.route ?? undefined, currentEntityType: currentEntity?.entityType ?? context.module ?? undefined, currentEntityId: currentEntity?.id },
      entities: currentEntity ? [currentEntity, ...entities.filter((entity) => entity !== currentEntity)] : entities,
      authoritativeValues: authoritative,
      availability,
    },
    results,
    citations: citations.filter((citation, index, all) => all.findIndex((item) => item.entityType === citation.entityType && item.entityId === citation.entityId) === index),
  };
}
