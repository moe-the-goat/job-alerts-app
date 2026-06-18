"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Loader2,
  Mail,
  Pause,
  Play,
  Shield,
  ShieldOff,
  Trash2,
  Zap,
} from "lucide-react";
import type { UserDetail } from "../_lib/user-detail";
import {
  adminTriggerRunAction,
  deleteUserAction,
  rescheduleUserAction,
  resendInviteAction,
  setUserActiveAction,
  setUserWhitelistAction,
} from "../actions";
import { Card, Stat, fmtAgo, fmtNum, fmtTime } from "./ui";

type ActionFn = (fd: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>;

/**
 * Per-user drill-down. The single hands-on management surface: identity + status
 * with all the per-user actions, then schedule, CV, searches, run history, the
 * latest run's surfaced jobs, feedback given, and LLM usage. Reuses the shared
 * analytics primitives so it reads as one product with the main tab.
 */
export function UserDetailView({ detail }: { detail: UserDetail }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function act(key: string, action: ActionFn, fields: Record<string, string>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setMsg(null);
    setPending(key);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    void action(fd)
      .then((res) => {
        if (res.ok) {
          setMsg({ tone: "ok", text: res.message ?? "Done." });
          if (key === "delete") router.push("/admin?tab=analytics");
          else router.refresh();
        } else {
          setMsg({ tone: "err", text: res.error ?? "Action failed." });
        }
      })
      .finally(() => setPending(null));
  }

  if (!detail.found) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-[var(--border-muted)] px-4 py-10 text-center text-[13px] text-[var(--text-tertiary)]">
        No user found for this id.
      </div>
    );
  }

  const id = detail.userId;
  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-[var(--border-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50";
  const spin = (k: string) => pending === k;

  return (
    <div>
      {/* Header: identity + status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {detail.name}
          </h1>
          <div className="mt-0.5 truncate text-[13px] text-[var(--text-secondary)]">
            {detail.email}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge label={detail.isActive ? "active" : "paused"} tone={detail.isActive ? "success" : "warning"} />
            <Badge label={detail.isWhitelisted ? "whitelisted" : "not whitelisted"} tone={detail.isWhitelisted ? "success" : "danger"} />
            {detail.createdAt && <Badge label={`joined ${fmtTime(detail.createdAt)}`} />}
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-[12.5px] ${
            msg.tone === "ok"
              ? "bg-[var(--success-400)]/[0.08] text-[var(--success-400)]"
              : "bg-[var(--danger-400)]/[0.08] text-[var(--danger-400)]"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={pending !== null} className={btn}
          onClick={() => act("active", setUserActiveAction, { user_id: id, active: String(!detail.isActive) }, detail.isActive ? `Pause runs for ${detail.email}?` : undefined)}>
          {spin("active") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : detail.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {detail.isActive ? "Pause" : "Resume"}
        </button>
        <button type="button" disabled={pending !== null} className={btn}
          onClick={() => act("wl", setUserWhitelistAction, { user_id: id, whitelisted: String(!detail.isWhitelisted) }, detail.isWhitelisted ? `Revoke beta access for ${detail.email}?` : undefined)}>
          {spin("wl") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : detail.isWhitelisted ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
          {detail.isWhitelisted ? "Unwhitelist" : "Whitelist"}
        </button>
        <button type="button" disabled={pending !== null} className={btn}
          onClick={() => act("run", adminTriggerRunAction, { user_id: id }, `Trigger a run now for ${detail.email}?`)}>
          {spin("run") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Run now
        </button>
        <button type="button" disabled={pending !== null} className={btn}
          onClick={() => act("sched", rescheduleUserAction, { user_id: id, when: "now" })}>
          {spin("sched") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
          Queue next tick
        </button>
        <button type="button" disabled={pending !== null} className={btn}
          onClick={() => act("invite", resendInviteAction, { user_id: id }, `Re-send the setup email to ${detail.email}?`)}>
          {spin("invite") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          Resend setup email
        </button>
        <button type="button" disabled={pending !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--danger-400)]/40 px-2.5 py-1.5 text-[12px] text-[var(--danger-400)] transition-colors hover:bg-[var(--danger-400)]/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          onClick={() => act("delete", deleteUserAction, { user_id: id }, `Permanently DELETE ${detail.email} and all their data? This cannot be undone.`)}>
          {spin("delete") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete account
        </button>
      </div>

      {/* Schedule + onboarding snapshot */}
      <Card title="Schedule & setup">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Cadence" value={detail.schedule.frequencyHours ? `${detail.schedule.frequencyHours}h` : "—"} />
          <Stat label="Next run" value={detail.schedule.nextRunAt ? fmtAgo(detail.schedule.nextRunAt) : "—"} />
          <Stat label="AI eval top-N" value={detail.schedule.aiEvalTopN ?? "—"} />
          <Stat label="CV" value={detail.cv.present ? `${fmtNum(detail.cv.chars)} ch` : "missing"} tone={detail.cv.present ? undefined : "danger"} />
        </div>
        {detail.schedule.notificationEmail && detail.schedule.notificationEmail !== detail.email && (
          <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">
            Delivers to {detail.schedule.notificationEmail}
          </p>
        )}
      </Card>

      {/* CV preview */}
      {detail.cv.present && (
        <Card title="CV preview">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {detail.cv.preview}
            {detail.cv.chars > detail.cv.preview.length ? "\n…" : ""}
          </pre>
        </Card>
      )}

      {/* Searches */}
      <Card title={`Searches (${detail.searches.length})`}>
        {detail.searches.length === 0 ? (
          <Empty>No search queries.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {detail.searches.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-muted)]/50 bg-[var(--bg-elevated)]/30 px-3 py-2 text-[12.5px]">
                <span className="min-w-0 truncate text-[var(--text-secondary)]">
                  {s.term}
                  <span className="ml-2 text-[var(--text-tertiary)]">· {s.location}{s.isRemote ? " · remote" : ""}</span>
                </span>
                <span className={s.isActive ? "text-[var(--success-400)]" : "text-[var(--text-tertiary)]"}>
                  {s.isActive ? "active" : "off"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Run history */}
      <Card title={`Run history (${detail.counts.runs})`}>
        {detail.runs.length === 0 ? (
          <Empty>No runs yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[var(--text-tertiary)]">
                  <th className="py-1.5 pr-3 font-medium">When</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 pr-3 font-medium">Trigger</th>
                  <th className="py-1.5 pr-3 font-medium tabular-nums">Scraped</th>
                  <th className="py-1.5 pr-3 font-medium tabular-nums">Eval</th>
                  <th className="py-1.5 pr-3 font-medium tabular-nums">Approved</th>
                </tr>
              </thead>
              <tbody>
                {detail.runs.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border-muted)]/40">
                    <td className="py-1.5 pr-3 text-[var(--text-tertiary)]">{fmtTime(r.startedAt)}</td>
                    <td className="py-1.5 pr-3">
                      <span className={r.status === "success" ? "text-[var(--success-400)]" : r.status === "failed" ? "text-[var(--danger-400)]" : "text-[var(--text-tertiary)]"}>
                        {r.status}
                      </span>
                      {r.error && <span className="ml-2 text-[11px] text-[var(--danger-400)]/80">{r.error.slice(0, 50)}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-[var(--text-tertiary)]">{r.trigger}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-[var(--text-secondary)]">{r.scraped}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-[var(--text-secondary)]">{r.aiEvaluated}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-[var(--text-secondary)]">{r.approved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Latest run's surfaced jobs */}
      <Card title="Latest run — surfaced jobs">
        {detail.latestResults.length === 0 ? (
          <Empty>No job results on the latest run.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {detail.latestResults.map((j, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-muted)]/50 bg-[var(--bg-elevated)]/30 px-3 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                  {j.suspicious && <AlertTriangle className="mr-1 inline h-3 w-3 text-[var(--warning-400)]" />}
                  {j.title}
                  <span className="ml-2 text-[var(--text-tertiary)]">· {j.company}{j.location ? ` · ${j.location}` : ""}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {j.matchPercentage !== null && (
                    <span className="tabular-nums text-[var(--text-tertiary)]">{j.matchPercentage}%</span>
                  )}
                  {!j.aiEvaluated && <span className="text-[10.5px] text-[var(--text-tertiary)]">lower-ranked</span>}
                  {j.jobUrl && (
                    <a href={j.jobUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-tertiary)] hover:text-[var(--accent-400)]">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Feedback given */}
      <Card title={`Feedback given (${detail.counts.feedback})`}>
        {detail.feedback.length === 0 ? (
          <Empty>No feedback yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {detail.feedback.map((f, i) => (
              <li key={i} className="rounded-md border border-[var(--border-muted)]/50 bg-[var(--bg-elevated)]/30 px-3 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[var(--text-secondary)]">
                    {f.title ?? f.jobUrl}
                    {f.company && <span className="ml-2 text-[var(--text-tertiary)]">· {f.company}</span>}
                  </span>
                  <span className="shrink-0 text-[var(--text-tertiary)]">{f.type} · {fmtAgo(f.submittedAt)}</span>
                </div>
                {f.note && <div className="mt-1 text-[11.5px] italic text-[var(--text-tertiary)]">“{f.note}”</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* LLM usage */}
      <Card title="LLM usage (all-time)">
        {detail.usage.length === 0 ? (
          <Empty>No recorded usage.</Empty>
        ) : (
          <div className="space-y-1.5">
            {detail.usage.map((u) => (
              <div key={u.model} className="flex items-center justify-between rounded-md border border-[var(--border-muted)]/50 bg-[var(--bg-elevated)]/30 px-3 py-2 text-[12.5px]">
                <span className="text-[var(--text-secondary)]">{u.model}</span>
                <span className="font-mono text-[11.5px] text-[var(--text-tertiary)]">
                  {fmtNum(u.requests)} req{u.tokens > 0 ? ` · ${fmtNum(u.tokens)} tok` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--border-muted)] px-4 py-5 text-center text-[12.5px] text-[var(--text-tertiary)]">
      {children}
    </p>
  );
}

function Badge({ label, tone }: { label: string; tone?: "success" | "warning" | "danger" }) {
  const color =
    tone === "success"
      ? "text-[var(--success-400)]"
      : tone === "warning"
        ? "text-[var(--warning-400)]"
        : tone === "danger"
          ? "text-[var(--danger-400)]"
          : "text-[var(--text-tertiary)]";
  return (
    <span className={`rounded-full border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-3 py-1 text-[11.5px] ${color}`}>
      {label}
    </span>
  );
}
