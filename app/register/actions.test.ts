import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  createServer: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocked.createAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocked.createServer }));

import { registerWithInvite } from "./actions";

const INVITE_TOKEN = "3f1d5f2a-6d4b-4c1e-9a2f-1b2c3d4e5f60";
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function adminClient(options: {
  invite?: { id: string; invited_email: string; status: string; expires_at: string } | null;
  membership?: { id: string } | null;
}) {
  return {
    from(table: string) {
      if (table === "organization_invites") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: options.invite ?? null, error: null }) }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: options.membership ?? null, error: null }),
            }),
          }),
        }),
      };
    },
    auth: {
      admin: {
        createUser: mocked.createUser,
        deleteUser: mocked.deleteUser,
      },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.createServer.mockResolvedValue({
    auth: { signInWithPassword: mocked.signInWithPassword },
  });
  mocked.createUser.mockResolvedValue({ data: { user: { id: "user-new" } }, error: null });
  mocked.deleteUser.mockResolvedValue({ data: null, error: null });
  mocked.signInWithPassword.mockResolvedValue({ error: null });
});

const validInput = {
  inviteToken: INVITE_TOKEN,
  fullName: "Jane Builder",
  email: "Jane@Example.com",
  password: "correct-horse-battery",
};

describe("invitation-only registration", () => {
  it("rejects a request without a valid invitation token", async () => {
    const result = await registerWithInvite({ ...validInput, inviteToken: "not-a-token" });

    expect(result.error).toContain("invitation");
    expect(mocked.createAdmin).not.toHaveBeenCalled();
    expect(mocked.createUser).not.toHaveBeenCalled();
  });

  it("rejects an unknown invitation", async () => {
    mocked.createAdmin.mockReturnValue(adminClient({ invite: null }));

    const result = await registerWithInvite(validInput);

    expect(result.error).toContain("no longer valid");
    expect(mocked.createUser).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation", async () => {
    mocked.createAdmin.mockReturnValue(
      adminClient({
        invite: { id: "invite-1", invited_email: "jane@example.com", status: "pending", expires_at: PAST },
      }),
    );

    const result = await registerWithInvite(validInput);

    expect(result.error).toContain("expired");
    expect(mocked.createUser).not.toHaveBeenCalled();
  });

  it("only allows the email address the invitation was sent to", async () => {
    mocked.createAdmin.mockReturnValue(
      adminClient({
        invite: { id: "invite-1", invited_email: "someone-else@example.com", status: "pending", expires_at: FUTURE },
      }),
    );

    const result = await registerWithInvite(validInput);

    expect(result.error).toContain("email address this invitation was sent to");
    expect(mocked.createUser).not.toHaveBeenCalled();
  });

  it("creates the invited account through the Auth admin API and signs the user in", async () => {
    mocked.createAdmin.mockReturnValue(
      adminClient({
        invite: { id: "invite-1", invited_email: "jane@example.com", status: "pending", expires_at: FUTURE },
        membership: { id: "member-1" },
      }),
    );

    const result = await registerWithInvite(validInput);

    expect(mocked.createUser).toHaveBeenCalledTimes(1);
    expect(mocked.createUser).toHaveBeenCalledWith({
      email: "jane@example.com",
      password: validInput.password,
      email_confirm: true,
      user_metadata: { full_name: "Jane Builder", invite_token: INVITE_TOKEN },
    });
    expect(mocked.signInWithPassword).toHaveBeenCalledWith({
      email: "jane@example.com",
      password: validInput.password,
    });
    expect(result).toEqual({ error: null, redirectPath: "/app/dashboard" });
  });

  it("removes a provisioned user that the invitation did not attach to a workspace", async () => {
    mocked.createAdmin.mockReturnValue(
      adminClient({
        invite: { id: "invite-1", invited_email: "jane@example.com", status: "pending", expires_at: FUTURE },
        membership: null,
      }),
    );

    const result = await registerWithInvite(validInput);

    expect(mocked.deleteUser).toHaveBeenCalledWith("user-new");
    expect(mocked.signInWithPassword).not.toHaveBeenCalled();
    expect(result.error).toContain("no longer valid");
  });

  it("explains how to continue when the email already has an account", async () => {
    mocked.createAdmin.mockReturnValue(
      adminClient({
        invite: { id: "invite-1", invited_email: "jane@example.com", status: "pending", expires_at: FUTURE },
        membership: { id: "member-1" },
      }),
    );
    mocked.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });

    const result = await registerWithInvite(validInput);

    expect(result.error).toContain("already has an account");
    expect(mocked.signInWithPassword).not.toHaveBeenCalled();
  });

  it("sends the user to sign in if automatic sign-in after provisioning fails", async () => {
    mocked.createAdmin.mockReturnValue(
      adminClient({
        invite: { id: "invite-1", invited_email: "jane@example.com", status: "pending", expires_at: FUTURE },
        membership: { id: "member-1" },
      }),
    );
    mocked.signInWithPassword.mockResolvedValue({ error: { message: "sign-in failed" } });

    const result = await registerWithInvite(validInput);

    expect(result).toEqual({ error: null, redirectPath: "/login?created=1" });
  });
});
