import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { loadDashboardState } from "./_lib/dashboard-state";
import { OnboardingStrip } from "./_components/onboarding-strip";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardIndex() {
  const state = await loadDashboardState();
  if (state.ready) redirect("/dashboard/feedback");
  return <OnboardingStrip state={state} />;
}
