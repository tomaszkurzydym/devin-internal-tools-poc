import type { ButtonHTMLAttributes, FormEvent, ReactNode } from "react";

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  required,
  maxLength = 2000,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
      {error && (
        <div id={`${id}-error`} className="field-error">
          {error}
        </div>
      )}
    </div>
  );
}

export function Button({
  variant = "primary",
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "success"; busy?: boolean }) {
  return (
    <button {...rest} className={`btn btn-${variant}`} disabled={rest.disabled || busy}>
      {busy ? "Working…" : children}
    </button>
  );
}

export function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + "" : "—";
