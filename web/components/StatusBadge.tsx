type Tone = "neutral" | "info" | "success" | "danger" | "warning";

const TONES: Record<string, Tone> = {
  pending: "neutral",
  in_review: "info",
  approved: "success",
  rejected: "danger",
  low: "success",
  medium: "warning",
  high: "danger",
  viewer: "neutral",
  reviewer: "info",
  admin: "warning",
};

export function humanize(value: string): string {
  return value.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ value, tone }: { value: string; tone?: Tone }) {
  return <span className={`badge badge-${tone ?? TONES[value] ?? "neutral"}`}>{humanize(value)}</span>;
}

export const RoleBadge = ({ role }: { role: string }) => <StatusBadge value={role} />;
