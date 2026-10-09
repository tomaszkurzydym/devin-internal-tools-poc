export const FLAG_STATUSES = ["enabled", "disabled"] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];
export const OWNER_TEAMS = ["payments", "onboarding", "cards", "lending", "platform"] as const;

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  ownerTeam: string;
  environment: "production";
  status: FlagStatus;
  lastChangedBy: string | null;
  lastChangedByName: string | null;
  lastChangedAt: string | null;
  lastChangeReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FlagAction = "enable" | "disable";

export interface FlagDetail {
  flag: FeatureFlag;
  availableActions: FlagAction[];
}

export const MAX_REASON_LENGTH = 500;
