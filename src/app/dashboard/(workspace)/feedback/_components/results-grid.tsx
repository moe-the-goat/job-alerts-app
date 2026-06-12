"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bookmark,
  Check,
  ExternalLink,
  EyeOff,
  Globe2,
  Loader2,
  MapPin,
  MapPinOff,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupByOrigin } from "@/lib/origin-sections";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu";
import { Kbd } from "@/components/ui/kbd";
import { MatchScore } from "@/components/ui/match-score";
import { Tooltip } from "@/components/ui/tooltip";
import {
  isTypingTarget,
  useWorkspace,
} from "@/components/workspace/workspace-context";
import type { FeedbackType, JobWithFeedback } from "../_lib/types";
import { SeverityBadge, type SeverityKind } from "./severity-badge";

interface ResultsGridProps {
  jobs: JobWithFeedback[];
}

interface ActionMeta {
  type: FeedbackType;
  label: string;
  icon: LucideIcon;
  kbd?: string[];
  destructive?: boolean;
}

const ACTIONS: ActionMeta[] = [
  { type: "applied", label: "Mark Applied", icon: Check, kbd: ["A"] },
  { type: "bookmarked", label: "Bookmark", icon: Bookmark },
  { type: "not_relevant", label: "Not for me", icon: EyeOff },
  { type: "wrong_location", label: "Wrong location", icon: MapPinOff },
  { type: "other", label: "Other", icon: MoreHorizontal },
  {
    type: "block_company",
    label: "Block company",
    icon: Shield,
    kbd: ["B"],
    destructive: true,
  },
];

export function pickSeverities(job: JobWithFeedback): SeverityKind[] {
  const out: SeverityKind[] = [];
  // Order matters — the verdict prefix in core_ai uses [SCAM] before
  // [AI-SUSPICIOUS] before [BLACKLIST]; we follow the same priority.
  const verdict = job.ai_verdict ?? "";
  if (verdict.includes("[SCAM]")) out.push("scam");
  if (job.suspicious || verdict.includes("[AI-SUSPICIOUS]")) {
    out.push("suspicious");
  }
  if (job.pre_flagged_low_quality) out.push("low_quality");
  if (job.pre_flagged_trusted && out.length === 0) out.push("trusted");
  return out;
}

// Sectioning lives in a shared pure module (also used by the email
// feedback page, which is a server component); re-exported here so the
// grid's public surface and its tests are unchanged.
export { groupByOrigin };

