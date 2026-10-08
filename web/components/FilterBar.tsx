import { useEffect, useRef, useState } from "react";
import { humanize } from "./StatusBadge";

export interface SelectFilter {
  name: string;
  label: string;
  options: readonly string[];
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Search box with local state; commits to `onCommit` after a short pause so fast typing is never
 * overwritten by a lagging external (e.g. URL) value. External changes (like Clear) resync it.
 */
function SearchInput({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committed.current) return;
    const t = setTimeout(() => {
      committed.current = text;
      commitRef.current(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <input
      type="search"
      aria-label={placeholder ?? "Search"}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

/** Filter bar: a debounced search box plus any number of select filters, backed by a flat value map. */
export function FilterBar({
  values,
  onChange,
  onClear,
  searchName,
  searchPlaceholder,
  selects = [],
}: {
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onClear: () => void;
  searchName?: string;
  searchPlaceholder?: string;
  selects?: SelectFilter[];
}) {
  const active = Object.values(values).some(Boolean);
  return (
    <div className="filter-bar" role="search">
      {searchName && (
        <SearchInput
          value={values[searchName] ?? ""}
          onCommit={(v) => onChange(searchName, v.trim())}
          placeholder={searchPlaceholder}
        />
      )}
      {selects.map((s) => (
        <label key={s.name} className="filter-select">
          <span>{s.label}</span>
          <select value={values[s.name] ?? ""} onChange={(e) => onChange(s.name, e.target.value)} aria-label={s.label}>
            <option value="">All</option>
            {s.options.map((o) => (
              <option key={o} value={o}>
                {humanize(o)}
              </option>
            ))}
          </select>
        </label>
      ))}
      {active && (
        <button className="btn btn-secondary btn-sm" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
