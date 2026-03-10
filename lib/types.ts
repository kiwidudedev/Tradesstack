export type UserRole = "admin" | "member";

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
