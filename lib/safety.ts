import { supabase } from "./supabase";

export type SafetyRecord = {
  id: string;
  business_id: string;
  job_id: string;
  created_by: string;
  title: string;
  site: string;
  notes: string | null;
  status: string;
  occurred_on: string;
  created_at: string;
  updated_at?: string | null;
};

export type SafetyRecordPayload = {
  title: string;
  site: string;
  notes?: string | null;
  status?: string;
  occurred_on?: string;
};

export type SafetyStatus = "draft" | "submitted";

export const normalizeSafetyStatus = (input?: string | null): SafetyStatus => {
  const value = (input ?? "").trim().toLowerCase();
  if (value === "submitted") return "submitted";
  if (value === "draft" || value === "drafted") return "draft";
  return "draft";
};

export async function listSafetyRecords(businessId: string) {
  const { data, error } = await supabase
    .from("safety_records")
    .select("id, business_id, job_id, created_by, title, site, notes, status, occurred_on, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SafetyRecord[];
}

export async function listSafetyRecordsByJobId(jobId: string) {
  const { data, error } = await supabase
    .from("safety_records")
    .select("id, job_id, title, status, occurred_on, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Array<{
    id: string;
    job_id: string;
    title: string;
    status: string;
    occurred_on: string;
    created_at: string;
  }>;
}

export async function createSafetyRecord(
  businessId: string,
  userId: string,
  jobId: string,
  payload: SafetyRecordPayload
) {
  const occurredOn = payload.occurred_on ?? new Date().toISOString().slice(0, 10);
  const status = normalizeSafetyStatus(payload.status);

  const { data, error } = await supabase
    .from("safety_records")
    .insert({
      business_id: businessId,
      job_id: jobId,
      created_by: userId,
      title: payload.title,
      site: payload.site,
      notes: payload.notes ?? null,
      status,
      occurred_on: occurredOn
    })
    .select("id, business_id, job_id, created_by, title, site, notes, status, occurred_on, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create safety record.");
  }

  return data as SafetyRecord;
}

export async function getSafetyRecordById(id: string) {
  const { data, error } = await supabase
    .from("safety_records")
    .select("id, business_id, job_id, created_by, title, site, notes, status, occurred_on, created_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load safety record.");
  }

  return data as SafetyRecord;
}

export async function updateSafetyRecord(id: string, payload: SafetyRecordPayload) {
  const { data, error } = await supabase
    .from("safety_records")
    .update({
      title: payload.title,
      site: payload.site,
      notes: payload.notes ?? null,
      status: normalizeSafetyStatus(payload.status),
      occurred_on: payload.occurred_on ?? new Date().toISOString().slice(0, 10)
    })
    .eq("id", id)
    .select("id, business_id, job_id, created_by, title, site, notes, status, occurred_on, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update safety record.");
  }

  return data as SafetyRecord;
}

export async function deleteSafetyRecord(id: string) {
  const { error } = await supabase.from("safety_records").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
