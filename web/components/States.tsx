import type { ApiError } from "../core/api";

export const Loading = ({ label = "Loading…" }: { label?: string }) => (
  <div className="state state-loading" role="status">
    {label}
  </div>
);

export const EmptyState = ({ message }: { message: string }) => <div className="state state-empty">{message}</div>;

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const status = "status" in error ? (error as ApiError).status : 0;
  const title =
    status === 403 ? "You don't have access to this page" : status === 404 ? "Not found" : "Something went wrong";
  return (
    <div className="state state-error" role="alert">
      <strong>{title}</strong>
      <p>{error.message}</p>
      {onRetry && status !== 403 && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ kind, children, onDismiss }: { kind: "success" | "error"; children: string; onDismiss?: () => void }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onDismiss && (
        <button className="link-btn" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
