"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton({
  tone = "default",
}: {
  tone?: "default" | "onMast";
}) {
  // On the navy masthead the ghost button's dark text vanishes, so render a
  // masthead-toned control there instead of the light-surface ghost variant.
  if (tone === "onMast") {
    return (
      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 text-sm font-medium text-[var(--mast-fg)] outline-none transition-colors hover:border-white/30 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </form>
    );
  }
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </Button>
    </form>
  );
}
