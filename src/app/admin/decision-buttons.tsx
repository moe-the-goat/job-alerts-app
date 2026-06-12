"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { approveRequestAction, rejectRequestAction } from "./actions";

/** Approve / Reject buttons for one pending request row on /admin. */
export function DecisionButtons({ id }: { id: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(kind: "approve" | "reject") {
    if (
      kind === "reject" &&
      !window.confirm("Reject this request? They'll get a decline email.")
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      const action = kind === "approve" ? approveRequestAction : rejectRequestAction;
      const res = await action(undefined, fd);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-[11px] text-[var(--danger-400)]">{error}</span>
      )}
      <button
        type="button"
        onClick={() => run("reject")}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-overlay)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--danger-400)] ring-1 ring-inset ring-[var(--border-muted)] transition-colors hover:ring-[var(--danger-400)]/40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </button>
      <button
        type="button"
        onClick={() => run("approve")}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-500)] px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[var(--accent-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        Approve
      </button>
    </div>
  );
}
