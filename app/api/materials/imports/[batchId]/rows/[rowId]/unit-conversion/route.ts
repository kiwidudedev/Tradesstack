import { NextResponse } from "next/server";
import { isDocumentIntelligenceError, type DocumentIntelligenceErrorCode } from "@/lib/document-intelligence/errors";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { createMaterialUnitConversionContextHash } from "@/lib/materials/unit-conversion/context-hash";
import { proposeMaterialUnitConversion } from "@/lib/materials/unit-conversion/convert";
import type { MaterialUnitConversionAdditionalInformation } from "@/lib/materials/unit-conversion/contract";
import { addSelectedMaterialEvidence } from "@/lib/materials/unit-conversion/evidence";
import {
  isMaterialUnitConversionError,
  type MaterialUnitConversionErrorCode,
} from "@/lib/materials/unit-conversion/errors";
import { materialUnitConversionContextFromImportRow } from "@/lib/materials/unit-conversion/import-row-context";
import { normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import type { OrganizationMaterialRow } from "@/lib/materials/types";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TEMPORARY_PROVIDER_CODES = new Set<DocumentIntelligenceErrorCode>([
  "provider_timeout",
  "provider_rate_limited",
  "provider_server_error",
  "provider_unknown_error",
]);

function conversionErrorResponse(code: MaterialUnitConversionErrorCode, status: number) {
  const messages: Record<MaterialUnitConversionErrorCode, string> = {
    provider_unavailable: "Unit conversion is temporarily unavailable.",
    needs_information: "More product information is required for this conversion.",
    unsafe_conversion: "TradesStack could not verify a safe conversion from the available product information.",
    not_convertible: "These units cannot be safely converted from the available product information.",
    invalid_context: "The selected Material or source price has changed. Review the conversion again.",
  };
  return NextResponse.json({ error: messages[code], code }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAdditionalInformation(value: unknown): MaterialUnitConversionAdditionalInformation[] | null {
  if (value === undefined || value === null) return null;
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 8 || values.some((entry) => !isRecord(entry))) throw new Error("Additional conversion information is invalid.");
  return values.map((entry) => {
    const fact = entry as Record<string, unknown>;
    const numericValue = Number(fact.value);
    const unit = typeof fact.unit === "string" ? fact.unit.trim() : "";
    if (!Number.isFinite(numericValue) || numericValue <= 0 || !unit) {
      throw new Error("Additional conversion information requires a positive value and unit.");
    }
    return { value: numericValue, unit, label: typeof fact.label === "string" ? fact.label.trim() || null : null };
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string; rowId: string }> }
) {
  const { batchId, rowId } = await context.params;
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!await hasOrganizationPermission(member.organization_id, "materials.write")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  const requestedMaterialUnit = typeof body.requestedMaterialUnit === "string"
    ? body.requestedMaterialUnit.trim()
    : "";
  if (!requestedMaterialUnit) {
    return conversionErrorResponse("invalid_context", 400);
  }

  try {
    const additionalInformation = parseAdditionalInformation(body.additionalInformation);
    const selectedPriceKey = typeof body.selectedPriceKey === "string" ? body.selectedPriceKey.trim() || null : null;
    const selectedMaterialId = typeof body.selectedMaterialId === "string"
      ? body.selectedMaterialId.trim() || null
      : null;
    const supabase = await createServerSupabaseClient();
    const { data: row, error } = await supabase
      .from("organization_material_import_rows")
      .select("extracted_name,extracted_description,extracted_unit,extracted_unit_cost,extracted_currency,reviewed_name,reviewed_supplier_description,reviewed_supplier_sku,supplier_description,supplier_sku,source_payload,status,action")
      .eq("organization_id", member.organization_id)
      .eq("import_batch_id", batchId)
      .eq("id", rowId)
      .single();
    if (error || !row) return conversionErrorResponse("invalid_context", 404);
    if (row.status !== "pending_review" || row.action === "skip") {
      return conversionErrorResponse("invalid_context", 409);
    }

    let selectedMaterial: OrganizationMaterialRow | null = null;
    if (selectedMaterialId) {
      const { data: material, error: materialError } = await supabase
        .from("organization_materials")
        .select("*")
        .eq("organization_id", member.organization_id)
        .eq("id", selectedMaterialId)
        .eq("is_active", true)
        .is("archived_at", null)
        .single();
      if (materialError || !material) return conversionErrorResponse("invalid_context", 400);
      if (normalizeMaterialConversionUnit(material.default_unit) !== normalizeMaterialConversionUnit(requestedMaterialUnit)) {
        return conversionErrorResponse("invalid_context", 409);
      }
      selectedMaterial = material as OrganizationMaterialRow;
    }

    const importContext = materialUnitConversionContextFromImportRow(
      row,
      requestedMaterialUnit,
      additionalInformation,
      selectedPriceKey,
    );
    const conversionContext = addSelectedMaterialEvidence(importContext, selectedMaterial);
    const contextHash = createMaterialUnitConversionContextHash({
      organizationId: member.organization_id,
      batchId,
      rowId,
      context: conversionContext,
      selectedMaterial,
    });
    const proposal = await proposeMaterialUnitConversion(conversionContext, {
      contextHash,
      selectedMaterialId: selectedMaterial?.id ?? null,
      selectedMaterialUpdatedAt: selectedMaterial?.updated_at ?? null,
    });
    return NextResponse.json({ proposal });
  } catch (error) {
    if (isDocumentIntelligenceError(error)) {
      if (error.code === "provider_auth_error" || error.code === "provider_billing_error") {
        return conversionErrorResponse("provider_unavailable", 502);
      }
      return TEMPORARY_PROVIDER_CODES.has(error.code)
        ? conversionErrorResponse("provider_unavailable", 503)
        : conversionErrorResponse(
            error.code === "unsupported_source" || error.code === "invalid_source"
              ? "invalid_context"
              : "unsafe_conversion",
            error.code === "unsupported_source" || error.code === "invalid_source" ? 400 : 422,
          );
    }
    if (isMaterialUnitConversionError(error)) {
      return conversionErrorResponse(error.code, error.status);
    }
    return conversionErrorResponse("invalid_context", 400);
  }
}
