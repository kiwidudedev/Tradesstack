import assert from "node:assert/strict";
import test from "node:test";
import { runIsolatedClientSupabaseProof } from "./index.js";

const apiUrl = process.env.PHASE1N_SUPABASE_URL;
const anonKey = process.env.PHASE1N_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.PHASE1N_SUPABASE_SERVICE_ROLE_KEY;

test("isolated client Auth, tenancy, Supplier persistence and RLS acceptance", async (t) => {
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    t.skip("Phase 1N local Supabase environment variables are not configured.");
    return;
  }

  const result = await runIsolatedClientSupabaseProof({ apiUrl, anonKey, serviceRoleKey });
  assert.deepEqual(result.ownerAVisibleSupplierIds.length, 1);
  assert.deepEqual(result.ownerBVisibleSupplierIds.length, 1);
  assert.equal(result.crossOrganizationInsertDenied, true);
  assert.equal(result.crossOrganizationUpdateDenied, true);
  assert.equal(result.crossOrganizationDeleteDenied, true);
  assert.equal(result.missingPermissionDenied, true);
  assert.equal(result.anonymousDenied, true);
});
