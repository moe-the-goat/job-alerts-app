"use client";

import * as React from "react";
import { Check, Copy, FileText, Loader2, Sparkles } from "lucide-react";
import { tailorCvAction, type TailorState } from "@/app/actions/tailor";

/**
 * Per-job CV tailoring (Tier 6b) — lives inside the expanded job row. Two
 * button-triggered modes: a cheap "gap check" and a capped full "tailored
 * draft". Results render as copyable plain text; repeat clicks are served
 * from the server-side cache until the CV changes.
 */
export function CvTailorPanel({ jobResultId }: { jobResultId: number }) {
  const [busy, setBusy] = React.useState<"suggestions" | "recreate" | null>(null);
  const [result, setResult] = React.useState<
    (TailorState & { mode: "suggestions" | "recreate" }) | null
  >(null);
  const [copied, setCopied] = React.useState(false);

  function run(mode: "suggestions" | "recreate") {
    if (busy) return;
    setBusy(mode);
    setCopied(false);
    const fd = new FormData();
    fd.set("job_result_id", String(jobResultId));
    fd.set("mode", mode);
    tailorCvAction(undefined, fd)
      .then((res) => setResult({ ...res, mode }))
      .catch(() =>
        setResult({ ok: false, error: "Something went wrong. Try again.", mode }),
      )
      .finally(() => setBusy(null));
  }

  function copy() {
    if (!result?.content) return;
    navigator.clipboard?.writeText(result.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="mt-3 rounded-lg bg-[var(--bg-elevated)]/70 p-3 shadow-[var(--shadow-recessed)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Tailor your CV for this job
        </p>
        <div className="flex items-center gap-1.5">
          <TailorButton
            icon={Sparkles}
            label="Gap check"
            title="What this posting wants that your CV doesn't show — and what to fix."
            loading={busy === "suggestions"}
            disabled={busy !== null}
            onClick={() => run("suggestions")}
          />
          <TailorButton
            icon={FileText}
            label="Tailored draft"
            title="A one-page CV draft re-emphasized for this job (max 3/day)."
            loading={busy === "recreate"}
            disabled={busy !== null}
            onClick={() => run("recreate")}
          />
        </div>
      </div>

      {result && !result.ok && (
        <p className="mt-2 text-[11.5px] text-[var(--danger-400)]">{result.error}</p>
      )}

      {result?.ok && result.content && (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[var(--text-tertiary)]">
              {result.mode === "recreate" ? "Tailored CV draft" : "Gap check"}
              {result.cached
                ? " · served from cache (free)"
                : typeof result.remaining === "number"
                  ? ` · ${result.remaining} left today`
                  : ""}
              {" · nothing here is invented — it only reuses your real CV"}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-[var(--success-400)]" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
          </div>
          <pre className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-[var(--surface-recessed)] p-3 font-sans text-[12px] leading-relaxed text-[var(--text-secondary)] shadow-[var(--shadow-recessed)]">
            {result.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function TailorButton({
  icon: Icon,
  label,
  title,
  loading,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-muted)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-400)]" />
      ) : (
        <Icon className="h-3 w-3 text-[var(--text-tertiary)]" />
      )}
      {label}
    </button>
  );
}
