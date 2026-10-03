import { ROOT } from "./lib.mjs";
import { assembleOperationalContract, validateOperationalContract } from "./control-plane-contract.mjs";

const contract = assembleOperationalContract({ root: ROOT });
const errors = validateOperationalContract(contract);
const json = process.argv.includes("--json");
if (json) console.log(JSON.stringify(contract, null, 2));
else {
  console.log(`Control Plane operational contract: ${errors.length ? "INVALID" : "PASS"}`);
  console.log(`  - customers: ${contract.customers.length}`);
  for (const customer of contract.customers) {
    console.log(`  - ${customer.customerId}: lifecycle=${customer.lifecycle.value}; target=${customer.release.customerTargetRelease.value}; observedCustomerSha=${customer.repository.observedCustomerSha.value ?? "UNKNOWN"}; lastRecordedSha=${customer.repository.lastRecordedCustomerSha.value ?? "UNKNOWN"}; providerState=NOT_VERIFIED`);
  }
  for (const error of errors) console.log(`  - ${error}`);
}
if (errors.length) process.exitCode = 1;
