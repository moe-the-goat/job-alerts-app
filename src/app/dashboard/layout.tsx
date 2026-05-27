import { loadDashboardState } from "./_lib/dashboard-state";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Centralized auth check via the cached loader — sub-routes inherit
  // this without re-querying Supabase.
  const state = await loadDashboardState();
  return <AppShell email={state.user.email}>{children}</AppShell>;
}