export function ResultsGrid({ jobs }: ResultsGridProps) {
  const router = useRouter();
  const { registerGridAdapter } = useWorkspace();

  const [feedbackByJob, setFeedbackByJob] = React.useState<
    Record<number, FeedbackType[]>
  >(() => Object.fromEntries(jobs.map((j) => [j.id, j.feedback])));
  const [pendingByJob, setPendingByJob] = React.useState<
    Record<number, FeedbackType | null>
  >({});
  const [errorByJob, setErrorByJob] = React.useState<
    Record<number, string | null>
  >({});
  const [focusedId, setFocusedId] = React.useState<number | null>(null);
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [fullScreen, setFullScreen] = React.useState(false);

  const rowRefs = React.useRef(new Map<number, HTMLDivElement>());

  // Server refresh after a successful write may add feedback rows we don't
  // have locally — merge, never drop an optimistic entry that's in flight.
  React.useEffect(() => {
    setFeedbackByJob((prev) => {
      const next: Record<number, FeedbackType[]> = {};
      for (const job of jobs) {
        const local = prev[job.id] ?? [];
        next[job.id] = Array.from(new Set([...job.feedback, ...local]));
      }
      return next;
    });
  }, [jobs]);

  const sendFeedback = React.useCallback(
    async (job: JobWithFeedback, type: FeedbackType) => {
      const submitted = feedbackByJob[job.id] ?? [];
      if (submitted.includes(type)) return; // append-only — repeat click is a no-op
      if (
        type === "block_company" &&
        !window.confirm(
          `Block ${job.company ?? "this company"}? Their jobs stop appearing in future runs.`,
        )
      ) {
        return;
      }
      setErrorByJob((e) => ({ ...e, [job.id]: null }));
      setPendingByJob((p) => ({ ...p, [job.id]: type }));
      // Optimistic: paint the chip immediately, roll back on error.
      setFeedbackByJob((f) => ({ ...f, [job.id]: [...submitted, type] }));
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_result_id: job.id, feedback_type: type }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setFeedbackByJob((f) => ({ ...f, [job.id]: submitted }));
        setErrorByJob((e) => ({
          ...e,
          [job.id]: err instanceof Error ? err.message : "Something went wrong.",
        }));
      } finally {
        setPendingByJob((p) => ({ ...p, [job.id]: null }));
      }
    },
    [feedbackByJob, router],
  );

  const focusJob = React.useCallback((id: number) => {
    setFocusedId(id);
    setExpandedId(id);
    rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
  }, []);

  // Register with the command palette while mounted.
  React.useEffect(() => {
    registerGridAdapter({
      jobs: jobs.map((j) => ({ id: j.id, title: j.title, company: j.company })),
      focusedJobId: focusedId,
      focusJob,
      actOnFocused: (type) => {
        const job = jobs.find((j) => j.id === focusedId);
        if (job) void sendFeedback(job, type);
      },
    });
    return () => registerGridAdapter(null);
  }, [jobs, focusedId, focusJob, sendFeedback, registerGridAdapter]);

  // Keyboard flow: J/K move, Enter expands, A applied, B block, O opens.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (jobs.length === 0) return;
      const idx = jobs.findIndex((j) => j.id === focusedId);
      const move = (delta: number) => {
        e.preventDefault();
        const next = jobs[Math.max(0, Math.min(jobs.length - 1, idx + delta))];
        setFocusedId(next.id);
        rowRefs.current.get(next.id)?.scrollIntoView({ block: "nearest" });
      };
      switch (e.key.toLowerCase()) {
        case "j":
        case "arrowdown":
          move(idx === -1 ? 0 : 1);
          break;
        case "k":
        case "arrowup":
          move(idx === -1 ? 0 : -1);
          break;
        case "enter": {
          if (focusedId === null) return;
          e.preventDefault();
          setExpandedId((open) => (open === focusedId ? null : focusedId));
          break;
        }
        case "a": {
          const job = jobs.find((j) => j.id === focusedId);
          if (job) {
            e.preventDefault();
            void sendFeedback(job, "applied");
          }
          break;
        }
        case "b": {
          const job = jobs.find((j) => j.id === focusedId);
          if (job) {
            e.preventDefault();
            void sendFeedback(job, "block_company");
          }
          break;
        }
        case "o": {
          const job = jobs.find((j) => j.id === focusedId);
          if (job?.job_url) {
            e.preventDefault();
            window.open(job.job_url, "_blank", "noopener,noreferrer");
          }
          break;
        }
        case "escape":
          if (fullScreen) setFullScreen(false);
          else setExpandedId(null);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jobs, focusedId, fullScreen, sendFeedback]);

  const sections = groupByOrigin(jobs);

  return (
    <div
      className={cn(
        "@container",
        fullScreen &&
          "fixed inset-0 z-50 overflow-y-auto bg-[var(--surface-base)] px-6 py-5",
      )}
      data-testid="results-grid"
    >
      <div className="mb-2 flex items-center justify-end gap-3">
        <p className="hidden items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] @[560px]:flex">
          <Kbd keys={["J"]} /> / <Kbd keys={["K"]} /> move ·{" "}
          <Kbd keys={["Enter"]} /> expand · <Kbd keys={["A"]} /> applied
        </p>
        <Tooltip content={fullScreen ? "Exit focus mode" : "Focus mode"}>
          <button
            type="button"
            onClick={() => setFullScreen((f) => !f)}
            aria-label={fullScreen ? "Exit focus mode" : "Focus mode"}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] outline-none transition-colors duration-150 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {fullScreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </Tooltip>
      </div>

      {sections.map((section) => (
        <section key={section.label} className="mb-6 last:mb-0">
          <header className="flex items-baseline gap-2 border-b border-[var(--border-muted)] pb-1.5">
            {section.icon === "globe" && (
              <Globe2 className="h-3.5 w-3.5 self-center text-[var(--text-tertiary)]" />
            )}
            {section.icon === "pin" && (
              <MapPin className="h-3.5 w-3.5 self-center text-[var(--text-tertiary)]" />
            )}
            <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
              {section.label}
            </h3>
            <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
              {section.jobs.length}
            </span>
          </header>

          <div role="list">
            {section.jobs.map((job) => (
              <Row
                key={job.id}
                job={job}
                focused={focusedId === job.id}
                expanded={expandedId === job.id}
                submitted={feedbackByJob[job.id] ?? []}
                pending={pendingByJob[job.id] ?? null}
                error={errorByJob[job.id] ?? null}
                rowRef={(el) => {
                  if (el) rowRefs.current.set(job.id, el);
                  else rowRefs.current.delete(job.id);
                }}
                onFocusRow={() => setFocusedId(job.id)}
                onToggleExpand={() => {
                  setFocusedId(job.id);
                  setExpandedId((open) => (open === job.id ? null : job.id));
                }}
                onAction={(type) => void sendFeedback(job, type)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  job,
  focused,
  expanded,
  submitted,
  pending,
  error,
  rowRef,
  onFocusRow,
  onToggleExpand,
  onAction,
}: {
  job: JobWithFeedback;
  focused: boolean;
  expanded: boolean;
  submitted: FeedbackType[];
  pending: FeedbackType | null;
  error: string | null;
  rowRef: (el: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  onToggleExpand: () => void;
  onAction: (type: FeedbackType) => void;
}) {
  const severities = pickSeverities(job);
  const alarming = severities.includes("scam") || severities.includes("suspicious");
  const trusted = severities.includes("trusted");

  const menuItems: ContextMenuItem[] = [
    ...ACTIONS.map((a) => ({
      id: a.type,
      label: a.label,
      icon: a.icon,
      kbd: a.kbd,
      destructive: a.destructive,
      disabled: submitted.includes(a.type),
      onSelect: () => onAction(a.type),
    })),
    ...(job.job_url
      ? [
          {
            id: "open",
            label: "Open job posting",
            icon: ExternalLink,
            kbd: ["O"],
            onSelect: () =>
              window.open(job.job_url!, "_blank", "noopener,noreferrer"),
          },
        ]
      : []),
  ];

  return (
    <ContextMenu items={menuItems}>
      <div role="listitem" ref={rowRef}>
        <div
          onClick={onToggleExpand}
          onMouseEnter={onFocusRow}
          data-focused={focused || undefined}
          className={cn(
            "grid cursor-pointer items-center gap-x-3 border-b border-[rgba(255,244,224,0.04)] px-2 py-[7px]",
            "grid-cols-[auto_minmax(0,1fr)_auto] @[480px]:grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1fr)_auto] @[680px]:grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]",
            "transition-colors duration-150",
            focused ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-elevated)]",
            alarming && "severity-pulse",
            trusted && "shadow-[inset_2px_0_0_0_rgba(155,196,160,0.4)]",
          )}
        >
          <MatchScore
            score={job.match_percentage}
            tech={job.tech_fit}
            experience={job.experience_fit}
            logistics={job.logistics_fit}
          />

          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
              {job.title ?? "Untitled role"}
            </span>
            {severities.map((kind) => (
              <SeverityBadge key={kind} kind={kind} />
            ))}
            {submitted.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--sage-400)]">
                <Check className="h-3 w-3" />
                {submitted.includes("applied") ? "applied" : "noted"}
              </span>
            )}
            {pending && (
              <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />
            )}
          </div>

          <span className="hidden truncate text-[12px] text-[var(--text-secondary)] @[480px]:block">
            {job.company ?? "Unknown company"}
          </span>

          <span className="hidden min-w-0 items-center gap-1 truncate text-[11.5px] text-[var(--text-tertiary)] @[680px]:flex">
            {job.location && (
              <>
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{job.location}</span>
              </>
            )}
          </span>

          <RowMenuButton items={menuItems} />
        </div>

        {error && (
          <p className="flex items-center gap-1 px-2 py-1 text-[10.5px] text-[var(--terracotta-400)]">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}

        {expanded && (
          <RowDetail job={job} submitted={submitted} pending={pending} onAction={onAction} />
        )}
      </div>
    </ContextMenu>
  );
}

/** The "⋯" affordance — same items as right-click, for mouse-first users. */
function RowMenuButton({ items }: { items: ContextMenuItem[] }) {
  return (
    <ContextMenu
      items={items}
      trigger={(open) => (
        <button
          type="button"
          aria-label="Row actions"
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            open(e.currentTarget);
          }}
          className="rounded p-1 text-[var(--text-tertiary)] outline-none transition-colors duration-150 hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      )}
    >
      {null}
    </ContextMenu>
  );
}

function RowDetail({
  job,
  submitted,
  pending,
  onAction,
}: {
  job: JobWithFeedback;
  submitted: FeedbackType[];
  pending: FeedbackType | null;
  onAction: (type: FeedbackType) => void;
}) {
  return (
    <div
      className="row-detail-enter border-b border-[rgba(255,244,224,0.04)] bg-[var(--surface-recessed)]/60 px-3 py-3"
      data-testid={`row-detail-${job.id}`}
    >
      <div className="grid gap-3 @[640px]:grid-cols-[3fr_2fr]">
        {job.ai_verdict ? (
          <div className="rounded-lg bg-[var(--bg-elevated)]/70 p-3 shadow-[var(--shadow-recessed)]">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Why the AI picked it
            </p>
            <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              {job.ai_verdict}
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-[var(--bg-elevated)]/70 p-3 shadow-[var(--shadow-recessed)]">
            <p className="text-[12px] text-[var(--text-tertiary)]">
              This row wasn&apos;t individually AI-reviewed — it cleared the
              similarity pre-screen only.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {job.description_excerpt && (
            <div className="max-h-36 overflow-y-auto rounded-lg bg-[var(--bg-elevated)]/70 p-3 shadow-[var(--shadow-recessed)]">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                From the posting
              </p>
              <p className="whitespace-pre-line text-[12px] leading-relaxed text-[var(--text-secondary)]">
                {job.description_excerpt}
              </p>
            </div>
          )}
          <dl className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px]">
            {job.compensation && (
              <MetaPair label="Comp" value={job.compensation} />
            )}
            {job.effort && job.effort !== "unknown" && (
              <MetaPair label="Effort" value={job.effort} />
            )}
            {job.similarity !== null && (
              <MetaPair label="CV similarity" value={String(job.similarity)} />
            )}
          </dl>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {ACTIONS.map(({ type, label, icon: Icon, destructive }) => {
            const isActive = submitted.includes(type);
            const isLoading = pending === type;
            return (
              <button
                key={type}
                type="button"
                disabled={isActive || isLoading}
                aria-pressed={isActive}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(type);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] outline-none transition-all duration-150",
                  "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
                  "disabled:cursor-default",
                  isActive
                    ? destructive
                      ? "bg-[var(--terracotta-400)]/15 text-[var(--terracotta-400)] ring-1 ring-inset ring-[var(--terracotta-400)]/30"
                      : "bg-[var(--accent-500)]/15 text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-500)]/30"
                    : "bg-[var(--bg-overlay)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)] hover:text-[var(--text-primary)] hover:ring-[var(--border-strong)]",
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                {label}
              </button>
            );
          })}
        </div>
        {job.job_url && (
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md text-[11.5px] text-[var(--text-tertiary)] outline-none transition-colors duration-150 hover:text-[var(--accent-400)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Open job
            <ExternalLink className="h-3 w-3" />
            <Kbd keys={["O"]} />
          </a>
        )}
      </div>
    </div>
  );
}

function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-baseline gap-1">
      <dt className="uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="font-mono text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}
