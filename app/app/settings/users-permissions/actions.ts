"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PAGE_PATH = "/app/settings/users-permissions";

type MutableRole = "owner" | "admin" | "qs" | "project_manager" | "worker";

function toSafeMessage(value: string) {
  return encodeURIComponent(value);
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseMutableRole(value: string): MutableRole | null {
  if (value === "owner" || value === "admin" || value === "qs" || value === "project_manager" || value === "worker") {
    return value;
  }
  return null;
}

async function requireOwnerContext() {
  const member = await getCurrentOrganizationMember();
  if (!member || member.role !== "owner") {
    redirect("/app/settings/organization");
  }
  return member;
}

export async function inviteUserAction(formData: FormData) {
  const owner = await requireOwnerContext();
  const email = readString(formData, "email").toLowerCase();
  const displayName = readString(formData, "display_name");
  const roleValue = parseMutableRole(readString(formData, "role"));

  if (!email || !email.includes("@")) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Please enter a valid email address.")}`);
  }
  if (!roleValue) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Please select a valid role.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const normalizedEmail = email.toLowerCase();
  const { data: existingPendingInvite, error: existingPendingInviteError } = await supabase
    .from("organization_invites")
    .select("id")
    .eq("organization_id", owner.organization_id)
    .eq("status", "pending")
    .eq("invited_email", normalizedEmail)
    .maybeSingle();

  if (existingPendingInviteError) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage(existingPendingInviteError.message)}`);
  }

  const inviteMutation = existingPendingInvite
    ? await supabase
        .from("organization_invites")
        .update({
          invited_name: displayName || null,
          role: roleValue,
          invited_by: owner.user_id,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .eq("id", existingPendingInvite.id)
        .eq("organization_id", owner.organization_id)
        .single()
    : await supabase.from("organization_invites").insert({
        organization_id: owner.organization_id,
        invited_by: owner.user_id,
        invited_email: email,
        invited_name: displayName || null,
        role: roleValue,
        status: "pending",
      })
      .select("id")
      .single();

  if (inviteMutation.error) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage(inviteMutation.error.message)}`);
  }

  // Avoid success redirects to keep invite UX snappy on this page.
  revalidatePath(PAGE_PATH);
  return;
}

export async function updateUserNameAction(formData: FormData) {
  const owner = await requireOwnerContext();
  const targetType = readString(formData, "target_type");
  const targetId = readString(formData, "target_id");
  const displayName = readString(formData, "display_name");

  if (!targetId || !displayName) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Please provide a valid name.")}`);
  }
  if (displayName.length > 120) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Name must be 120 characters or less.")}`);
  }

  const supabase = await createServerSupabaseClient();

  if (targetType === "member") {
    const { error } = await supabase
      .from("organization_members")
      .update({ display_name: displayName })
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id);

    if (error) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage(error.message)}`);
    }
  } else if (targetType === "invite") {
    const { error } = await supabase
      .from("organization_invites")
      .update({ invited_name: displayName })
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id)
      .eq("status", "pending");

    if (error) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage(error.message)}`);
    }
  } else {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Unsupported target type.")}`);
  }

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?success=${toSafeMessage("Name updated.")}`);
}

export async function resendInviteAction(formData: FormData) {
  const owner = await requireOwnerContext();
  const inviteId = readString(formData, "invite_id");

  if (!inviteId) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Invalid resend request.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const { data: inviteRow, error: inviteReadError } = await supabase
    .from("organization_invites")
    .select("id")
    .eq("id", inviteId)
    .eq("organization_id", owner.organization_id)
    .eq("status", "pending")
    .maybeSingle();

  if (inviteReadError) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage(inviteReadError.message)}`);
  }
  if (!inviteRow) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Pending invite not found.")}`);
  }

  const { error: refreshError } = await supabase
    .from("organization_invites")
    .update({
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .eq("organization_id", owner.organization_id);

  if (refreshError) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage(refreshError.message)}`);
  }

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?success=${toSafeMessage("Invite link refreshed.")}`);
}

