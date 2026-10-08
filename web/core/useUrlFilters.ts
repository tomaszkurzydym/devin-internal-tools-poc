import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Filter state stored in the URL query string (shareable, survives refresh). */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ""])) as Record<K, string>;

  const set = useCallback(
    (name: string, value: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(name, value);
          else next.delete(name);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // A single navigation: several sequential setParams calls in one tick would overwrite each other.
  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  return { filters, set, clear };
}
