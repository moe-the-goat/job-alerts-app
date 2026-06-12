import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  rightSlot?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, rightSlot, id, ...props }, ref) => {
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
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedById}
            className={cn(
              "w-full h-10 rounded-md px-3 text-sm",
              "bg-[var(--surface-recessed)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
              "border border-[var(--border-muted)] shadow-[var(--shadow-recessed)]",
              "outline-none transition-all duration-150 ease-out",
              "focus:border-[var(--accent-500)] focus:shadow-[var(--shadow-recessed),0_0_0_3px_rgba(83,155,245,0.18)]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error &&
                "border-[var(--danger-400)] focus:border-[var(--danger-400)] focus:shadow-[var(--shadow-recessed),0_0_0_3px_rgba(229,83,75,0.18)]",
              rightSlot && "pr-10",
              className,
            )}
            {...props}
          />
          {rightSlot && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center text-[var(--text-tertiary)]">
              {rightSlot}
            </div>
          )}
        </div>
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
Input.displayName = "Input";
