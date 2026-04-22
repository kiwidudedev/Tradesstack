import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { interMedium } from "@/lib/fonts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inviteUserAction } from "./actions";
import { getSettingsContext } from "../settings-data";
import { RowActionsMenu } from "./RowActionsMenu";

type MemberStatus = "Active" | "Invited";
type UIRole = "Owner" | "Admin" | "QS" | "Project Manager" | "Worker";
type RawRole = "owner" | "admin" | "qs" | "project_manager" | "worker";

type TableRow = {
  id: string;
  name: string;
  subtitle: string;
  email?: string;
  role: UIRole;
  rawRole: RawRole;
  status: MemberStatus;
  kind: "member" | "invite";
  inviteJoinUrl?: string;
};

function statusClassName(status: MemberStatus) {
  if (status === "Active") return "border-[#c8ead7] bg-[#e8f7ef] text-[#127a3f]";
  return "border-[#efe5b8] bg-[#f7f0cd] text-[#877200]";
}

function isHexColor(value: string | null | undefined) {
  if (!value) return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function textColorForBackground(hexColor: string) {
  const hex = hexColor.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#1d2433" : "#ffffff";
}

function AvatarBadge({ name, backgroundColor }: { name: string; backgroundColor: string }) {
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D9DEE5] text-xs font-semibold"
      style={{ backgroundColor, color: textColorForBackground(backgroundColor) }}
    >
      {initials}
    </span>
  );
}

function formatDateLabel(timestamp: string | null | undefined) {
  if (!timestamp) return "Date unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-NZ", { day: "2-digit", month: "short", year: "numeric" });
}

