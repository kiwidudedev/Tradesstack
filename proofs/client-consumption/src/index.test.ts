import assert from "node:assert/strict";
import test from "node:test";
import { runClientSupplierProof } from "./index.js";

test("consumes the packed Supplier contract with client-owned persistence", () => {
  const result = runClientSupplierProof();

  assert.deepEqual(result.reference, {
    id: "client-proof-supplier-1",
    displayName: "Disposable Client Proof Supplier",
    isActive: true,
  });
  assert.equal(result.normalizedWebsite, "https://supplier.example");
  assert.deepEqual(result.paymentTerms, [
    "days_after_bill_date",
    "days_after_bill_month",
    "of_current_month",
    "of_following_month",
  ]);
  assert.equal(result.validatedWrite.countryCode, "NZ");
  assert.equal(result.validatedWrite.defaultCurrencyCode, "NZD");
  assert.equal(result.validatedWrite.paymentTermsDay, 14);
  assert.equal(result.invalidField, "Supplier name is required.");
});
