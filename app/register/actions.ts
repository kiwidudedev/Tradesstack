"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type InviteRegistrationInput = {
  inviteToken: string;
  fullName: string;
  email: string;
  password: string;
};

export type InviteRegistrationResult =
  | { error: string; redirectPath: null }
  | { error: null; redirectPath: string };

const INVALID_INVITE_MESSAGE =
  "This invitation is no longer valid. Ask your workspace administrator to send a new invitation.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message: string): InviteRegistrationResult {
  return { error: message, redirectPath: null };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Creates an account for an invited user only.
 *
 * Public self-registration is not supported by a dedicated customer
 * application. The invite token is validated against the authoritative
 * organization_invites record on the server, and the account is provisioned
 * through the Supabase Auth admin API rather than the public sign-up endpoint.
 */
export async function registerWithInvite(input: InviteRegistrationInput): Promise<InviteRegistrationResult> {
  const inviteToken = input.inviteToken?.trim() ?? "";
  const fullName = input.fullName?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const password = input.password ?? "";

  if (!inviteToken || !isUuid(inviteToken)) {
    return fail(INVALID_INVITE_MESSAGE);
  }
  if (!fullName) {
    return fail("Enter your full name.");
  }
  if (!EMAIL_PATTERN.test(email)) {
    return fail("Enter a valid email address.");
  }
  if (password.length < 8) {
    return fail("Choose a password with at least 8 characters.");
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return fail("Account creation is not configured for this workspace. Contact your workspace administrator.");
  }

  const { data: invite, error: inviteError } = await admin
    .from("organization_invites")
    .select("id, invited_email, status, expires_at")
    .eq("token", inviteToken)
    .eq("status", "pending")
    .maybeSingle();

  if (inviteError || !invite) {
    return fail(INVALID_INVITE_MESSAGE);
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return fail("This invitation has expired. Ask your workspace administrator to send a new invitation.");
  }
  if (invite.invited_email.trim().toLowerCase() !== email) {
    return fail("Use the email address this invitation was sent to.");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      invite_token: inviteToken,
    },
  });

  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return fail("This email already has an account. Sign in instead, then accept your invitation.");
    }
    return fail("Unable to create your account right now. Contact your workspace administrator.");
  }

  // The signup trigger joins the invited organization only when the invite
  // token matches the new user. Verify that before handing back a session.
  const { data: membership } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", created.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(INVALID_INVITE_MESSAGE);
  }

  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    return { error: null, redirectPath: "/login?created=1" };
  }

  return { error: null, redirectPath: "/app/dashboard" };
}
