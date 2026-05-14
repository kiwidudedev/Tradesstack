"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { StatusBadge, type StatusBadgeProps } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  AccountingResolutionPreviewRow,
  OrganizationCostCodeMappingRuleRow,
  OrganizationCostCodeRow,
  OrganizationCostCodeRuleType,
} from "@/lib/accounting/types";

type CompanyCostCodesWorkspaceProps = {
  organizationId: string;
  canEdit: boolean;
  costCodes: OrganizationCostCodeRow[];
  mappingRules: OrganizationCostCodeMappingRuleRow[];
  previewRows: AccountingResolutionPreviewRow[];
  unresolvedRows: AccountingResolutionPreviewRow[];
};

type QuickSetupKey =
  | "labour"
  | "material"
  | "labourMaterial"
  | "subcontractor"
  | "plantEquipment"
  | "other";

type QuickSetupOption = {
  key: QuickSetupKey;
  label: string;
  help: string;
  ruleType: OrganizationCostCodeRuleType;
  costType: string | null;
  defaultPriority: number;
};

const QUICK_SETUP_OPTIONS: QuickSetupOption[] = [
  {
    key: "labour",
    label: "Labour costs should use",
    help: "Used when Tradesstack understands a line as labour.",
    ruleType: "cost_type",
    costType: "LAB",
    defaultPriority: 100,
  },
  {
    key: "material",
    label: "Material costs should use",
    help: "Used when Tradesstack understands a line as material.",
    ruleType: "cost_type",
    costType: "MAT",
    defaultPriority: 110,
  },
  {
    key: "labourMaterial",
    label: "Labour + Material costs should use",
    help: "Used for supply-and-install style items.",
    ruleType: "cost_type",
    costType: "LAB_MAT",
    defaultPriority: 120,
  },
  {
    key: "subcontractor",
    label: "Subcontractor costs should use",
    help: "Used for subcontract or specialist-supply items.",
    ruleType: "cost_type",
    costType: "SUB",
    defaultPriority: 130,
  },
  {
    key: "plantEquipment",
    label: "Plant / Equipment costs should use",
    help: "Used for plant hire and equipment costs.",
    ruleType: "cost_type",
    costType: "PLN",
    defaultPriority: 140,
  },
  {
    key: "other",
    label: "Other costs should use",
    help: "Fallback when no more specific company code mapping exists.",
    ruleType: "default",
    costType: null,
    defaultPriority: 999,
  },
];

const ADVANCED_RULE_TYPE_OPTIONS: Array<{ value: OrganizationCostCodeRuleType; label: string }> = [
  { value: "direct_cost_item_code", label: "Direct internal mapping" },
  { value: "work_type_cost_type", label: "Work type + cost type" },
  { value: "work_type", label: "Work type" },
  { value: "cost_type", label: "Cost type" },
  { value: "default", label: "Default / fallback" },
];

function formatAdvancedRuleLabel(rule: OrganizationCostCodeMappingRuleRow) {
  switch (rule.rule_type) {
    case "direct_cost_item_code":
      return `Internal code: ${rule.intelligence_cost_code ?? "-"}`;
    case "work_type_cost_type":
      return `${rule.work_type ?? "-"} + ${rule.cost_type ?? "-"}`;
    case "work_type":
      return `Work type: ${rule.work_type ?? "-"}`;
    case "cost_type":
      return `Cost type: ${rule.cost_type ?? "-"}`;
    case "default":
      return "Default / fallback";
    default:
      return rule.rule_type;
  }
}

function formatAdvancedStatus(value: AccountingResolutionPreviewRow["resolution"]["status"]) {
  switch (value) {
    case "resolved":
      return "Resolved";
    case "fallback":
      return "Fallback";
    case "classification_review_required":
      return "Waiting on classification";
    default:
      return "Needs company code";
  }
}

function resolutionStatusBadge(value: AccountingResolutionPreviewRow["resolution"]["status"]): NonNullable<StatusBadgeProps["status"]> {
  switch (value) {
    case "resolved":
      return "approved";
    case "fallback":
      return "sent";
    case "classification_review_required":
      return "pending";
    default:
      return "overdue";
  }
}

const SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2";

