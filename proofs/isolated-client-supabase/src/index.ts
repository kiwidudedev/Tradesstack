import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SupplierValidationError,
  validateSupplierWriteInput,
  type SupplierReference,
} from "@tradesstack/suppliers";

type ProofConfig = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

type SupplierRow = {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  company_name: string;
  is_active: boolean;
};

const proofEmailSuffix = (process.env.PHASE1N_PROOF_SUFFIX ?? "default").replace(/[^a-z0-9-]/gi, "-").toLowerCase();

function proofEmail(localPart: string) {
  return `${localPart}+${proofEmailSuffix}@tradesstack-client-proof.example.test`;
}

function ordinaryClient(config: ProofConfig): SupabaseClient {
  return createClient(config.apiUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function adminClient(config: ProofConfig): SupabaseClient {
  return createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createLocalUser(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  organizationName?: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "phase1n-local-proof-password",
    email_confirm: true,
    user_metadata: { full_name: fullName, organization_name: organizationName },
  });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${email}.`);
  return data.user;
}

async function organizationForUser(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw error ?? new Error("Organization membership was not bootstrapped.");
  assert.ok(data.role === "owner" || data.role === "admin");
  return data.organization_id as string;
}

async function signIn(config: ProofConfig, email: string) {
  const client = ordinaryClient(config);
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "phase1n-local-proof-password",
  });
  if (error) throw error;
  return client;
}

async function createSupplier(client: SupabaseClient, organizationId: string, userId: string, name: string) {
  const input = validateSupplierWriteInput({
    name,
    website: "supplier.example",
    countryCode: "nz",
    defaultCurrencyCode: "nzd",
    isActive: true,
  });
  const { data, error } = await client
    .from("organization_suppliers")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      name: input.name,
      company_name: input.legalName ?? input.name,
      is_active: input.isActive,
      default_payment_terms: input.defaultPaymentTerms,
      source: "manual",
    })
    .select("id,organization_id,created_by,name,company_name,is_active")
    .single();
  if (error || !data) throw error ?? new Error(`Unable to create ${name}.`);
  return data as SupplierRow;
}

function toSupplierReference(row: SupplierRow): SupplierReference {
  return {
    id: row.id,
    displayName: row.company_name.trim() || row.name.trim(),
    isActive: row.is_active,
  };
}

async function rowsVisibleTo(client: SupabaseClient) {
  const { data, error } = await client
    .from("organization_suppliers")
    .select("id,organization_id,created_by,name,company_name,is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as SupplierRow[];
}

export async function runIsolatedClientSupabaseProof(config: ProofConfig) {
  const admin = adminClient(config);
  const ownerAEmail = proofEmail("owner-a");
  const ownerBEmail = proofEmail("owner-b");
  const memberAEmail = proofEmail("member-a");
  const ownerA = await createLocalUser(admin, ownerAEmail, "Owner A", "Client Proof Organization A");
  const ownerB = await createLocalUser(admin, ownerBEmail, "Owner B", "Client Proof Organization B");
  const organizationA = await organizationForUser(admin, ownerA.id);
  const organizationB = await organizationForUser(admin, ownerB.id);

  const invite = await admin.from("organization_invites").insert({
    organization_id: organizationA,
    invited_email: memberAEmail,
    invited_by: ownerA.id,
    role: "worker",
  }).select("id").single();
  if (invite.error) throw invite.error;
  const memberA = await createLocalUser(admin, memberAEmail, "Member A");

  const clientA = await signIn(config, ownerAEmail);
  const clientB = await signIn(config, ownerBEmail);
  const memberClient = await signIn(config, memberAEmail);

  const supplierA = await createSupplier(clientA, organizationA, ownerA.id, "Client Supplier A");
  const supplierB = await createSupplier(clientB, organizationB, ownerB.id, "Client Supplier B");

  const visibleToA = await rowsVisibleTo(clientA);
  const visibleToB = await rowsVisibleTo(clientB);
  assert.deepEqual(visibleToA.map((row) => row.id), [supplierA.id]);
  assert.deepEqual(visibleToB.map((row) => row.id), [supplierB.id]);

  const crossOrgInsert = await clientA.from("organization_suppliers").insert({
    organization_id: organizationB,
    created_by: ownerA.id,
    name: "Cross Organization Insert",
    company_name: "Cross Organization Insert",
  }).select("id");
  assert.ok(crossOrgInsert.error || crossOrgInsert.data?.length === 0);

  const crossOrgUpdate = await clientA.from("organization_suppliers")
    .update({ name: "Unauthorized Update" })
    .eq("id", supplierB.id)
    .select("id");
  assert.equal(crossOrgUpdate.error, null);
  assert.equal(crossOrgUpdate.data?.length ?? 0, 0);

  const crossOrgDelete = await clientA.from("organization_suppliers")
    .delete()
    .eq("id", supplierB.id)
    .select("id");
  assert.equal(crossOrgDelete.error, null);
  assert.equal(crossOrgDelete.data?.length ?? 0, 0);

  const missingPermissionInsert = await memberClient.from("organization_suppliers").insert({
    organization_id: organizationA,
    created_by: memberA.id,
    name: "Missing Permission Insert",
    company_name: "Missing Permission Insert",
  }).select("id");
  assert.ok(missingPermissionInsert.error || missingPermissionInsert.data?.length === 0);

  const anonymous = createClient(config.apiUrl, config.anonKey, { auth: { persistSession: false } });
  const anonymousRows = await rowsVisibleTo(anonymous);
  assert.equal(anonymousRows.length, 0);

  const reference = toSupplierReference(visibleToA[0]);
  assert.deepEqual(reference, {
    id: supplierA.id,
    displayName: "Client Supplier A",
    isActive: true,
  });

  let invalidInputRejected = false;
  try {
    validateSupplierWriteInput({ name: "", primaryContactEmail: "invalid" });
  } catch (error) {
    invalidInputRejected = error instanceof SupplierValidationError;
  }
  assert.equal(invalidInputRejected, true);

  return {
    organizations: 2,
    users: 3,
    suppliers: 2,
    ownerAVisibleSupplierIds: visibleToA.map((row) => row.id),
    ownerBVisibleSupplierIds: visibleToB.map((row) => row.id),
    supplierReference: reference,
    crossOrganizationInsertDenied: Boolean(crossOrgInsert.error) || crossOrgInsert.data?.length === 0,
    crossOrganizationUpdateDenied: (crossOrgUpdate.data?.length ?? 0) === 0,
    crossOrganizationDeleteDenied: (crossOrgDelete.data?.length ?? 0) === 0,
    missingPermissionDenied: Boolean(missingPermissionInsert.error) || missingPermissionInsert.data?.length === 0,
    anonymousDenied: anonymousRows.length === 0,
  };
}
