export type AppRole = "owner" | "admin" | "qs" | "project_manager" | "worker" | "member" | null | undefined;

const COMMERCIAL_WRITE_ROLES = new Set(["owner", "admin", "qs", "project_manager"]);
const ORGANIZATION_SETTINGS_ROLES = new Set(["owner", "admin"]);

export function canManageCommercialData(role: AppRole): boolean {
  return role ? COMMERCIAL_WRITE_ROLES.has(role) : false;
}

export function canManageOrganizationSettings(role: AppRole): boolean {
  return role ? ORGANIZATION_SETTINGS_ROLES.has(role) : false;
}
