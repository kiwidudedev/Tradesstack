"use server";

import { revalidatePath } from "next/cache";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ClientNoteActionResult =
  | {
      ok: true;
      note: {
        id: string;
        body: string;
        authorName: string;
        at: string;
        sortOrder: number;
      };
    }
  | {
      ok: false;
      error: string;
    };

type ClientNoteDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

type ClientNoteReorderResult =
  | { ok: true }
  | { ok: false; error: string };

type ClientNoteRecord = {
  id: string;
  author_name: string;
  body: string;
  sort_order: number;
  created_at: string;
};

function notesPath(clientId: string) {
  return `/app/leads-clients/clients/${clientId}/notes`;
}

async function revalidateClientNotePaths(clientId: string) {
  revalidatePath(`/app/leads-clients/clients/${clientId}`);
  revalidatePath(notesPath(clientId));
  revalidatePath(`/app/leads-clients/clients/${clientId}/timeline`);
}

function toClientNoteResult(note: ClientNoteRecord) {
  return {
    id: note.id,
    body: note.body,
    authorName: note.author_name?.trim() || "Team member",
    at: note.created_at,
    sortOrder: note.sort_order,
  };
}

async function ensureClientWritePermission(
  organizationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const allowed = await hasOrganizationPermission(organizationId, "leads.clients.write");
  if (!allowed) {
    return { ok: false, error: "You do not have permission to manage client notes." };
  }

  return { ok: true };
}

export async function createClientNote(input: { clientId: string; body: string }): Promise<ClientNoteActionResult> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return { ok: false, error: "You must be signed in to add a note." };
  }

  const permission = await ensureClientWritePermission(member.organization_id);
  if (!permission.ok) {
    return permission;
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Please enter a note before saving." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to add a note." };
  }

  const existingTopResult = await supabase
    .from("client_notes")
    .select("sort_order")
    .eq("organization_id", member.organization_id)
    .eq("client_id", input.clientId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  if (existingTopResult.error) {
    return { ok: false, error: existingTopResult.error.message || "Unable to prepare note order." };
  }

  const nextSortOrder = existingTopResult.data ? existingTopResult.data.sort_order - 1 : 0;

  const insertResult = await supabase
    .from("client_notes")
    .insert({
      organization_id: member.organization_id,
      client_id: input.clientId,
      created_by: user.id,
      author_name: member.display_name || "Team member",
      body,
      sort_order: nextSortOrder,
    })
    .select("id, author_name, body, sort_order, created_at")
    .maybeSingle<ClientNoteRecord>();

  if (insertResult.error || !insertResult.data) {
    return { ok: false, error: insertResult.error?.message ?? "Unable to save note." };
  }

  await revalidateClientNotePaths(input.clientId);

  return {
    ok: true,
    note: toClientNoteResult(insertResult.data),
  };
}

export async function updateClientNote(input: {
  clientId: string;
  noteId: string;
  body: string;
}): Promise<ClientNoteActionResult> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return { ok: false, error: "You must be signed in to update a note." };
  }

  const permission = await ensureClientWritePermission(member.organization_id);
  if (!permission.ok) {
    return permission;
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Please enter a note before saving." };
  }

  const supabase = await createServerSupabaseClient();
  const updateResult = await supabase
    .from("client_notes")
    .update({ body })
    .eq("organization_id", member.organization_id)
    .eq("client_id", input.clientId)
    .select("id, author_name, body, sort_order, created_at")
    .eq("id", input.noteId)
    .maybeSingle<ClientNoteRecord>();

  if (updateResult.error) {
    return { ok: false, error: updateResult.error.message || "Unable to update note." };
  }

  if (!updateResult.data) {
    return { ok: false, error: "Unable to update note. The note may no longer be editable." };
  }

  await revalidateClientNotePaths(input.clientId);

  return {
    ok: true,
    note: toClientNoteResult(updateResult.data),
  };
}

export async function deleteClientNote(input: {
  clientId: string;
  noteId: string;
}): Promise<ClientNoteDeleteResult> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return { ok: false, error: "You must be signed in to delete a note." };
  }

  const permission = await ensureClientWritePermission(member.organization_id);
  if (!permission.ok) {
    return permission;
  }

  const supabase = await createServerSupabaseClient();
  const deleteResult = await supabase
    .from("client_notes")
    .delete()
    .eq("organization_id", member.organization_id)
    .eq("client_id", input.clientId)
    .eq("id", input.noteId);

  if (deleteResult.error) {
    return { ok: false, error: deleteResult.error.message || "Unable to delete note." };
  }

  await revalidateClientNotePaths(input.clientId);
  return { ok: true };
}

export async function reorderClientNotes(input: {
  clientId: string;
  orderedIds: string[];
}): Promise<ClientNoteReorderResult> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return { ok: false, error: "You must be signed in to reorder notes." };
  }

  const permission = await ensureClientWritePermission(member.organization_id);
  if (!permission.ok) {
    return permission;
  }

  const orderedIds = input.orderedIds.filter(Boolean);
  if (orderedIds.length === 0) {
    return { ok: false, error: "No saved notes were provided for reordering." };
  }

  const supabase = await createServerSupabaseClient();
  const reorderResult = await supabase.rpc("reorder_client_notes", {
    p_client_id: input.clientId,
    p_ordered_ids: orderedIds,
  });

  if (reorderResult.error) {
    return { ok: false, error: reorderResult.error.message || "Unable to reorder notes." };
  }

  await revalidateClientNotePaths(input.clientId);
  return { ok: true };
}
