import { supabase } from "./supabase";

export type Client = {
  id: string;
  business_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
};

export type ClientPayload = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export async function getActiveBusinessId(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("NO_BUSINESS");
  }

  return data.id;
}

export async function listClients(businessId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_id, name, email, phone, address, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Client[];
}

export async function getClientById(id: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_id, name, email, phone, address, created_at")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Client;
}

export async function createClient(businessId: string, payload: ClientPayload) {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      business_id: businessId,
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateClient(id: string, payload: ClientPayload) {
  const { error } = await supabase
    .from("clients")
    .update({
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteClient(id: string) {
  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
