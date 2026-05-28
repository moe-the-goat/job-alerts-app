"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, Clock, Loader2 } from "lucide-react";
import type { RunSummary } from "../_lib/types";

interface RunPickerProps {
  runs: RunSummary[];
  activeRunId: number | null;
}

export function RunPicker({ runs, activeRunId }: RunPickerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (runs.length <= 1) {
    return null;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    startTransition(() => {
      const search = next ? `?run=${next}` : "";
      router.push(`/dashboard/feedback${search}`);
    });
  }

  return (
    <label className="relative inline-flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
      <Clock className="h-3 w-3" />
      <span>Run:</span>
      <div className="relative">
        <select
          value={activeRunId ?? ""}
          onChange={handleChange}
          disabled={pending}
          className="appearance-none rounded-md border border-[var(--border-muted)] bg-[var(--bg-elevated)] py-1 pl-2.5 pr-7 text-[12px] text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-500)] focus:ring-2 focus:ring-[var(--ring)]"
        >
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {formatLabel(run)}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-1.5 inline-flex items-center text-[var(--text-tertiary)]">
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </span>
      </div>
    </label>
  );
}

function formatLabel(run: RunSummary): string {
  const when = formatRelative(run.started_at);
  if (run.status === "success") {
    return `${when} · ${run.approved} approved`;
  }
  return `${when} · ${run.status}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  if (diffMs < 60 * 60 * 1000) {
    const m = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    return `${m}m ago`;
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diffMs / (60 * 60 * 1000));
    return `${h}h ago`;
  }
  const d = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
