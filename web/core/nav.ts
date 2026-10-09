import type { Permission } from "./session";

/** Single navigation registry. Adding a module = one entry here + its routes. */
export interface NavItem {
  label: string;
  path: string;
  permission?: Permission;
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "KYC Reviews", path: "/kyc", permission: "kyc.read" },
  { label: "Refunds", path: "/refunds", permission: "refunds.read" },
  { label: "Feature Flags", path: "/feature-flags", permission: "flags.read" },
  { label: "Audit Log", path: "/audit", permission: "audit.read" },
  { label: "Admin", path: "/admin", permission: "admin.access" },
];
