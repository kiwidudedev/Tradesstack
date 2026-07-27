import {
  type UniversalLearningContainerType,
  UNIVERSAL_LEARNING_CONTAINER_TYPES,
} from "@/lib/universal-learning/types";

export type UniversalLearningContainerRolloutConfig = {
  containerType: UniversalLearningContainerType;
  enabled: boolean;
  minimumRecordCount: number;
  priority: number;
  rolloutTier: "internal" | "beta" | "production";
};

const CONFIG: Record<UniversalLearningContainerType, UniversalLearningContainerRolloutConfig> = {
  pricing_workbook_sheet: {
    containerType: "pricing_workbook_sheet",
    enabled: true,
    minimumRecordCount: 1,
    priority: 70,
    rolloutTier: "internal",
  },
  takeoff_measurement: {
    containerType: "takeoff_measurement",
    enabled: true,
    minimumRecordCount: 3,
    priority: 45,
    rolloutTier: "production",
  },
  project_quote: {
    containerType: "project_quote",
    enabled: true,
    minimumRecordCount: 1,
    priority: 75,
    rolloutTier: "production",
  },
  project_variation: {
    containerType: "project_variation",
    enabled: true,
    minimumRecordCount: 1,
    priority: 85,
    rolloutTier: "production",
  },
  project_purchase_order: {
    containerType: "project_purchase_order",
    enabled: true,
    minimumRecordCount: 2,
    priority: 95,
    rolloutTier: "production",
  },
  supplier_invoice: {
    containerType: "supplier_invoice",
    enabled: true,
    minimumRecordCount: 3,
    priority: 90,
    rolloutTier: "production",
  },
  supplier_invoice_allocation: {
    containerType: "supplier_invoice_allocation",
    enabled: true,
    minimumRecordCount: 5,
    priority: 100,
    rolloutTier: "production",
  },
  project_actual_cost_event: {
    containerType: "project_actual_cost_event",
    enabled: true,
    minimumRecordCount: 5,
    priority: 65,
    rolloutTier: "production",
  },
  organization_material: {
    containerType: "organization_material",
    enabled: true,
    minimumRecordCount: 3,
    priority: 55,
    rolloutTier: "production",
  },
  material_import_batch: {
    containerType: "material_import_batch",
    enabled: true,
    minimumRecordCount: 1,
    priority: 55,
    rolloutTier: "beta",
  },
  project_claim: {
    containerType: "project_claim",
    enabled: true,
    minimumRecordCount: 1,
    priority: 85,
    rolloutTier: "production",
  },
  project_time_sheet_entry: {
    containerType: "project_time_sheet_entry",
    enabled: false,
    minimumRecordCount: 10,
    priority: 35,
    rolloutTier: "internal",
  },
  project_quality_issue: {
    containerType: "project_quality_issue",
    enabled: true,
    minimumRecordCount: 3,
    priority: 35,
    rolloutTier: "internal",
  },
  project_quality_inspection: {
    containerType: "project_quality_inspection",
    enabled: true,
    minimumRecordCount: 1,
    priority: 30,
    rolloutTier: "internal",
  },
  project_quality_sign_off: {
    containerType: "project_quality_sign_off",
    enabled: true,
    minimumRecordCount: 1,
    priority: 30,
    rolloutTier: "internal",
  },
  task: {
    containerType: "task",
    enabled: false,
    minimumRecordCount: 10,
    priority: 25,
    rolloutTier: "internal",
  },
};

function parseCsv(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function getUniversalLearningContainerRolloutConfig(
  containerType: UniversalLearningContainerType,
): UniversalLearningContainerRolloutConfig {
  const enabledOverrides = parseCsv(process.env.UNIVERSAL_LEARNING_ENABLED_CONTAINERS);
  const disabledOverrides = parseCsv(process.env.UNIVERSAL_LEARNING_DISABLED_CONTAINERS);
  const config = CONFIG[containerType];
  const enabled = enabledOverrides.size > 0
    ? enabledOverrides.has(containerType)
    : disabledOverrides.has(containerType)
      ? false
      : config.enabled;

  return {
    ...config,
    enabled,
  };
}

export function listUniversalLearningContainerRolloutConfigs() {
  return UNIVERSAL_LEARNING_CONTAINER_TYPES.map(getUniversalLearningContainerRolloutConfig);
}

export function isUniversalLearningEnabledForOrganization(organizationId: string) {
  const enabledOrganizations = parseCsv(process.env.UNIVERSAL_LEARNING_ENABLED_ORGANIZATION_IDS);
  const disabledOrganizations = parseCsv(process.env.UNIVERSAL_LEARNING_DISABLED_ORGANIZATION_IDS);

  if (disabledOrganizations.has(organizationId)) {
    return false;
  }
  if (enabledOrganizations.size > 0) {
    return enabledOrganizations.has(organizationId);
  }
  return true;
}