function findActiveRule(
  mappingRules: OrganizationCostCodeMappingRuleRow[],
  ruleType: OrganizationCostCodeRuleType,
  selector: { costType?: string | null; workType?: string | null; intelligenceCostCode?: string | null }
) {
  return mappingRules
    .filter((rule) => rule.is_active && rule.rule_type === ruleType)
    .filter((rule) => {
      if (ruleType === "default") {
        return true;
      }
      if (ruleType === "cost_type") {
        return rule.cost_type === (selector.costType ?? null);
      }
      if (ruleType === "work_type_cost_type") {
        return (
          rule.work_type === (selector.workType ?? null) &&
          rule.cost_type === (selector.costType ?? null)
        );
      }
      if (ruleType === "work_type") {
        return rule.work_type === (selector.workType ?? null);
      }
      if (ruleType === "direct_cost_item_code") {
        return rule.intelligence_cost_code === (selector.intelligenceCostCode ?? null);
      }
      return false;
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      if (left.created_at !== right.created_at) {
        return left.created_at.localeCompare(right.created_at);
      }
      return left.id.localeCompare(right.id);
    })[0];
}

function buildQuickSetupSelections(mappingRules: OrganizationCostCodeMappingRuleRow[]) {
  return QUICK_SETUP_OPTIONS.reduce<Record<QuickSetupKey, string>>(
    (accumulator, option) => {
      const match = findActiveRule(mappingRules, option.ruleType, { costType: option.costType });
      accumulator[option.key] = match?.target_cost_code_id ?? "";
      return accumulator;
    },
    {
      labour: "",
      material: "",
      labourMaterial: "",
      subcontractor: "",
      plantEquipment: "",
      other: "",
    }
  );
}

function buildReviewDefaults(rows: AccountingResolutionPreviewRow[]) {
  return rows.reduce<Record<string, string>>((accumulator, row) => {
    accumulator[row.costItemId] = "";
    return accumulator;
  }, {});
}

