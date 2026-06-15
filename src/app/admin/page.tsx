import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DecisionButtons } from "./decision-buttons";
import { loadAdminAnalytics } from "./_lib/analytics";
import { AnalyticsView } from "./_components/analytics-view";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Always fresh — pending requests + analytics change out of band.
export const dynamic = "force-dynamic";

interface RequestRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Gate: only the configured admin user. Anyone else is bounced to /dashboard
  // (or /login if not signed in) — the page never reveals it exists.
  const adminUserId = process.env.ADMIN_USER_ID;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!adminUserId || user.id !== adminUserId) redirect("/dashboard");

  const tab = (await searchParams).tab === "analytics" ? "analytics" : "requests";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        Admin
      </h1>

      <nav className="mt-4 flex gap-1 border-b border-[var(--border-muted)]">
        <TabLink href="/admin" active={tab === "requests"} label="Access requests" />
        <TabLink href="/admin?tab=analytics" active={tab === "analytics"} label="Analytics" />
      </nav>

      <div className="mt-6">
        {tab === "analytics" ? (
          <AnalyticsView data={await loadAdminAnalytics()} />
        ) : (
          <RequestsTab />
        )}
      </div>
    </div>
  );
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "border-[var(--accent-500)] text-[var(--text-primary)]"
          : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {label}
    </Link>
  );
}

async function RequestsTab() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("access_requests")
    .select("id, email, first_name, last_name, status, note, created_at")
    .order("created_at", { ascending: false })
    .returns<RequestRow[]>();

  const requests = data ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div>
      <p className="text-[13px] text-[var(--text-tertiary)]">
        Closed beta. Approving sends an invite link; rejecting sends a decline
        email. No passwords are ever shown here.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border-muted)] px-4 py-6 text-center text-[13px] text-[var(--text-tertiary)]">
            No pending requests.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-[var(--text-primary)]">
                    {r.first_name} {r.last_name}
                  </div>
                  <div className="truncate text-[12px] text-[var(--text-secondary)]">
                    {r.email}
                  </div>
                  {r.note && (
                    <div className="mt-1 text-[11.5px] italic text-[var(--text-tertiary)]">
                      “{r.note}”
                    </div>
                  )}
                </div>
                <DecisionButtons id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            Decided ({decided.length})
          </h2>
          <ul className="space-y-1">
            {decided.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-1 py-1.5 text-[12.5px]"
              >
                <span className="min-w-0 truncate text-[var(--text-secondary)]">
                  {r.first_name} {r.last_name} · {r.email}
                </span>
                <span
                  className={
                    r.status === "approved"
                      ? "text-[var(--success-400)]"
                      : "text-[var(--danger-400)]"
                  }
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
