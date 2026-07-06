import { CommandPalette } from "@/components/workspace/command-palette";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { requireReady } from "../_lib/dashboard-state";
import { Sidebar } from "./_components/sidebar";
import { StatsStrip } from "./_components/stats-strip";
import { WorkspaceTabs } from "./_components/workspace-tabs";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate the entire (workspace) segment behind onboarding completion.
  // Visiting /dashboard/feedback before CV+preferences are set bounces
  // back to /dashboard, which renders the onboarding strip.
  const state = await requireReady();

  return (
    <WorkspaceProvider>
      <div className="animate-fade-in space-y-5">
        <StatsStrip
          lastRun={state.lastRun}
          nextRunAt={state.nextRunAt}
          pendingDispatchAt={state.pendingDispatchAt}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            <WorkspaceTabs />
            <div className="pt-6">{children}</div>
          </div>

          <Sidebar state={state} />
        </div>
      </div>
      <CommandPalette />
    </WorkspaceProvider>
  );
}