export async function updateUserRoleAction(formData: FormData) {
  const owner = await requireOwnerContext();
  const targetType = readString(formData, "target_type");
  const targetId = readString(formData, "target_id");
  const roleValue = parseMutableRole(readString(formData, "role"));

  if (!targetId || !roleValue) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Invalid role update request.")}`);
  }

  const supabase = await createServerSupabaseClient();

  if (targetType === "member") {
    const { data: targetMember } = await supabase
      .from("organization_members")
      .select("id, role")
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id)
      .maybeSingle();

    if (!targetMember) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage("Member not found.")}`);
    }
    if (targetMember.role === "owner") {
      redirect(`${PAGE_PATH}?error=${toSafeMessage("Owner role cannot be reassigned from this screen.")}`);
    }

    const { error } = await supabase
      .from("organization_members")
      .update({ role: roleValue })
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id);

    if (error) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage(error.message)}`);
    }
  } else if (targetType === "invite") {
    if (roleValue === "owner") {
      redirect(`${PAGE_PATH}?error=${toSafeMessage("Pending invites cannot be assigned Owner. Promote after they join.")}`);
    }

    const { error } = await supabase
      .from("organization_invites")
      .update({ role: roleValue })
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id)
      .eq("status", "pending");

    if (error) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage(error.message)}`);
    }
  } else {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Unsupported target type.")}`);
  }

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?success=${toSafeMessage("Role updated.")}`);
}

export async function removeUserAction(formData: FormData) {
  const owner = await requireOwnerContext();
  const targetType = readString(formData, "target_type");
  const targetId = readString(formData, "target_id");

  if (!targetId) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Invalid remove request.")}`);
  }

  const supabase = await createServerSupabaseClient();

  if (targetType === "member") {
    const { data: targetMember } = await supabase
      .from("organization_members")
      .select("id, user_id, role")
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id)
      .maybeSingle();

    if (!targetMember) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage("Member not found.")}`);
    }
    if (targetMember.role === "owner" || targetMember.user_id === owner.user_id) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage("Owner cannot remove themselves.")}`);
    }

    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id);

    if (error) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage(error.message)}`);
    }
  } else if (targetType === "invite") {
    const { error } = await supabase
      .from("organization_invites")
      .delete()
      .eq("id", targetId)
      .eq("organization_id", owner.organization_id)
      .eq("status", "pending");

    if (error) {
      redirect(`${PAGE_PATH}?error=${toSafeMessage(error.message)}`);
    }
  } else {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Unsupported target type.")}`);
  }

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?success=${toSafeMessage("User removed.")}`);
}

export async function setMemberPermissionOverrideAction(formData: FormData) {
  const owner = await requireOwnerContext();
  const memberId = readString(formData, "member_id");
  const permissionKey = readString(formData, "permission_key");
  const decision = readString(formData, "decision");

  if (!memberId || !permissionKey || (decision !== "allow" && decision !== "deny")) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Invalid permission override request.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const { data: targetMember } = await supabase
    .from("organization_members")
    .select("id, role")
    .eq("id", memberId)
    .eq("organization_id", owner.organization_id)
    .maybeSingle();

  if (!targetMember) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Member not found.")}`);
  }
  if (targetMember.role === "owner") {
    redirect(`${PAGE_PATH}?error=${toSafeMessage("Owner permissions cannot be overridden.")}`);
  }

  const { error } = await supabase.from("member_permission_overrides").upsert(
    {
      organization_member_id: memberId,
      permission_key: permissionKey,
      is_allowed: decision === "allow",
      created_by: owner.user_id,
    },
    { onConflict: "organization_member_id,permission_key" }
  );

  if (error) {
    redirect(`${PAGE_PATH}?error=${toSafeMessage(error.message)}`);
  }

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?success=${toSafeMessage("Permission override saved.")}`);
}
