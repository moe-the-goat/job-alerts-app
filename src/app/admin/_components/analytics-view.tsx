import type { AdminAnalytics } from "../_lib/analytics";

/** Read-only analytics dashboard. Pure presentation — data comes from the
 *  ADMIN_USER_ID-gated page via loadAdminAnalytics(). */

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "danger" | "success" }) {
  const color =
    tone === "danger"
      ? "text-[var(--danger-400)]"
      : tone === "success"
        ? "text-[var(--success-400)]"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3">
      <div className={`text-[22px] font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AnalyticsView({ data }: { data: AdminAnalytics }) {
  const { users, runs, feedback } = data;

  return (
    <div>
      <p className="text-[13px] text-[var(--text-tertiary)]">
        Read-only insights across the whole system. Generated {fmtTime(data.generatedAt)}.
      </p>

      <Card title="Users & signups">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total users" value={users.total} />
          <Stat label="Whitelisted" value={users.whitelisted} tone="success" />
          <Stat label="Onboarded" value={users.onboarded} />
          <Stat label="Stuck (no CV/search)" value={users.stuck} tone={users.stuck > 0 ? "danger" : undefined} />
          <Stat label="Pending requests" value={users.pendingRequests} />
          <Stat label="Rejected" value={users.rejectedRequests} />
        </div>
        {users.recentSignups.length > 0 && (
          <ul className="mt-3 space-y-1">
            {users.recentSignups.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-1 py-1 text-[12.5px]">
                <span className="min-w-0 truncate text-[var(--text-secondary)]">
                  {s.name} · {s.email}
                </span>
                <span className="shrink-0 text-[var(--text-tertiary)]">
                  {s.status} · {fmtTime(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Runs today">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Runs today" value={runs.today.total} />
          <Stat label="Success" value={runs.today.success} tone="success" />
          <Stat label="Failed" value={runs.today.failed} tone={runs.today.failed > 0 ? "danger" : undefined} />
          <Stat label="Running" value={runs.today.running} />
          <Stat label="Jobs approved today" value={runs.jobsApprovedToday} />
          <Stat label="Scraped today" value={runs.scrapedToday} />
        </div>
        {runs.perUserLatest.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[var(--text-tertiary)]">
                  <th className="py-1.5 pr-3 font-medium">User</th>
                  <th className="py-1.5 pr-3 font-medium">Last run</th>
                  <th className="py-1.5 pr-3 font-medium">When</th>
                  <th className="py-1.5 pr-3 font-medium">Approved</th>
                </tr>
              </thead>
              <tbody>
                {runs.perUserLatest.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--border-muted)]/40">
                    <td className="min-w-0 max-w-[220px] truncate py-1.5 pr-3 text-[var(--text-secondary)]">
                      {r.email}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={
                          r.status === "success"
                            ? "text-[var(--success-400)]"
                            : r.status === "failed"
                              ? "text-[var(--danger-400)]"
                              : "text-[var(--text-tertiary)]"
                        }
                      >
                        {r.status}
                      </span>
                      {r.error && (
                        <span className="ml-2 text-[11px] text-[var(--danger-400)]/80">
                          {r.error.slice(0, 60)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-[var(--text-tertiary)]">{fmtTime(r.startedAt)}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-[var(--text-secondary)]">{r.approved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Feedback">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total reactions" value={feedback.total} />
          <Stat label="Today" value={feedback.today} />
          <Stat label="Applied" value={feedback.byType["applied"] ?? 0} tone="success" />
          <Stat label="Blocked companies" value={feedback.byType["block_company"] ?? 0} />
        </div>
        {Object.keys(feedback.byType).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(feedback.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <span
                  key={type}
                  className="rounded-full border border-[var(--border-muted)] bg-[var(--bg-overlay)] px-3 py-1 text-[11.5px] text-[var(--text-secondary)]"
                >
                  {type} · <span className="tabular-nums">{count}</span>
                </span>
              ))}
          </div>
        )}
        {feedback.topBlockedCompanies.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Most-blocked companies
            </div>
            <ul className="space-y-1">
              {feedback.topBlockedCompanies.map((c, i) => (
                <li key={i} className="flex items-center justify-between px-1 text-[12.5px]">
                  <span className="min-w-0 truncate text-[var(--text-secondary)]">{c.company}</span>
                  <span className="tabular-nums text-[var(--text-tertiary)]">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
