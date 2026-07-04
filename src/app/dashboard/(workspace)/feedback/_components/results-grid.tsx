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
  MessageSquarePlus,
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
import { CvTailorPanel } from "./cv-tailor-panel";

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
    Record<number, FeedbackType | null>
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

  // Server refresh after a successful write reflects the canonical verdict —
  // adopt it, but keep an optimistic value that's still in flight (pending).
  React.useEffect(() => {
    setFeedbackByJob((prev) => {
      const next: Record<number, FeedbackType | null> = {};
      for (const job of jobs) {
        next[job.id] = prev[job.id] ?? job.feedback;
        // Server is authoritative once nothing is pending for this job.
        if (pendingByJob[job.id] == null) next[job.id] = job.feedback;
      }
      return next;
    });
    // pendingByJob intentionally omitted — we only reconcile on a jobs refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const sendFeedback = React.useCallback(
    async (job: JobWithFeedback, type: FeedbackType, note?: string | null) => {
      const current = feedbackByJob[job.id] ?? null;
      const trimmedNote =
        typeof note === "string" && note.trim().length > 0 ? note.trim() : null;
      // One verdict per job. Re-tapping the SAME reaction is a no-op unless it
      // now carries a note (then we re-send so the API backfills it). Tapping a
      // DIFFERENT reaction replaces the verdict.
      if (current === type && !trimmedNote) return true;
      if (
        type === "block_company" &&
        current !== type &&
        !window.confirm(
          `Block ${job.company ?? "this company"}? Their jobs stop appearing in future runs.`,
        )
      ) {
        return false;
      }
      setErrorByJob((e) => ({ ...e, [job.id]: null }));
      setPendingByJob((p) => ({ ...p, [job.id]: type }));
      // Optimistic: paint the new verdict immediately, roll back on error.
      setFeedbackByJob((f) => ({ ...f, [job.id]: type }));
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_result_id: job.id,
            feedback_type: type,
            note: trimmedNote,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
        return true;
      } catch (err) {
        setFeedbackByJob((f) => ({ ...f, [job.id]: current }));
        setErrorByJob((e) => ({
          ...e,
          [job.id]: err instanceof Error ? err.message : "Something went wrong.",
        }));
        return false;
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
                verdict={feedbackByJob[job.id] ?? null}
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
                onAction={(type, note) => sendFeedback(job, type, note)}
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
  verdict,
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
  verdict: FeedbackType | null;
  pending: FeedbackType | null;
  error: string | null;
  rowRef: (el: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  onToggleExpand: () => void;
  onAction: (type: FeedbackType, note?: string | null) => void | Promise<boolean>;
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
      // Only the current verdict is disabled — tapping another replaces it.
      disabled: verdict === a.type,
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
            "grid cursor-pointer items-center gap-x-3 border-b border-[rgba(205,217,229,0.05)] px-2 py-[7px]",
            "grid-cols-[auto_minmax(0,1fr)_auto] @[480px]:grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1fr)_auto] @[680px]:grid-cols-[auto_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]",
            "transition-colors duration-150",
            focused ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-elevated)]",
            alarming && "severity-pulse",
            trusted && "shadow-[inset_2px_0_0_0_rgba(87,171,90,0.4)]",
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
            {verdict && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--success-400)]">
                <Check className="h-3 w-3" />
                {verdict === "applied" ? "applied" : "noted"}
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
          <p className="flex items-center gap-1 px-2 py-1 text-[10.5px] text-[var(--danger-400)]">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}

        {expanded && (
          <RowDetail job={job} verdict={verdict} pending={pending} onAction={onAction} />
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
  verdict,
  pending,
  onAction,
}: {
  job: JobWithFeedback;
  verdict: FeedbackType | null;
  pending: FeedbackType | null;
  onAction: (type: FeedbackType, note?: string | null) => void | Promise<boolean>;
}) {
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteSaved, setNoteSaved] = React.useState(false);

  const hasReacted = verdict !== null;
  // "Save note" re-sends the current verdict so the API backfills the note
  // onto its row. block_company is excluded — re-sending it would re-trigger
  // the confirm dialog.
  const lastReaction = verdict !== "block_company" ? verdict : null;

  function reactWithNote(type: FeedbackType) {
    const trimmed = note.trim();
    const result = onAction(type, trimmed.length > 0 ? trimmed : null);
    if (trimmed.length > 0) {
      Promise.resolve(result).then((ok) => {
        if (ok !== false) setNoteSaved(true);
      });
    }
  }

  function saveNote() {
    const trimmed = note.trim();
    if (trimmed.length === 0 || lastReaction == null || pending) return;
    Promise.resolve(onAction(lastReaction, trimmed)).then((ok) => {
      if (ok !== false) setNoteSaved(true);
    });
  }

  return (
    <div
      className="row-detail-enter border-b border-[rgba(205,217,229,0.05)] bg-[var(--surface-recessed)]/60 px-3 py-3"
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

      <CvTailorPanel jobResultId={job.id} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {ACTIONS.map(({ type, label, icon: Icon, destructive }) => {
            const isActive = verdict === type;
            const isLoading = pending === type;
            return (
              <button
                key={type}
                type="button"
                disabled={isActive || isLoading}
                aria-pressed={isActive}
                onClick={(e) => {
                  e.stopPropagation();
                  reactWithNote(type);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] outline-none transition-all duration-150",
                  "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
                  "disabled:cursor-default",
                  isActive
                    ? destructive
                      ? "bg-[var(--danger-400)]/15 text-[var(--danger-400)] ring-1 ring-inset ring-[var(--danger-400)]/30"
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

      {/* Optional free-text note — same idea as the email feedback page: kept
          behind a toggle so the one-click path is untouched. The note rides
          with the next reaction; if you've already reacted, "Save note"
          re-sends your last reaction so the API backfills it onto that row. */}
      {!noteOpen ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setNoteOpen(true);
          }}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-tertiary)] outline-none transition-colors hover:text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {noteSaved ? "Note added — edit" : "Add a note"}
        </button>
      ) : (
        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value.slice(0, MAX_NOTE_LENGTH));
              setNoteSaved(false);
            }}
            maxLength={MAX_NOTE_LENGTH}
            rows={2}
            placeholder="Why? This trains tomorrow's scoring (optional)."
            className={cn(
              "w-full resize-none rounded-lg bg-[var(--surface-recessed)] px-2.5 py-2 text-[12px] text-[var(--text-primary)]",
              "placeholder:text-[var(--text-tertiary)] shadow-[var(--shadow-recessed)]",
              "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            )}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[var(--text-tertiary)]">
              {hasReacted
                ? "Save it onto your last reaction, or tap a new one to attach it."
                : "Sent with your next reaction."}
              {note.length > 0 && ` · ${note.length}/${MAX_NOTE_LENGTH}`}
            </span>
            {hasReacted && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  saveNote();
                }}
                disabled={pending !== null || note.trim().length === 0}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  note.trim().length === 0 || pending !== null
                    ? "text-[var(--text-tertiary)]"
                    : "bg-[var(--accent-500)] text-white hover:bg-[var(--accent-400)]",
                )}
              >
                {pending !== null ? "Saving…" : noteSaved ? "Saved" : "Save note"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const MAX_NOTE_LENGTH = 500;

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
