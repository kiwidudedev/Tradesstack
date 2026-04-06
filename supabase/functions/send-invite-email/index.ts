import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INVITE_FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL");
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "http://localhost:3000";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseBearerToken(headerValue: string | null) {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const accessToken = parseBearerToken(request.headers.get("authorization"));
  if (!accessToken) return json({ error: "Missing bearer token." }, 401);

  let payload: { organization_id?: string; invite_id?: string } = {};
  try {
    payload = (await request.json()) as { organization_id?: string; invite_id?: string };
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const organizationId = payload.organization_id?.trim();
  const inviteId = payload.invite_id?.trim();
  if (!organizationId || !inviteId) return json({ error: "organization_id and invite_id are required." }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) return json({ error: "Unauthorized." }, 401);

  const { data: ownerMember, error: ownerError } = await userClient
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError || !ownerMember) return json({ error: "Only owner can send invite emails." }, 403);

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: invite, error: inviteError } = await serviceClient
    .from("organization_invites")
    .select("id, invited_email, token, status, expires_at, organization_id")
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (inviteError || !invite) return json({ error: "Invite not found." }, 404);
  if (invite.status !== "pending") return json({ error: "Invite is not pending." }, 400);

  const { data: org, error: orgError } = await serviceClient
    .from("organizations")
    .select("name")
    .eq("id", invite.organization_id)
    .maybeSingle();

  if (orgError || !org) return json({ error: "Organization not found." }, 404);

  const joinUrl = `${APP_BASE_URL.replace(/\/+$/, "")}/join?token=${invite.token}`;

  if (!RESEND_API_KEY || !INVITE_FROM_EMAIL) {
    return json({
      ok: false,
      error: "Missing RESEND_API_KEY or INVITE_FROM_EMAIL.",
      invite_id: invite.id,
      join_url: joinUrl,
    });
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: INVITE_FROM_EMAIL,
      to: [invite.invited_email],
      subject: `You're invited to join ${org.name} on Tradesstack`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#1d2433;line-height:1.5;">
          <h2 style="margin:0 0 12px;">You are invited to join ${org.name}</h2>
          <p style="margin:0 0 12px;">Click the button below to accept your invite.</p>
          <p style="margin:16px 0;">
            <a href="${joinUrl}" style="background:#0B2739;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;">
              Accept Invite
            </a>
          </p>
          <p style="margin:0;color:#64748b;font-size:12px;">This invite expires on ${new Date(invite.expires_at).toUTCString()}.</p>
        </div>
      `,
    }),
  });

  if (!emailResponse.ok) {
    const errorBody = await emailResponse.text();
    return json({ ok: false, error: "Email provider rejected request.", detail: errorBody }, 502);
  }

  return json({ ok: true, invite_id: invite.id, sent_to: invite.invited_email, join_url: joinUrl });
});
