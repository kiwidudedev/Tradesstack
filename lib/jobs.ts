import { supabase } from "./supabase";

export type Job = {
  id: string;
  business_id: string;
  name: string;
  site_address: string | null;
  client_id: string | null;
  status: string;
  created_at: string;
};

export type JobPayload = {
  name: string;
  site_address: string;
  client_id?: string | null;
  status?: string | null;
};

export async function listJobs(businessId: string) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, business_id, name, site_address, client_id, status, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Job[];
}

export async function getJobById(id: string) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, business_id, name, site_address, client_id, status, created_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load job.");
  }

  return data as Job;
}

export async function createJob(businessId: string, payload: JobPayload) {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      business_id: businessId,
      name: payload.name.trim(),
      site_address: payload.site_address.trim(),
      client_id: payload.client_id ?? null,
      status: payload.status ?? "active"
    })
    .select("id, business_id, name, site_address, client_id, status, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create job.");
  }

  return data as Job;
}
