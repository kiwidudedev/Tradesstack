export type CostScenario = "small" | "medium" | "large";

export type CostScenarioDefinition = {
  storageGb: number;
  requests: number;
  cpuMs: number;
  reads: number;
  writes: number;
};

export type CostLineItem = {
  name: string;
  amount: number;
};

export const COST_SCENARIOS: Record<CostScenario, CostScenarioDefinition> = {
  small: { storageGb: 20, requests: 1_500_000, cpuMs: 6_000_000, reads: 100_000, writes: 10_000 },
  medium: { storageGb: 100, requests: 4_000_000, cpuMs: 16_000_000, reads: 500_000, writes: 50_000 },
  large: { storageGb: 500, requests: 12_000_000, cpuMs: 50_000_000, reads: 2_000_000, writes: 200_000 },
};

const maxOverage = (usage: number, included: number) => Math.max(0, usage - included);

export function calculateInfrastructureCost(customers: number, scenario: CostScenario): {
  lineItems: CostLineItem[];
  total: number;
} {
  if (!Number.isInteger(customers) || customers < 1) throw new Error("customers must be a positive integer");
  const usage = COST_SCENARIOS[scenario];
  if (!usage) throw new Error(`Unknown cost scenario: ${scenario}`);

  const requests = usage.requests * customers;
  const cpuMs = usage.cpuMs * customers;
  const reads = usage.reads * customers;
  const writes = usage.writes * customers;
  const workers = 5 + maxOverage(requests, 10_000_000) * 0.30 / 1_000_000 + maxOverage(cpuMs, 30_000_000) * 0.02 / 1_000_000;
  const r2 = maxOverage(usage.storageGb * customers, 10) * 0.015
    + maxOverage(writes, 1_000_000) * 4.5 / 1_000_000
    + maxOverage(reads, 10_000_000) * 0.36 / 1_000_000;

  const lineItems = [
    { name: "Workers Paid", amount: workers },
    { name: "R2", amount: r2 },
  ];
  return { lineItems, total: lineItems.reduce((sum, item) => sum + item.amount, 0) };
}

