"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  id?: string;
  name?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  className?: string;
}

export function Switch({
  id,
  name,
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  className,
}: SwitchProps) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <button
        type="button"
        role="switch"
        id={inputId}
        aria-checked={checked}
        aria-describedby={description ? `${inputId}-desc` : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
          "transition-colors duration-150 ease-out outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          checked
            ? "bg-[var(--accent-500)]"
            : "bg-[var(--bg-overlay)] ring-1 ring-inset ring-[var(--border-muted)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150 ease-out",
            checked ? "translate-x-[18px]" : "translate-x-[3px]",
          )}
        />
      </button>
      {/* Hidden input mirrors the boolean so it gets serialized in form submission. */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={checked ? "true" : "false"}
        />
      )}
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <label
              htmlFor={inputId}
              className="block cursor-pointer text-sm font-medium text-[var(--text-primary)]"
            >
              {label}
            </label>
          )}
          {description && (
            <p
              id={`${inputId}-desc`}
              className="mt-0.5 text-xs leading-relaxed text-[var(--text-tertiary)]"
            >
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
