"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The end-of-setup action. Each preferences section saves on its own, so this
 * is the deliberate "I'm done here" step that takes the user to their
 * dashboard once the essentials are set.
 */
export function FinishBar() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <CheckCircle2 className="h-4 w-4 text-[var(--success-400)]" />
        All set — you can change any of this any time.
      </p>
      <Button
        type="button"
        size="lg"
        onClick={() => router.push("/dashboard")}
      >
        Go to dashboard
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
