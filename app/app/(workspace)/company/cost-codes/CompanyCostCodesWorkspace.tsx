"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ibmPlexSans, interMedium } from "@/lib/fonts";
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

function statusClassName(value: AccountingResolutionPreviewRow["resolution"]["status"]) {
  switch (value) {
    case "resolved":
      return "border-[#CDE9DA] bg-[#EAF8F1] text-[#166534]";
    case "fallback":
      return "border-[#D7E3F7] bg-[#EEF4FF] text-[#285EA8]";
    case "classification_review_required":
      return "border-[#F0E1A8] bg-[#FBF2C8] text-[#8A6A00]";
    default:
      return "border-[#F4CCCC] bg-[#FFF1F1] text-[#9F2F2F]";
  }
}

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

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} space-y-6 bg-[#FBFEFE] pb-8`}>
      <section className="pt-[25px]">
        <div className="max-w-[760px]">
          <h1 className="m-0 text-[clamp(1.24rem,2.24vw,2.08rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#1d1d1d]">
            Cost Codes
          </h1>
          <p className={`${interMedium.className} mt-[0.65rem] text-[15px] leading-[1.45] text-[#6b6b6b]`}>
            Configure the company cost codes Tradesstack should use for accounting exports, default routing,
            and advanced mapping rules.
          </p>
        </div>
      </section>

      <div className="space-y-3">
        {!canEdit ? (
          <div className="rounded-[12px] border border-[#F0E1A8] bg-[#FBF2C8] px-4 py-3">
            <p className={`${interMedium.className} text-[14px] text-[#8A6A00]`}>
              You can review company cost code setup here, but only owner and admin roles can change it.
            </p>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[12px] border border-[#F4CCCC] bg-[#FFF1F1] px-4 py-3">
            <p className={`${interMedium.className} text-[14px] text-[#9F2F2F]`}>{error}</p>
          </div>
        ) : null}
        {message ? (
          <div className="rounded-[12px] border border-[#CDE9DA] bg-[#EAF8F1] px-4 py-3">
            <p className={`${interMedium.className} text-[14px] text-[#166534]`}>{message}</p>
          </div>
        ) : null}
      </div>

      <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]">
              Company Cost Codes
            </CardTitle>
            <Button
              type="button"
              onClick={handleStartAddCostCode}
              disabled={!canEdit || isPending || editingCostCodeId === NEW_COST_CODE_ROW_ID}
              className="rounded-[0.5rem] bg-[#0B2739] hover:bg-[#081D2B]"
            >
              Add Cost Code
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {costCodes.length === 0 ? (
            editingCostCodeId === NEW_COST_CODE_ROW_ID ? (
              <div className="overflow-hidden rounded-[12px] border border-[#E2E8F1]">
                <div className="grid grid-cols-[110px_170px_minmax(0,1fr)_110px_120px_auto] gap-3 border-b border-[#E2E8F1] bg-[#F8FAFB] px-5 py-3">
                  {["Code", "Name", "Description", "Default", "Status", "Action"].map((heading) => (
                    <span
                      key={heading}
                      className={`${ibmPlexSans.className} text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}
                    >
                      {heading}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-[110px_170px_minmax(0,1fr)_110px_120px_auto] gap-3 bg-[#FFFDFC] px-5 py-4">
                  <Input
                    value={codeForm.code}
                    onChange={(event) => setCodeForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="200"
                    disabled={!canEdit || isPending}
                    className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                  />
                  <Input
                    value={codeForm.name}
                    onChange={(event) => setCodeForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Material"
                    disabled={!canEdit || isPending}
                    className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                  />
                  <Input
                    value={codeForm.description}
                    onChange={(event) =>
                      setCodeForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Optional note for your finance team"
                    disabled={!canEdit || isPending}
                    className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                  />
                  <label className={`${ibmPlexSans.className} flex h-[42px] items-center gap-2 text-[13px] text-[#475569]`}>
                    <input
                      type="checkbox"
                      checked={codeForm.isDefault}
                      onChange={(event) =>
                        setCodeForm((current) => ({ ...current, isDefault: event.target.checked }))
                      }
                      disabled={!canEdit || isPending}
                    />
                    Default
                  </label>
                  <span className={`${ibmPlexSans.className} flex h-[42px] items-center text-[13px] text-[#64748B]`}>
                    New
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetCodeForm}
                      disabled={!canEdit || isPending}
                      className="rounded-[0.5rem]"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveCostCode}
                      disabled={!canEdit || isPending}
                      className="rounded-[0.5rem] bg-[#0B2739] hover:bg-[#081D2B]"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
                <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                  No company cost codes yet. Add your first code to start mapping finalized cost items.
                </p>
              </div>
            )
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-[#E2E8F1]">
              <div className="grid grid-cols-[110px_170px_minmax(0,1fr)_110px_120px_auto] gap-3 border-b border-[#E2E8F1] bg-[#F8FAFB] px-5 py-3">
                {["Code", "Name", "Description", "Default", "Status", "Action"].map((heading) => (
                  <span
                    key={heading}
                    className={`${ibmPlexSans.className} text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}
                  >
                    {heading}
                  </span>
                ))}
              </div>
              {editingCostCodeId === NEW_COST_CODE_ROW_ID ? (
                <div className="grid grid-cols-[110px_170px_minmax(0,1fr)_110px_120px_auto] gap-3 border-b border-[#E2E8F1] bg-[#FFFDFC] px-5 py-4">
                  <Input
                    value={codeForm.code}
                    onChange={(event) => setCodeForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="200"
                    disabled={!canEdit || isPending}
                    className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                  />
                  <Input
                    value={codeForm.name}
                    onChange={(event) => setCodeForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Material"
                    disabled={!canEdit || isPending}
                    className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                  />
                  <Input
                    value={codeForm.description}
                    onChange={(event) =>
                      setCodeForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Optional note for your finance team"
                    disabled={!canEdit || isPending}
                    className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                  />
                  <label className={`${ibmPlexSans.className} flex h-[42px] items-center gap-2 text-[13px] text-[#475569]`}>
                    <input
                      type="checkbox"
                      checked={codeForm.isDefault}
                      onChange={(event) =>
                        setCodeForm((current) => ({ ...current, isDefault: event.target.checked }))
                      }
                      disabled={!canEdit || isPending}
                    />
                    Default
                  </label>
                  <span className={`${ibmPlexSans.className} flex h-[42px] items-center text-[13px] text-[#64748B]`}>
                    New
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetCodeForm}
                      disabled={!canEdit || isPending}
                      className="rounded-[0.5rem]"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveCostCode}
                      disabled={!canEdit || isPending}
                      className="rounded-[0.5rem] bg-[#0B2739] hover:bg-[#081D2B]"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : null}
              {costCodes.map((costCode) => (
                editingCostCodeId === costCode.id ? (
                  <div
                    key={costCode.id}
                    className="grid grid-cols-[110px_170px_minmax(0,1fr)_110px_120px_auto] gap-3 border-b border-[#E2E8F1] bg-[#FFFDFC] px-5 py-4 text-sm last:border-b-0"
                  >
                    <Input
                      value={codeForm.code}
                      onChange={(event) => setCodeForm((current) => ({ ...current, code: event.target.value }))}
                      placeholder="200"
                      disabled={!canEdit || isPending}
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                    <Input
                      value={codeForm.name}
                      onChange={(event) => setCodeForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Material"
                      disabled={!canEdit || isPending}
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                    <Input
                      value={codeForm.description}
                      onChange={(event) =>
                        setCodeForm((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Optional note for your finance team"
                      disabled={!canEdit || isPending}
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                    <label className={`${ibmPlexSans.className} flex h-[42px] items-center gap-2 text-[13px] text-[#475569]`}>
                      <input
                        type="checkbox"
                        checked={codeForm.isDefault}
                        onChange={(event) =>
                          setCodeForm((current) => ({ ...current, isDefault: event.target.checked }))
                        }
                        disabled={!canEdit || isPending}
                      />
                      Default
                    </label>
                    <span className={`${ibmPlexSans.className} flex h-[42px] items-center text-[13px] text-[#64748B]`}>
                      Editing
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={resetCodeForm}
                        disabled={!canEdit || isPending}
                        className="rounded-[0.5rem]"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveCostCode}
                        disabled={!canEdit || isPending}
                        className="rounded-[0.5rem] bg-[#0B2739] hover:bg-[#081D2B]"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={costCode.id}
                    className="grid grid-cols-[110px_170px_minmax(0,1fr)_110px_120px_auto] gap-3 border-b border-[#E2E8F1] px-5 py-4 text-sm last:border-b-0"
                  >
                    <span className={`${ibmPlexSans.className} font-semibold text-[#10283B]`}>{costCode.code}</span>
                    <p className={`${ibmPlexSans.className} truncate text-[14px] font-semibold text-[#10283B]`}>
                      {costCode.name}
                    </p>
                    <div className="min-w-0">
                      <p className={`${interMedium.className} truncate text-[13px] text-[#6A7A89]`}>
                        {costCode.description || "No description"}
                      </p>
                    </div>
                    <span className={`${ibmPlexSans.className} inline-flex h-fit rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                      costCode.is_default
                        ? "border-[#D7E3F7] bg-[#EEF4FF] text-[#285EA8]"
                        : "border-[#E2E8F1] bg-[#F8FAFB] text-[#64748B]"
                    }`}>
                      {costCode.is_default ? "Default" : "Optional"}
                    </span>
                    <span
                      className={`${ibmPlexSans.className} inline-flex h-fit rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                        costCode.is_active
                          ? "border-[#CDE9DA] bg-[#EAF8F1] text-[#166534]"
                          : "border-[#E2E8F1] bg-[#F8FAFB] text-[#64748B]"
                      }`}
                    >
                      {costCode.is_active ? "Active" : "Archived"}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-[0.5rem]"
                        onClick={() => handleEditCostCode(costCode)}
                        disabled={!canEdit || isPending}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-[0.5rem]"
                        onClick={() => handleToggleDefaultCostCode(costCode.id, !costCode.is_default)}
                        disabled={!canEdit || isPending || !costCode.is_active}
                      >
                        {costCode.is_default ? "Clear Default" : "Set Default"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-[0.5rem]"
                        onClick={() => handleToggleCostCodeActive(costCode.id, !costCode.is_active)}
                        disabled={!canEdit || isPending}
                      >
                        {costCode.is_active ? "Archive" : "Restore"}
                      </Button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]">
            Quick Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={`${interMedium.className} text-[14px] leading-[1.5] text-[#6A7A89]`}>
            Assign the most common cost categories first. These defaults cover the majority of
            accounting mappings without needing advanced rules.
          </p>
          <div className="space-y-3">
            {QUICK_SETUP_OPTIONS.map((option) => (
              <div key={option.key} className="rounded-[12px] border border-[#E2E8F1] bg-[#FBFEFE] p-4">
                <label className={`${ibmPlexSans.className} mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                  {option.label}
                </label>
                <select
                  value={quickSetupSelections[option.key]}
                  onChange={(event) =>
                    setQuickSetupSelections((current) => ({
                      ...current,
                      [option.key]: event.target.value,
                    }))
                  }
                  disabled={!canEdit || isPending || activeCostCodes.length === 0}
                  className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 text-[14px] text-[#10283B]`}
                >
                  <option value="">Not set</option>
                  {activeCostCodes.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} - {row.name}
                    </option>
                  ))}
                </select>
                <p className={`${interMedium.className} mt-2 text-[13px] text-[#6A7A89]`}>{option.help}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveQuickSetup}
              disabled={!canEdit || isPending || activeCostCodes.length === 0}
              className="rounded-[0.5rem] bg-[#0B2739] hover:bg-[#081D2B]"
            >
              Save Quick Setup
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)] shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-[20px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]">
            Items Needing a Company Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={`${interMedium.className} text-[14px] leading-[1.5] text-[#6A7A89]`}>
            These items are already classified by Tradesstack. They only need one of your company cost
            codes so exports and downstream accounting stay consistent.
          </p>
          {unresolvedRows.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-[#FBFEFE] px-6 py-8 text-center">
              <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                No items are waiting for a company code right now.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse overflow-hidden rounded-[12px] border border-[#E2E8F1]">
                <thead>
                  <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
                    {["Description", "Work Type", "Cost Type", "Choose Company Code", "Action"].map((heading) => (
                      <th
                        key={heading}
                        className={`${ibmPlexSans.className} px-5 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unresolvedRows.map((row) => (
                    <tr key={row.costItemId} className="border-b border-[#E2E8F1] align-top last:border-b-0">
                      <td className="px-5 py-4">
                        <div className="max-w-[360px]">
                          <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
                            {row.description || row.title || row.sourceDocumentKind}
                          </p>
                          {row.projectName ? (
                            <p className={`${interMedium.className} mt-1 text-[13px] text-[#94A3B8]`}>
                              {row.projectName}
                            </p>
                          ) : null}
                          <details className="mt-2">
                            <summary className={`${interMedium.className} cursor-pointer text-[12px] text-[#64748B]`}>
                              Advanced details
                            </summary>
                            <div className={`${interMedium.className} mt-2 text-[12px] text-[#64748B]`}>
                              <p>Tradesstack code: {row.intelligenceCostCode ?? "-"}</p>
                              <p>Document type: {row.sourceDocumentKind}</p>
                            </div>
                          </details>
                        </div>
                      </td>
                      <td className={`${ibmPlexSans.className} px-5 py-4 text-[14px] text-[#10283B]`}>
                        {row.workType ?? "-"}
                      </td>
                      <td className={`${ibmPlexSans.className} px-5 py-4 text-[14px] text-[#10283B]`}>
                        {row.costType ?? "-"}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={reviewSelections[row.costItemId] ?? ""}
                          onChange={(event) =>
                            setReviewSelections((current) => ({
                              ...current,
                              [row.costItemId]: event.target.value,
                            }))
                          }
                          disabled={!canEdit || isPending || activeCostCodes.length === 0}
                          className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 text-[14px] text-[#10283B]`}
                        >
                          <option value="">Choose a company code</option>
                          {activeCostCodes.map((costCode) => (
                            <option key={costCode.id} value={costCode.id}>
                              {costCode.code} - {costCode.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-[0.5rem]"
                          onClick={() => handleApplyReviewSelection(row)}
                          disabled={!canEdit || isPending || !reviewSelections[row.costItemId]}
                        >
                          Save
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <details className="overflow-hidden rounded-[14px] border border-[#E2E8F1] bg-[var(--app-surface)]">
        <summary className={`${ibmPlexSans.className} cursor-pointer list-none px-6 py-5 text-[20px] font-semibold text-[#10283B]`}>
          Advanced Mapping
        </summary>
        <div className="space-y-6 border-t border-[#E2E8F1] px-6 py-6">
          <p className={`${interMedium.className} max-w-[920px] text-[14px] leading-[1.5] text-[#6A7A89]`}>
            Use advanced mapping when you need rule-based routing beyond the quick setup defaults. This
            exposes the internal inputs Tradesstack uses when resolving a company cost code.
          </p>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card className="overflow-hidden rounded-[12px] border border-[#E2E8F1] bg-[#FCFDFE] shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-[18px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]">
                  Advanced Rule Builder
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                      Rule Type
                    </label>
                    <select
                      value={advancedRuleForm.ruleType}
                      onChange={(event) =>
                        setAdvancedRuleForm((current) => ({
                          ...current,
                          ruleType: event.target.value as OrganizationCostCodeRuleType,
                        }))
                      }
                      disabled={!canEdit || isPending}
                      className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 text-[14px] text-[#10283B]`}
                    >
                      {ADVANCED_RULE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                      Target Company Code
                    </label>
                    <select
                      value={advancedRuleForm.targetCostCodeId}
                      onChange={(event) =>
                        setAdvancedRuleForm((current) => ({ ...current, targetCostCodeId: event.target.value }))
                      }
                      disabled={!canEdit || isPending}
                      className={`${ibmPlexSans.className} h-[42px] w-full rounded-[0.8rem] border border-[#E2E8F1] bg-white px-3 text-[14px] text-[#10283B]`}
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
                    <label className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
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
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                  </div>
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                      Work Type
                    </label>
                    <Input
                      value={advancedRuleForm.workType}
                      onChange={(event) =>
                        setAdvancedRuleForm((current) => ({ ...current, workType: event.target.value }))
                      }
                      placeholder="Wall Linings"
                      disabled={!canEdit || isPending}
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                  </div>
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                      Cost Type
                    </label>
                    <Input
                      value={advancedRuleForm.costType}
                      onChange={(event) =>
                        setAdvancedRuleForm((current) => ({ ...current, costType: event.target.value }))
                      }
                      placeholder="MAT"
                      disabled={!canEdit || isPending}
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                  </div>
                  <div>
                    <label className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                      Rule Priority
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={advancedRuleForm.priority}
                      onChange={(event) =>
                        setAdvancedRuleForm((current) => ({ ...current, priority: event.target.value }))
                      }
                      disabled={!canEdit || isPending}
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={`${ibmPlexSans.className} mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}>
                      Notes
                    </label>
                    <Input
                      value={advancedRuleForm.notes}
                      onChange={(event) =>
                        setAdvancedRuleForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Optional context for advanced users"
                      disabled={!canEdit || isPending}
                      className="h-[42px] rounded-[0.8rem] border-[#E2E8F1]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleCreateAdvancedRule}
                    disabled={!canEdit || isPending || activeCostCodes.length === 0}
                    className="rounded-[0.5rem] bg-[#0B2739] hover:bg-[#081D2B]"
                  >
                    Save Advanced Rule
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="overflow-hidden rounded-[12px] border border-[#E2E8F1] bg-[#FCFDFE] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[18px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]">
                    Advanced Mapping List
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mappingRules.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-white px-6 py-8 text-center">
                      <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                        No advanced mappings added yet.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[12px] border border-[#E2E8F1]">
                      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto_auto] gap-3 border-b border-[#E2E8F1] bg-[#F8FAFB] px-5 py-3">
                        {["Rule", "Target", "Status", "Action"].map((heading) => (
                          <span
                            key={heading}
                            className={`${ibmPlexSans.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}
                          >
                            {heading}
                          </span>
                        ))}
                      </div>
                      {mappingRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto_auto] gap-3 border-b border-[#E2E8F1] px-5 py-4 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className={`${ibmPlexSans.className} truncate text-[14px] font-semibold text-[#10283B]`}>
                              {formatAdvancedRuleLabel(rule)}
                            </p>
                            <p className={`${interMedium.className} truncate text-[13px] text-[#6A7A89]`}>
                              Priority {rule.priority}
                            </p>
                            {rule.notes ? (
                              <p className={`${interMedium.className} truncate text-[13px] text-[#94A3B8]`}>
                                {rule.notes}
                              </p>
                            ) : null}
                          </div>
                          <span className={`${ibmPlexSans.className} truncate text-[14px] text-[#10283B]`}>
                            {costCodeNameById.get(rule.target_cost_code_id) ?? "Unknown code"}
                          </span>
                          <span
                            className={`${ibmPlexSans.className} inline-flex h-fit rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                              rule.is_active
                                ? "border-[#CDE9DA] bg-[#EAF8F1] text-[#166534]"
                                : "border-[#E2E8F1] bg-[#F8FAFB] text-[#64748B]"
                            }`}
                          >
                            {rule.is_active ? "Active" : "Archived"}
                          </span>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-[0.5rem]"
                              onClick={() => handleToggleRuleActive(rule.id, !rule.is_active)}
                              disabled={!canEdit || isPending}
                            >
                              {rule.is_active ? "Archive" : "Restore"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-[12px] border border-[#E2E8F1] bg-[#FCFDFE] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[18px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#10283B]">
                    Advanced Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {previewRows.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-[#CBD7E2] bg-white px-6 py-8 text-center">
                      <p className={`${ibmPlexSans.className} text-[15px] text-[#6A7A89]`}>
                        No items available for advanced preview yet.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] border-collapse overflow-hidden rounded-[12px] border border-[#E2E8F1]">
                        <thead>
                          <tr className="border-b border-[#E2E8F1] bg-[#F8FAFB]">
                            {["Tradesstack Detail", "Work Type", "Cost Type", "Company Code", "Status"].map(
                              (heading) => (
                                <th
                                  key={heading}
                                  className={`${ibmPlexSans.className} px-5 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#44556C]`}
                                >
                                  {heading}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row) => (
                            <tr key={row.costItemId} className="border-b border-[#E2E8F1] last:border-b-0">
                              <td className="px-5 py-4">
                                <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
                                  {row.intelligenceCostCode ?? "Unclassified"}
                                </p>
                                <p className={`${interMedium.className} mt-1 text-[13px] text-[#6A7A89]`}>
                                  {row.description || row.title || row.sourceDocumentKind}
                                </p>
                              </td>
                              <td className={`${ibmPlexSans.className} px-5 py-4 text-[14px] text-[#10283B]`}>
                                {row.workType ?? "-"}
                              </td>
                              <td className={`${ibmPlexSans.className} px-5 py-4 text-[14px] text-[#10283B]`}>
                                {row.costType ?? "-"}
                              </td>
                              <td className="px-5 py-4">
                                <p className={`${ibmPlexSans.className} text-[14px] font-semibold text-[#10283B]`}>
                                  {row.resolution.code ? `${row.resolution.code} - ${row.resolution.name ?? ""}` : "-"}
                                </p>
                                {row.resolution.matchedRuleType ? (
                                  <p className={`${interMedium.className} mt-1 text-[13px] text-[#6A7A89]`}>
                                    via {row.resolution.matchedRuleType}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-5 py-4">
                                <span
                                  className={`${ibmPlexSans.className} inline-flex rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusClassName(row.resolution.status)}`}
                                >
                                  {formatAdvancedStatus(row.resolution.status)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </details>
    </main>
  );
}
