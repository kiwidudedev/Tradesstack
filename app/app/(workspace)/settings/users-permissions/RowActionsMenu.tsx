"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { interMedium } from "@/lib/fonts";
import { removeUserAction, updateUserRoleAction } from "./actions";

type MenuTargetType = "member" | "invite";
type MenuRole = "owner" | "admin" | "qs" | "project_manager" | "worker";

interface RowActionsMenuProps {
  targetType: MenuTargetType;
  targetId: string;
  currentRole: MenuRole;
  inviteJoinUrl?: string;
  email?: string;
  name: string;
}

function roleLabel(value: MenuRole) {
  if (value === "owner") return "Owner";
  if (value === "admin") return "Admin";
  if (value === "qs") return "QS";
  if (value === "project_manager") return "Project Manager";
  return "Worker";
}

export function RowActionsMenu({ targetType, targetId, currentRole, inviteJoinUrl, email, name }: RowActionsMenuProps) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const isInvite = targetType === "invite";

  const copyLink = async () => {
    if (!inviteJoinUrl) return;
    const absolute =
      typeof window !== "undefined" ? `${window.location.origin}${inviteJoinUrl}` : inviteJoinUrl;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const roles: MenuRole[] = isInvite
    ? ["admin", "qs", "project_manager", "worker"]
    : ["owner", "admin", "qs", "project_manager", "worker"];

  const mailHref = (() => {
    if (!inviteJoinUrl || !email) return "#";
    const absolute =
      typeof window !== "undefined" ? `${window.location.origin}${inviteJoinUrl}` : inviteJoinUrl;
    const subject = encodeURIComponent("TradeStack invite");
    const body = encodeURIComponent(`You've been invited to TradeStack.\n\nJoin here:\n${absolute}`);
    return `mailto:${email}?subject=${subject}&body=${body}`;
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
        aria-label={`Actions for ${name}`}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-[rgba(17,24,39,0.45)] p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative w-full max-w-[430px] rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.24)] sm:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[18px] leading-none text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
              aria-label="Close actions dialog"
            >
              X
            </button>

            <div className="pt-1">
              {isInvite ? (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className={`${interMedium.className} inline-flex h-9 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]`}
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <a
                    href={mailHref}
                    className={`${interMedium.className} inline-flex h-9 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]`}
                  >
                    Email link
                  </a>
                </div>
              ) : null}

              <form action={updateUserRoleAction} className="mb-3 grid gap-2">
                <input type="hidden" name="target_type" value={targetType} />
                <input type="hidden" name="target_id" value={targetId} />
                <label className={`${interMedium.className} text-[12px] uppercase tracking-[0.08em] text-[var(--text-secondary)]`}>
                  Change User
                </label>
                <select
                  name="role"
                  defaultValue={currentRole}
                  className={`${interMedium.className} h-10 w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] text-[var(--text-primary)] outline-none`}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className={`${interMedium.className} inline-flex h-10 items-center justify-center rounded-[10px] bg-[var(--navy-primary)] px-3 text-[14px] font-medium text-white transition-colors hover:opacity-90`}
                >
                  Save
                </button>
              </form>

              <form action={removeUserAction}>
                <input type="hidden" name="target_type" value={targetType} />
                <input type="hidden" name="target_id" value={targetId} />
                <button
                  type="submit"
                  className={`${interMedium.className} inline-flex h-10 w-full items-center justify-center rounded-[10px] border border-[var(--error-light)] bg-[var(--error-light)] px-3 text-[14px] text-[var(--error)] transition-colors hover:opacity-90`}
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
