"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import type { UserDirectoryEntry } from "../_lib/analytics";
import { Card, fmtAgo } from "./ui";

/**
 * The full account roster — every user, not just those with a run today — as a
 * searchable directory into the per-user drill-downs. A live filter box matches
 * email; status chips let you narrow to the accounts that need attention
 * (paused, not whitelisted, not onboarded) without leaving the page.
 */
type Filter = "all" | "active" | "paused" | "not_whitelisted" | "not_onboarded";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "not_whitelisted", label: "Not whitelisted" },
  { key: "not_onboarded", label: "Not onboarded" },
];

function matches(u: UserDirectoryEntry, filter: Filter): boolean {
  switch (filter) {
    case "active":
      return u.isActive;
    case "paused":
      return !u.isActive;
    case "not_whitelisted":
      return !u.isWhitelisted;
    case "not_onboarded":
      return !u.onboarded;
    default:
      return true;
  }
}

export function UserDirectory({ users }: { users: UserDirectoryEntry[] }) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter(
      (u) => matches(u, filter) && (!needle || u.email.toLowerCase().includes(needle)),
    );
  }, [users, q, filter]);

  return (
    <Card title={`All users (${users.length})`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email…"
            className="w-full rounded-md border border-[var(--border-muted)] bg-[var(--bg-elevated)]/40 py-1.5 pl-8 pr-3 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-md border border-[var(--border-muted)] p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded px-2.5 py-1 text-[11.5px] transition-colors ${
                filter === f.key
                  ? "bg-[var(--accent-500)] text-white"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-muted)] px-4 py-6 text-center text-[13px] text-[var(--text-tertiary)]">
          No users match.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-muted)]/40">
          {shown.map((u) => (
            <li key={u.userId}>
              <Link
                href={`/admin/users/${u.userId}`}
                className="group flex items-center justify-between gap-3 px-1 py-2 outline-none hover:bg-[var(--bg-overlay)]/40 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-[12.5px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                    {u.email}
                  </span>
                  {!u.isActive && <Dot label="paused" tone="warning" />}
                  {!u.isWhitelisted && <Dot label="not whitelisted" tone="danger" />}
                  {!u.onboarded && <Dot label="no CV/search" tone="warning" />}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-[var(--text-tertiary)]">
                  {u.lastRunAt ? (
                    <span className={u.lastRunStatus === "failed" ? "text-[var(--danger-400)]/90" : ""}>
                      {u.lastRunStatus ?? "ran"} · {fmtAgo(u.lastRunAt)}
                    </span>
                  ) : (
                    <span className="text-[var(--danger-400)]/80">never run</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Dot({ label, tone }: { label: string; tone: "warning" | "danger" }) {
  const color = tone === "danger" ? "var(--danger-400)" : "var(--warning-400)";
  return (
    <span
      title={label}
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}