export function CompanyCostCodesWorkspace({
  organizationId,
  canEdit,
  costCodes,
  mappingRules,
  previewRows,
  unresolvedRows,
}: CompanyCostCodesWorkspaceProps) {
  const NEW_COST_CODE_ROW_ID = "__new__";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingCostCodeId, setEditingCostCodeId] = useState<string | null>(null);
  const [codeForm, setCodeForm] = useState({
    code: "",
    name: "",
    description: "",
    isDefault: false,
  });
  const [quickSetupSelections, setQuickSetupSelections] = useState<Record<QuickSetupKey, string>>(
    () => buildQuickSetupSelections(mappingRules)
  );
  const [reviewSelections, setReviewSelections] = useState<Record<string, string>>(
    () => buildReviewDefaults(unresolvedRows)
  );
  const [advancedRuleForm, setAdvancedRuleForm] = useState({
    ruleType: "cost_type" as OrganizationCostCodeRuleType,
    targetCostCodeId: "",
    intelligenceCostCode: "",
    workType: "",
    costType: "",
    priority: "100",
    notes: "",
  });

  useEffect(() => {
    setQuickSetupSelections(buildQuickSetupSelections(mappingRules));
  }, [mappingRules]);

  useEffect(() => {
    setReviewSelections((current) => {
      const next = buildReviewDefaults(unresolvedRows);
      for (const row of unresolvedRows) {
        if (current[row.costItemId]) {
          next[row.costItemId] = current[row.costItemId];
        }
      }
      return next;
    });
  }, [unresolvedRows]);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const activeCostCodes = useMemo(() => costCodes.filter((row) => row.is_active), [costCodes]);
  const costCodeNameById = useMemo(
    () => new Map(costCodes.map((row) => [row.id, `${row.code} - ${row.name}`])),
    [costCodes]
  );
  const defaultCostCodeId = costCodes.find((row) => row.is_default && row.is_active)?.id ?? null;

  const refreshPage = (nextMessage: string) => {
    setMessage(nextMessage);
    setError(null);
    router.refresh();
  };

  const ensureEditable = () => {
    if (!canEdit) {
      setError("You do not have permission to update company cost code settings.");
      return false;
    }
    if (!supabase) {
      setError("Supabase is not configured.");
      return false;
    }
    return true;
  };

  const resetCodeForm = () => {
    setEditingCostCodeId(null);
    setCodeForm({
      code: "",
      name: "",
      description: "",
      isDefault: false,
    });
  };

  const handleStartAddCostCode = () => {
    setEditingCostCodeId(NEW_COST_CODE_ROW_ID);
    setCodeForm({
      code: "",
      name: "",
      description: "",
      isDefault: false,
    });
    setMessage(null);
    setError(null);
  };

  const handleSaveCostCode = () => {
    if (!ensureEditable()) {
      return;
    }

    const code = codeForm.code.trim();
    const name = codeForm.name.trim();
    if (!code || !name) {
      setError("Company code and name are required.");
      return;
    }

    startTransition(() => {
      void (async () => {
        if (codeForm.isDefault && defaultCostCodeId && defaultCostCodeId !== editingCostCodeId) {
          const { error: clearDefaultError } = await supabase!
            .from("organization_cost_codes")
            .update({ is_default: false })
            .eq("organization_id", organizationId)
            .eq("id", defaultCostCodeId);

          if (clearDefaultError) {
            setError(clearDefaultError.message);
            return;
          }
        }

        if (editingCostCodeId && editingCostCodeId !== NEW_COST_CODE_ROW_ID) {
          const { error: updateError } = await supabase!
            .from("organization_cost_codes")
            .update({
              code,
              name,
              description: codeForm.description.trim() || null,
              is_default: codeForm.isDefault,
            })
            .eq("organization_id", organizationId)
            .eq("id", editingCostCodeId);

          if (updateError) {
            setError(updateError.message);
            return;
          }

          resetCodeForm();
          refreshPage("Company cost code updated.");
          return;
        }

        const { error: insertError } = await supabase!
          .from("organization_cost_codes")
          .insert({
            organization_id: organizationId,
            code,
            name,
            description: codeForm.description.trim() || null,
            is_default: codeForm.isDefault,
          });

        if (insertError) {
          setError(insertError.message);
          return;
        }

        resetCodeForm();
        refreshPage("Company cost code added.");
      })();
    });
  };

  const handleEditCostCode = (costCode: OrganizationCostCodeRow) => {
    setEditingCostCodeId(costCode.id);
    setCodeForm({
      code: costCode.code,
      name: costCode.name,
      description: costCode.description ?? "",
      isDefault: costCode.is_default,
    });
    setMessage(null);
    setError(null);
  };

  const handleToggleDefaultCostCode = (costCodeId: string, makeDefault: boolean) => {
    if (!ensureEditable()) {
      return;
    }

    startTransition(() => {
      void (async () => {
        if (makeDefault && defaultCostCodeId && defaultCostCodeId !== costCodeId) {
          const { error: clearError } = await supabase!
            .from("organization_cost_codes")
            .update({ is_default: false })
            .eq("organization_id", organizationId)
            .eq("id", defaultCostCodeId);
          if (clearError) {
            setError(clearError.message);
            return;
          }
        }

        const { error: updateError } = await supabase!
          .from("organization_cost_codes")
          .update({ is_default: makeDefault, is_active: true })
          .eq("organization_id", organizationId)
          .eq("id", costCodeId);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        refreshPage(makeDefault ? "Default company code updated." : "Default company code cleared.");
      })();
    });
  };

  const handleToggleCostCodeActive = (costCodeId: string, nextActive: boolean) => {
    if (!ensureEditable()) {
      return;
    }

    startTransition(() => {
      void (async () => {
        const { error: updateError } = await supabase!
          .from("organization_cost_codes")
          .update({
            is_active: nextActive,
            is_default: nextActive ? undefined : false,
          })
          .eq("organization_id", organizationId)
          .eq("id", costCodeId);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        if (editingCostCodeId === costCodeId && !nextActive) {
          resetCodeForm();
        }

        refreshPage(nextActive ? "Company cost code restored." : "Company cost code archived.");
      })();
    });
  };

  const handleSaveQuickSetup = () => {
    if (!ensureEditable()) {
      return;
    }

    startTransition(() => {
      void (async () => {
        for (const option of QUICK_SETUP_OPTIONS) {
          const selectedCostCodeId = quickSetupSelections[option.key] || "";
          const existingRule = findActiveRule(mappingRules, option.ruleType, { costType: option.costType });

          if (!selectedCostCodeId) {
            if (existingRule) {
              const { error: archiveError } = await supabase!
                .from("organization_cost_code_mapping_rules")
                .update({ is_active: false })
                .eq("organization_id", organizationId)
                .eq("id", existingRule.id);
              if (archiveError) {
                setError(archiveError.message);
                return;
              }
            }
            continue;
          }

          if (existingRule) {
            const { error: updateError } = await supabase!
              .from("organization_cost_code_mapping_rules")
              .update({
                target_cost_code_id: selectedCostCodeId,
                is_active: true,
              })
              .eq("organization_id", organizationId)
              .eq("id", existingRule.id);
            if (updateError) {
              setError(updateError.message);
              return;
            }
            continue;
          }

          const { error: insertError } = await supabase!
            .from("organization_cost_code_mapping_rules")
            .insert({
              organization_id: organizationId,
              rule_type: option.ruleType,
              target_cost_code_id: selectedCostCodeId,
              cost_type: option.costType,
              priority: option.defaultPriority,
            });

          if (insertError) {
            setError(insertError.message);
            return;
          }
        }

        refreshPage("Quick setup saved.");
      })();
    });
  };

  const handleApplyReviewSelection = (row: AccountingResolutionPreviewRow) => {
    if (!ensureEditable()) {
      return;
    }

    const selectedCostCodeId = reviewSelections[row.costItemId] || "";
    if (!selectedCostCodeId) {
      setError("Choose a company code first.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const existingRule = findActiveRule(mappingRules, "work_type_cost_type", {
          workType: row.workType,
          costType: row.costType,
        });

        if (existingRule) {
          const { error: updateError } = await supabase!
            .from("organization_cost_code_mapping_rules")
            .update({
              target_cost_code_id: selectedCostCodeId,
              is_active: true,
            })
            .eq("organization_id", organizationId)
            .eq("id", existingRule.id);

          if (updateError) {
            setError(updateError.message);
            return;
          }
        } else {
          const { error: insertError } = await supabase!
            .from("organization_cost_code_mapping_rules")
            .insert({
              organization_id: organizationId,
              rule_type: "work_type_cost_type",
              target_cost_code_id: selectedCostCodeId,
              work_type: row.workType,
              cost_type: row.costType,
              priority: 50,
            });

          if (insertError) {
            setError(insertError.message);
            return;
          }
        }

        refreshPage("Company code rule saved.");
      })();
    });
  };

  const handleCreateAdvancedRule = () => {
    if (!ensureEditable()) {
      return;
    }

    if (!advancedRuleForm.targetCostCodeId) {
      setError("Choose a target company code.");
      return;
    }

    const trimmedIntelligenceCode = advancedRuleForm.intelligenceCostCode.trim();
    const trimmedWorkType = advancedRuleForm.workType.trim();
    const trimmedCostType = advancedRuleForm.costType.trim();

    if (advancedRuleForm.ruleType === "direct_cost_item_code" && !trimmedIntelligenceCode) {
      setError("Internal code is required for this advanced rule.");
      return;
    }

    if (advancedRuleForm.ruleType === "work_type_cost_type" && (!trimmedWorkType || !trimmedCostType)) {
      setError("Work type and cost type are required for this advanced rule.");
      return;
    }

    if (advancedRuleForm.ruleType === "work_type" && !trimmedWorkType) {
      setError("Work type is required for this advanced rule.");
      return;
    }

    if (advancedRuleForm.ruleType === "cost_type" && !trimmedCostType) {
      setError("Cost type is required for this advanced rule.");
      return;
    }

    const parsedPriority = Number(advancedRuleForm.priority);
    if (!Number.isFinite(parsedPriority) || parsedPriority <= 0) {
      setError("Priority must be a positive number.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const { error: insertError } = await supabase!
          .from("organization_cost_code_mapping_rules")
          .insert({
            organization_id: organizationId,
            rule_type: advancedRuleForm.ruleType,
            target_cost_code_id: advancedRuleForm.targetCostCodeId,
            intelligence_cost_code:
              advancedRuleForm.ruleType === "direct_cost_item_code" ? trimmedIntelligenceCode : null,
            work_type:
              advancedRuleForm.ruleType === "work_type_cost_type" || advancedRuleForm.ruleType === "work_type"
                ? trimmedWorkType
                : null,
            cost_type:
              advancedRuleForm.ruleType === "work_type_cost_type" || advancedRuleForm.ruleType === "cost_type"
                ? trimmedCostType
                : null,
            priority: parsedPriority,
            notes: advancedRuleForm.notes.trim() || null,
          });

        if (insertError) {
          setError(insertError.message);
          return;
        }

        setAdvancedRuleForm({
          ruleType: "cost_type",
          targetCostCodeId: "",
          intelligenceCostCode: "",
          workType: "",
          costType: "",
          priority: "100",
          notes: "",
        });
        refreshPage("Advanced mapping saved.");
      })();
    });
  };

  const handleToggleRuleActive = (ruleId: string, nextActive: boolean) => {
    if (!ensureEditable()) {
      return;
    }

    startTransition(() => {
      void (async () => {
        const { error: updateError } = await supabase!
          .from("organization_cost_code_mapping_rules")
          .update({ is_active: nextActive })
          .eq("organization_id", organizationId)
          .eq("id", ruleId);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        refreshPage(nextActive ? "Advanced mapping restored." : "Advanced mapping archived.");
      })();
    });
  };

  const renderCostCodeEditRow = (rowKey: string, statusLabel: string) => (
    <OperationalTableRow key={rowKey} className="bg-[var(--surface-muted)] align-top hover:bg-[var(--surface-muted)]">
      <OperationalTableCell>
        <Input
          value={codeForm.code}
          onChange={(event) => setCodeForm((current) => ({ ...current, code: event.target.value }))}
          placeholder="200"
          disabled={!canEdit || isPending}
        />
      </OperationalTableCell>
      <OperationalTableCell>
        <Input
          value={codeForm.name}
          onChange={(event) => setCodeForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Material"
          disabled={!canEdit || isPending}
        />
      </OperationalTableCell>
      <OperationalTableCell>
        <Input
          value={codeForm.description}
          onChange={(event) => setCodeForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Optional note for your finance team"
          disabled={!canEdit || isPending}
        />
      </OperationalTableCell>
      <OperationalTableCell>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={codeForm.isDefault}
            onChange={(event) => setCodeForm((current) => ({ ...current, isDefault: event.target.checked }))}
            disabled={!canEdit || isPending}
          />
          Default
        </label>
      </OperationalTableCell>
      <OperationalTableCell className="text-sm text-[var(--text-secondary)]">{statusLabel}</OperationalTableCell>
      <OperationalTableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={resetCodeForm} disabled={!canEdit || isPending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSaveCostCode} disabled={!canEdit || isPending}>
            Save
          </Button>
        </div>
      </OperationalTableCell>
    </OperationalTableRow>
  );

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[var(--background)] pb-8`}>
      <OperationalModuleHeader
        title="Cost Codes"
        description="Configure the company cost codes Tradesstack should use for accounting exports, default routing, and advanced mapping rules."
      />

      <div className="space-y-3">
        {!canEdit ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--warning-light)] bg-[var(--warning-light)] px-4 py-3">
            <p className="text-sm text-[var(--warning)]">
              You can review company cost code setup here, but only owner and admin roles can change it.
            </p>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--error-light)] bg-[var(--error-light)] px-4 py-3">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </div>
        ) : null}
        {message ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--success-light)] bg-[var(--success-light)] px-4 py-3">
            <p className="text-sm text-[var(--success)]">{message}</p>
          </div>
        ) : null}
      </div>

      <OperationalPanel
        title="Company Cost Codes"
        actions={
          <Button
            type="button"
            onClick={handleStartAddCostCode}
            disabled={!canEdit || isPending || editingCostCodeId === NEW_COST_CODE_ROW_ID}
          >
            Add Cost Code
          </Button>
        }
        contentClassName="p-0"
      >
        {costCodes.length === 0 && editingCostCodeId !== NEW_COST_CODE_ROW_ID ? (
          <div className="p-6">
            <OperationalEmptyState title="No company cost codes yet. Add your first code to start mapping finalized cost items." />
          </div>
        ) : (
          <OperationalTable>
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead>Code</OperationalTableHead>
                <OperationalTableHead>Name</OperationalTableHead>
                <OperationalTableHead>Description</OperationalTableHead>
                <OperationalTableHead>Default</OperationalTableHead>
                <OperationalTableHead>Status</OperationalTableHead>
                <OperationalTableHead className="text-right">Action</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {editingCostCodeId === NEW_COST_CODE_ROW_ID ? renderCostCodeEditRow("__new-row__", "New") : null}
              {costCodes.map((costCode) =>
                editingCostCodeId === costCode.id ? (
                  renderCostCodeEditRow(costCode.id, "Editing")
                ) : (
                  <OperationalTableRow key={costCode.id}>
                    <OperationalTableCell className="font-semibold">{costCode.code}</OperationalTableCell>
                    <OperationalTableCell className="font-semibold">{costCode.name}</OperationalTableCell>
                    <OperationalTableCell className="text-[var(--text-secondary)]">
                      <div className="max-w-[360px] truncate">{costCode.description || "No description"}</div>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={costCode.is_default ? "sent" : "draft"}>
                        {costCode.is_default ? "Default" : "Optional"}
                      </StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <StatusBadge status={costCode.is_active ? "approved" : "draft"}>
                        {costCode.is_active ? "Active" : "Archived"}
                      </StatusBadge>
                    </OperationalTableCell>
                    <OperationalTableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditCostCode(costCode)}
                          disabled={!canEdit || isPending}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleToggleDefaultCostCode(costCode.id, !costCode.is_default)}
                          disabled={!canEdit || isPending || !costCode.is_active}
                        >
                          {costCode.is_default ? "Clear Default" : "Set Default"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleToggleCostCodeActive(costCode.id, !costCode.is_active)}
                          disabled={!canEdit || isPending}
                        >
                          {costCode.is_active ? "Archive" : "Restore"}
                        </Button>
                      </div>
                    </OperationalTableCell>
                  </OperationalTableRow>
                )
              )}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>

      <OperationalPanel
        title="Quick Setup"
        description="Assign the most common cost categories first. These defaults cover the majority of accounting mappings without needing advanced rules."
      >
        <div className="space-y-3">
          {QUICK_SETUP_OPTIONS.map((option) => (
            <div key={option.key} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
              <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">{option.label}</label>
              <select
                value={quickSetupSelections[option.key]}
                onChange={(event) =>
                  setQuickSetupSelections((current) => ({
                    ...current,
                    [option.key]: event.target.value,
                  }))
                }
                disabled={!canEdit || isPending || activeCostCodes.length === 0}
                className={SELECT_CLASS}
              >
                <option value="">Not set</option>
                {activeCostCodes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} - {row.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{option.help}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            onClick={handleSaveQuickSetup}
            disabled={!canEdit || isPending || activeCostCodes.length === 0}
          >
            Save Quick Setup
          </Button>
        </div>
      </OperationalPanel>

      <OperationalPanel
        title="Items Needing a Company Code"
        description="These items are already classified by Tradesstack. They only need one of your company cost codes so exports and downstream accounting stay consistent."
        contentClassName="p-0"
      >
        {unresolvedRows.length === 0 ? (
          <div className="p-6">
            <OperationalEmptyState title="No items are waiting for a company code right now." />
          </div>
        ) : (
          <OperationalTable className="min-w-[980px]">
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead>Description</OperationalTableHead>
                <OperationalTableHead>Work Type</OperationalTableHead>
                <OperationalTableHead>Cost Type</OperationalTableHead>
                <OperationalTableHead>Choose Company Code</OperationalTableHead>
                <OperationalTableHead className="text-right">Action</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {unresolvedRows.map((row) => (
                <OperationalTableRow key={row.costItemId} className="align-top">
                  <OperationalTableCell>
                    <div className="max-w-[360px]">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {row.description || row.title || row.sourceDocumentKind}
                      </p>
                      {row.projectName ? (
                        <p className="mt-1 text-sm text-[var(--text-muted)]">{row.projectName}</p>
                      ) : null}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
                          Advanced details
                        </summary>
                        <div className="mt-2 text-xs text-[var(--text-secondary)]">
                          <p>Tradesstack code: {row.intelligenceCostCode ?? "-"}</p>
                          <p>Document type: {row.sourceDocumentKind}</p>
                        </div>
                      </details>
                    </div>
                  </OperationalTableCell>
                  <OperationalTableCell>{row.workType ?? "-"}</OperationalTableCell>
                  <OperationalTableCell>{row.costType ?? "-"}</OperationalTableCell>
                  <OperationalTableCell>
                    <select
                      value={reviewSelections[row.costItemId] ?? ""}
                      onChange={(event) =>
                        setReviewSelections((current) => ({
                          ...current,
                          [row.costItemId]: event.target.value,
                        }))
                      }
                      disabled={!canEdit || isPending || activeCostCodes.length === 0}
                      className={SELECT_CLASS}
                    >
                      <option value="">Choose a company code</option>
                      {activeCostCodes.map((costCode) => (
                        <option key={costCode.id} value={costCode.id}>
                          {costCode.code} - {costCode.name}
                        </option>
                      ))}
                    </select>
                  </OperationalTableCell>
                  <OperationalTableCell>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleApplyReviewSelection(row)}
                        disabled={!canEdit || isPending || !reviewSelections[row.costItemId]}
                      >
                        Save
                      </Button>
                    </div>
                  </OperationalTableCell>
                </OperationalTableRow>
              ))}
            </OperationalTableBody>
          </OperationalTable>
        )}
      </OperationalPanel>

      <details className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)]">
        <summary className="cursor-pointer list-none px-6 py-5 text-lg font-semibold text-[var(--text-primary)]">
          Advanced Mapping
        </summary>
        <div className="space-y-6 border-t border-[var(--border)] px-6 py-6">
          <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
            Use advanced mapping when you need rule-based routing beyond the quick setup defaults. This
            exposes the internal inputs Tradesstack uses when resolving a company cost code.
          </p>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <OperationalPanel title="Advanced Rule Builder">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Rule Type</label>
                  <select
                    value={advancedRuleForm.ruleType}
                    onChange={(event) =>
                      setAdvancedRuleForm((current) => ({
                        ...current,
                        ruleType: event.target.value as OrganizationCostCodeRuleType,
                      }))
                    }
                    disabled={!canEdit || isPending}
                    className={SELECT_CLASS}
                  >
                    {ADVANCED_RULE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                    Target Company Code
                  </label>
                  <select
                    value={advancedRuleForm.targetCostCodeId}
                    onChange={(event) =>
                      setAdvancedRuleForm((current) => ({ ...current, targetCostCodeId: event.target.value }))
                    }
                    disabled={!canEdit || isPending}
                    className={SELECT_CLASS}
                  >
                    <option value="">Choose a code</option>
                    {activeCostCodes.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} - {row.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                    Internal Cost Code
                  </label>
                  <Input
                    value={advancedRuleForm.intelligenceCostCode}
                    onChange={(event) =>
                      setAdvancedRuleForm((current) => ({
                        ...current,
                        intelligenceCostCode: event.target.value,
                      }))
                    }
                    placeholder="07.01.MAT"
                    disabled={!canEdit || isPending}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Work Type</label>
                  <Input
                    value={advancedRuleForm.workType}
                    onChange={(event) =>
                      setAdvancedRuleForm((current) => ({ ...current, workType: event.target.value }))
                    }
                    placeholder="Wall Linings"
                    disabled={!canEdit || isPending}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Cost Type</label>
                  <Input
                    value={advancedRuleForm.costType}
                    onChange={(event) =>
                      setAdvancedRuleForm((current) => ({ ...current, costType: event.target.value }))
                    }
                    placeholder="MAT"
                    disabled={!canEdit || isPending}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Rule Priority</label>
                  <Input
                    type="number"
                    min={1}
                    value={advancedRuleForm.priority}
                    onChange={(event) =>
                      setAdvancedRuleForm((current) => ({ ...current, priority: event.target.value }))
                    }
                    disabled={!canEdit || isPending}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Notes</label>
                  <Input
                    value={advancedRuleForm.notes}
                    onChange={(event) =>
                      setAdvancedRuleForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Optional context for advanced users"
                    disabled={!canEdit || isPending}
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  onClick={handleCreateAdvancedRule}
                  disabled={!canEdit || isPending || activeCostCodes.length === 0}
                >
                  Save Advanced Rule
                </Button>
              </div>
            </OperationalPanel>

            <div className="space-y-6">
              <OperationalPanel title="Advanced Mapping List" contentClassName="p-0">
                {mappingRules.length === 0 ? (
                  <div className="p-6">
                    <OperationalEmptyState title="No advanced mappings added yet." />
                  </div>
                ) : (
                  <OperationalTable>
                    <OperationalTableHeader>
                      <OperationalTableRow>
                        <OperationalTableHead>Rule</OperationalTableHead>
                        <OperationalTableHead>Target</OperationalTableHead>
                        <OperationalTableHead>Status</OperationalTableHead>
                        <OperationalTableHead className="text-right">Action</OperationalTableHead>
                      </OperationalTableRow>
                    </OperationalTableHeader>
                    <OperationalTableBody>
                      {mappingRules.map((rule) => (
                        <OperationalTableRow key={rule.id} className="align-top">
                          <OperationalTableCell>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[var(--text-primary)]">
                                {formatAdvancedRuleLabel(rule)}
                              </p>
                              <p className="truncate text-sm text-[var(--text-secondary)]">Priority {rule.priority}</p>
                              {rule.notes ? (
                                <p className="truncate text-sm text-[var(--text-muted)]">{rule.notes}</p>
                              ) : null}
                            </div>
                          </OperationalTableCell>
                          <OperationalTableCell>
                            <span className="truncate text-[var(--text-primary)]">
                              {costCodeNameById.get(rule.target_cost_code_id) ?? "Unknown code"}
                            </span>
                          </OperationalTableCell>
                          <OperationalTableCell>
                            <StatusBadge status={rule.is_active ? "approved" : "draft"}>
                              {rule.is_active ? "Active" : "Archived"}
                            </StatusBadge>
                          </OperationalTableCell>
                          <OperationalTableCell>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleToggleRuleActive(rule.id, !rule.is_active)}
                                disabled={!canEdit || isPending}
                              >
                                {rule.is_active ? "Archive" : "Restore"}
                              </Button>
                            </div>
                          </OperationalTableCell>
                        </OperationalTableRow>
                      ))}
                    </OperationalTableBody>
                  </OperationalTable>
                )}
              </OperationalPanel>

              <OperationalPanel title="Advanced Preview" contentClassName="p-0">
                {previewRows.length === 0 ? (
                  <div className="p-6">
                    <OperationalEmptyState title="No items available for advanced preview yet." />
                  </div>
                ) : (
                  <OperationalTable className="min-w-[900px]">
                    <OperationalTableHeader>
                      <OperationalTableRow>
                        <OperationalTableHead>Tradesstack Detail</OperationalTableHead>
                        <OperationalTableHead>Work Type</OperationalTableHead>
                        <OperationalTableHead>Cost Type</OperationalTableHead>
                        <OperationalTableHead>Company Code</OperationalTableHead>
                        <OperationalTableHead>Status</OperationalTableHead>
                      </OperationalTableRow>
                    </OperationalTableHeader>
                    <OperationalTableBody>
                      {previewRows.map((row) => (
                        <OperationalTableRow key={row.costItemId} className="align-top">
                          <OperationalTableCell>
                            <p className="font-semibold text-[var(--text-primary)]">
                              {row.intelligenceCostCode ?? "Unclassified"}
                            </p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {row.description || row.title || row.sourceDocumentKind}
                            </p>
                          </OperationalTableCell>
                          <OperationalTableCell>{row.workType ?? "-"}</OperationalTableCell>
                          <OperationalTableCell>{row.costType ?? "-"}</OperationalTableCell>
                          <OperationalTableCell>
                            <p className="font-semibold text-[var(--text-primary)]">
                              {row.resolution.code ? `${row.resolution.code} - ${row.resolution.name ?? ""}` : "-"}
                            </p>
                            {row.resolution.matchedRuleType ? (
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                via {row.resolution.matchedRuleType}
                              </p>
                            ) : null}
                          </OperationalTableCell>
                          <OperationalTableCell>
                            <StatusBadge status={resolutionStatusBadge(row.resolution.status)}>
                              {formatAdvancedStatus(row.resolution.status)}
                            </StatusBadge>
                          </OperationalTableCell>
                        </OperationalTableRow>
                      ))}
                    </OperationalTableBody>
                  </OperationalTable>
                )}
              </OperationalPanel>
            </div>
          </div>
        </div>
      </details>
    </main>
  );
}
