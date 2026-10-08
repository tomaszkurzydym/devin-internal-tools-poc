import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

/** Fetches `url`. Data is keyed by URL so a response for old filters is never shown under new ones. */
export function useApi<T>(url: string | null) {
  const [result, setResult] = useState<{ url: string; data: T } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<T>(url)
      .then((d) => {
        if (!cancelled) {
          setResult({ url, data: d });
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e : new ApiError(0, "network", String(e)));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((d: T) => url && setResult({ url, data: d }), [url]);
  const data = result && result.url === url ? result.data : null;
  return { data, error, loading, reload, setData };
}
