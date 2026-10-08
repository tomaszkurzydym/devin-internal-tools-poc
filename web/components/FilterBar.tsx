import { humanize } from "./StatusBadge";

export interface SelectFilter {
  name: string;
  label: string;
  options: readonly string[];
}

/** Controlled filter bar: a search box plus any number of select filters, backed by a flat value map. */
export function FilterBar({
  values,
  onChange,
  searchName,
  searchPlaceholder,
  selects = [],
}: {
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  searchName?: string;
  searchPlaceholder?: string;
  selects?: SelectFilter[];
}) {
  const active = Object.values(values).some(Boolean);
  return (
    <div className="filter-bar" role="search">
      {searchName && (
        <input
          type="search"
          aria-label={searchPlaceholder ?? "Search"}
          placeholder={searchPlaceholder}
          value={values[searchName] ?? ""}
          onChange={(e) => onChange(searchName, e.target.value)}
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
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => Object.keys(values).forEach((k) => onChange(k, ""))}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
