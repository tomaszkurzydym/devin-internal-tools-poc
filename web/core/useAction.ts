import { useCallback, useState } from "react";
import { ApiError } from "./api";

export type Feedback = { kind: "success" | "error"; message: string } | null;

/**
 * Runs one server mutation at a time with busy/feedback state. Field validation messages are
 * passed to `onFieldError`; a 409 calls `onConflict` (usually a reload of the stale record).
 */
export function useAction<T>(opts: { onSuccess: (result: T) => void; onConflict?: () => void }) {
  const { onSuccess, onConflict } = opts;
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = useCallback(
    async (key: string, fn: () => Promise<T>, success: string, onFieldError?: (msg: string) => void) => {
      setBusy(key);
      setFeedback(null);
      try {
        onSuccess(await fn());
        setFeedback({ kind: "success", message: success });
        return true;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, "network", String(e));
        const fieldMsg = err.details && Object.values(err.details)[0];
        if (fieldMsg && onFieldError) onFieldError(fieldMsg);
        setFeedback({ kind: "error", message: fieldMsg ?? err.message });
        if (err.status === 409) onConflict?.();
        return false;
      } finally {
        setBusy(null);
      }
    },
    [onSuccess, onConflict],
  );

  return { busy, feedback, setFeedback, run };
}
