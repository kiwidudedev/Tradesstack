export type UserRole = "owner" | "admin" | "qs" | "project_manager" | "worker";

export interface AuthSession {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  organizationId?: string | null;
  organizationName?: string | null;
  avatarPath?: string | null;
  avatarUrl?: string | null;
}