function toInviteName(email: string) {
  const local = email.split("@")[0] || "Invited user";
  return local
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapExistingRole(role: string, isOwner: boolean): UIRole {
  if (isOwner) return "Owner";
  if (role === "admin") return "Admin";
  if (role === "qs") return "QS";
  if (role === "project_manager") return "Project Manager";
  if (role === "worker") return "Worker";
  if (role === "member") return "Worker";
  if (role === "owner") return "Owner";
  return "Worker";
}

function toRoleLabel(rawRole: RawRole): UIRole {
  if (rawRole === "owner") return "Owner";
  if (rawRole === "admin") return "Admin";
  if (rawRole === "qs") return "QS";
  if (rawRole === "project_manager") return "Project Manager";
  return "Worker";
}

function toRoleValue(role: string): RawRole {
  if (role === "owner" || role === "admin" || role === "qs" || role === "project_manager" || role === "worker") {
    return role;
  }
  return "worker";
}

function MemberRowItem({
  row,
  isLast,
  ownerBadgeColor,
  staffBadgeColor,
}: {
  row: TableRow;
  isLast: boolean;
  ownerBadgeColor: string;
  staffBadgeColor: string;
}) {
  const editable = row.rawRole !== "owner";
  const avatarColor = row.rawRole === "owner" ? ownerBadgeColor : staffBadgeColor;

  return (
    <div className={`flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between ${isLast ? "" : "border-b border-[#D9DEE5]"}`}>
      <div className="flex min-w-0 items-center gap-3">
        <AvatarBadge name={row.name} backgroundColor={avatarColor} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1d2433]">{row.name}</p>
          <p className={`${interMedium.className} truncate text-sm text-[#5B6879]`}>{row.subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <span className={`inline-flex rounded-[8px] border px-2.5 py-0.5 text-xs font-semibold ${statusClassName(row.status)}`}>{row.status}</span>
        <span className={`${interMedium.className} inline-flex w-fit items-center gap-1 rounded-[8px] px-2 py-1 text-sm font-medium text-[#1d2433]`}>
          {row.role}
        </span>
        {editable ? (
          <RowActionsMenu
            targetType={row.kind}
            targetId={row.id}
            currentRole={row.rawRole}
            inviteJoinUrl={row.inviteJoinUrl}
            email={row.email}
            name={row.name}
          />
        ) : null}
      </div>
    </div>
  );
}

export default async function UsersPermissionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { currentMember, memberRows, organizationRow } = await getSettingsContext();

  if (!currentMember) return null;
  if (currentMember.role !== "owner") {
    redirect("/app/settings/organization");
  }
  const params = (await searchParams) ?? {};
  const errorMessage = typeof params.error === "string" ? params.error : null;
  const warningMessage = typeof params.warning === "string" ? params.warning : null;

  const supabase = await createServerSupabaseClient();
  const [invites, memberEmailsResult] = await Promise.all([
    supabase
      .from("organization_invites")
      .select("*")
      .eq("organization_id", currentMember.organization_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_organization_member_emails", {
      p_organization_id: currentMember.organization_id,
    }),
  ]);

  const memberEmailByUserId = new Map(
    (memberEmailsResult.error ? [] : memberEmailsResult.data ?? []).map((row) => [row.user_id, row.email])
  );

  const liveMembers: TableRow[] = memberRows.map((member) => {
    const isOwner = member.user_id === organizationRow?.created_by;
    const normalizedRole = isOwner ? "owner" : toRoleValue(member.role);
    const subtitleEmail = memberEmailByUserId.get(member.user_id) ?? null;
    return {
      id: member.id,
      name: member.display_name?.trim() || "Unnamed user",
      subtitle: subtitleEmail ?? `Joined ${formatDateLabel(member.created_at)}`,
      email: subtitleEmail ?? undefined,
      role: toRoleLabel(normalizedRole),
      rawRole: normalizedRole,
      status: "Active",
      kind: "member",
    };
  });

  const pendingInvites: TableRow[] = (invites.error ? [] : invites.data ?? []).map((invite) => ({
    id: invite.id,
    name: invite.invited_name?.trim() || toInviteName(invite.invited_email),
    subtitle: invite.invited_email,
    email: invite.invited_email,
    role: mapExistingRole(invite.role, false),
    rawRole: toRoleValue(invite.role),
    status: "Invited",
    kind: "invite",
    inviteJoinUrl: `/register?token=${invite.token}`,
  }));

  const ownerRows = liveMembers.filter((row) => row.role === "Owner");
  const staffRows = [...liveMembers.filter((row) => row.role !== "Owner"), ...pendingInvites];
  const ownerBadgeColor = isHexColor(organizationRow?.brand_primary_color) ? organizationRow!.brand_primary_color! : "#F74917";
  const staffBadgeColor = isHexColor(organizationRow?.brand_accent_color) ? organizationRow!.brand_accent_color! : "#E7ECF2";

  return (
    <section className="overflow-visible bg-transparent px-0 pb-0 pt-0">
      <div className="space-y-5">
        <div className="pb-1 pt-1">
          <p className="truncate text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#1d2433]">
            Users & Permissions
          </p>
        </div>

        {errorMessage ? (
          <p className={`${interMedium.className} rounded-[10px] border border-[#f1c5c5] bg-[#fff1f1] px-3 py-2 text-sm text-[#8f2d2d]`}>
            {decodeURIComponent(errorMessage)}
          </p>
        ) : null}
        {warningMessage ? (
          <p className={`${interMedium.className} rounded-[10px] border border-[#f3d8a5] bg-[#fff7e8] px-3 py-2 text-sm text-[#8a5a00]`}>
            {decodeURIComponent(warningMessage)}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-[22px] border border-[#D9DEE5] bg-white px-5 pb-5 pt-4">
          <div className="pb-4">
            <h3 className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">Owner</h3>
          </div>
          {ownerRows.length === 0 ? (
            <p className={`${interMedium.className} text-sm text-[#5B6879]`}>No owner role assigned yet.</p>
          ) : (
            <div className="overflow-hidden rounded-[16px] border border-[#D9DEE5] bg-white">
              {ownerRows.map((row, index) => (
                <MemberRowItem
                  key={row.id}
                  row={row}
                  isLast={index === ownerRows.length - 1}
                  ownerBadgeColor={ownerBadgeColor}
                  staffBadgeColor={staffBadgeColor}
                />
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-[22px] border border-[#D9DEE5] bg-white px-5 pb-5 pt-4">
          <div className="flex items-center justify-between pb-4">
            <h3 className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">Staff ({staffRows.length})</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input id="invite-user-modal-toggle" type="checkbox" className="peer sr-only" />
                <label
                  htmlFor="invite-user-modal-toggle"
                  className={`${interMedium.className} inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#0B2739] bg-[#0B2739] px-[0.7rem] py-[0.55rem] text-[15px] font-medium text-white shadow-none transition-opacity hover:bg-[#0B2739] hover:opacity-90`}
                >
                  <Plus className="h-4 w-4" />
                  Invite user
                </label>

                <div className="fixed inset-0 z-[80] hidden items-center justify-center bg-[rgba(17,24,39,0.45)] p-4 peer-checked:flex">
                  <div className="relative w-full max-w-[390px] rounded-[22px] border border-[#D9DEE5] bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.22)] sm:p-5">
                    <label
                      htmlFor="invite-user-modal-toggle"
                      className="absolute right-4 top-4 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#D9DEE5] bg-white text-[18px] leading-none text-[#1d2433] transition-colors hover:bg-[#E9EEF5]"
                      aria-label="Close invite dialog"
                    >
                      ×
                    </label>

                    <form action={inviteUserAction} className="grid gap-2.5">
                      <label className="space-y-1.5">
                        <span className={`${interMedium.className} text-[12px] uppercase tracking-[0.08em] text-[#6b6b6b]`}>Name</span>
                        <input
                          type="text"
                          name="display_name"
                          placeholder="Full name"
                          className={`${interMedium.className} h-9 w-full rounded-[10px] border border-[#D9DEE5] bg-white px-3 text-[13px] text-[#1d2433] outline-none`}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className={`${interMedium.className} text-[12px] uppercase tracking-[0.08em] text-[#6b6b6b]`}>Email</span>
                        <input
                          type="email"
                          name="email"
                          placeholder="user@company.com"
                          required
                          className={`${interMedium.className} h-9 w-full rounded-[10px] border border-[#D9DEE5] bg-white px-3 text-[13px] text-[#1d2433] outline-none`}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className={`${interMedium.className} text-[12px] uppercase tracking-[0.08em] text-[#6b6b6b]`}>Role</span>
                        <select
                          name="role"
                          defaultValue="worker"
                          className={`${interMedium.className} h-9 w-full rounded-[10px] border border-[#D9DEE5] bg-white px-3 text-[13px] text-[#1d2433] outline-none`}
                        >
                          <option value="admin">Admin</option>
                          <option value="qs">QS</option>
                          <option value="project_manager">Project Manager</option>
                          <option value="worker">Worker</option>
                        </select>
                      </label>
                      <button
                        type="submit"
                        className={`${interMedium.className} mt-1 inline-flex items-center justify-center gap-2 rounded-full border border-[#0B2739] bg-[#0B2739] px-[0.7rem] py-[0.55rem] text-[15px] font-medium text-white shadow-none transition-opacity hover:bg-[#0B2739] hover:opacity-90`}
                      >
                        Invite user
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {staffRows.length === 0 ? (
            <p className={`${interMedium.className} text-sm text-[#5B6879]`}>No staff users or pending invites yet.</p>
          ) : (
            <div className="overflow-hidden rounded-[16px] border border-[#D9DEE5] bg-white">
              {staffRows.map((row, index) => (
                <MemberRowItem
                  key={row.id}
                  row={row}
                  isLast={index === staffRows.length - 1}
                  ownerBadgeColor={ownerBadgeColor}
                  staffBadgeColor={staffBadgeColor}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
