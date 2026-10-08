/**
 * Central permission policy. Every protected endpoint checks one of these permissions;
 * roles map to permissions here and nowhere else.
 */
export const ROLES = ["viewer", "reviewer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "kyc:read": "View KYC applications and review notes",
  "kyc:review": "Start reviews, add notes, approve and reject KYC applications",
  "audit:read": "View the audit log",
  "admin:access": "Access the Admin area",
} as const;
export type Permission = keyof typeof PERMISSIONS;

const viewer: Permission[] = ["kyc:read", "audit:read"];
const reviewer: Permission[] = [...viewer, "kyc:review"];
const admin: Permission[] = [...reviewer, "admin:access"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = { viewer, reviewer, admin };

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function permissionMatrix() {
  return (Object.keys(PERMISSIONS) as Permission[]).map((permission) => ({
    permission,
    description: PERMISSIONS[permission],
    roles: Object.fromEntries(ROLES.map((r) => [r, hasPermission(r, permission)])) as Record<Role, boolean>,
  }));
}
