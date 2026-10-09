export const FLAG_STATUSES = ["enabled", "disabled"] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

export const OWNER_TEAMS = ["payments", "onboarding", "cards", "lending", "platform"] as const;
export type OwnerTeam = (typeof OWNER_TEAMS)[number];

/** Only production is modelled; there is no flag service or SDK behind these records. */
export const FLAG_ENVIRONMENT = "production";
export const FLAG_ENTITY = "feature_flag";

export const FLAG_AUDIT_ACTIONS = {
  enabled: "flags.enabled",
  disabled: "flags.disabled",
} as const;

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  ownerTeam: OwnerTeam;
  environment: typeof FLAG_ENVIRONMENT;
  status: FlagStatus;
  lastChangedBy: string | null;
  lastChangedByName: string | null;
  lastChangedAt: string | null;
  lastChangeReason: string | null;
  createdAt: string;
  updatedAt: string;
}
