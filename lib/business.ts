import { supabase } from "./supabase";

export type Business = {
  id: string;
  name: string;
  gst_number?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  owner_id?: string | null;
};

let activeBusinessId: string | null = null;

export const getActiveBusinessId = () => activeBusinessId;

export const setActiveBusinessId = (id: string | null) => {
  activeBusinessId = id;
};

export async function fetchUserBusinessId(userId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { businessId: null, error: error.message };
  }

  return { businessId: data?.id ?? null, error: null };
}

export async function fetchBusinessName(businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    return { name: null, error: error.message };
  }

  return { name: data?.name ?? null, error: null };
}

type CreateBusinessInput = {
  userId: string;
  name: string;
  gstNumber?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function createBusinessWithOwner({
  userId,
  name,
  gstNumber,
  address,
  email,
  phone
}: CreateBusinessInput) {
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      name,
      gst_number: gstNumber ?? null,
      address: address ?? null,
      email: email ?? null,
      phone: phone ?? null,
      owner_id: userId
    })
    .select("id")
    .single();

  if (businessError || !business) {
    return { businessId: null, error: businessError?.message ?? "Failed to create business." };
  }

  return { businessId: business.id, error: null };
}
