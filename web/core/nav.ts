import type { Permission } from "./session";

/** Single navigation registry. Adding a module = one entry here + its routes. */
export interface NavItem {
  label: string;
  path: string;
  permission?: Permission;
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "KYC Reviews", path: "/kyc", permission: "kyc:read" },
  { label: "Audit Log", path: "/audit", permission: "audit:read" },
  { label: "Admin", path: "/admin", permission: "admin:access" },
  { label: "Refunds", path: "/refunds", comingSoon: true },
  { label: "Feature Flags", path: "/feature-flags", comingSoon: true },
];
