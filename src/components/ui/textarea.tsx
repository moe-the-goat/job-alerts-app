import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, error, id, rows = 8, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const describedById = hint || error ? `${inputId}-desc` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          className={cn(
            "w-full rounded-md px-3 py-2.5 text-sm leading-relaxed",
            "bg-[var(--surface-recessed)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
            "border border-[var(--border-muted)] shadow-[var(--shadow-recessed)]",
            "outline-none transition-all duration-150 ease-out resize-y",
            "focus:border-[var(--accent-500)] focus:shadow-[var(--shadow-recessed),0_0_0_3px_color-mix(in_srgb,var(--accent-500)_18%,transparent)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error &&
              "border-[var(--danger-400)] focus:border-[var(--danger-400)] focus:shadow-[var(--shadow-recessed),0_0_0_3px_color-mix(in_srgb,var(--danger-400)_18%,transparent)]",
            className,
          )}
          {...props}
        />
        {(hint || error) && (
          <p
            id={describedById}
            className={cn(
              "mt-1.5 text-xs leading-relaxed",
              error ? "text-[var(--danger-400)]" : "text-[var(--text-tertiary)]",
            )}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";
