"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Shield, ShieldOff, Zap } from "lucide-react";
import {
  setUserActiveAction,
  setUserWhitelistAction,
  adminTriggerRunAction,
} from "../actions";

/**
 * Per-user admin action buttons for the analytics run table. Each calls a
 * requireAdmin-gated server action; destructive-ish ones confirm first. On
 * success we refresh so the row reflects the new state.
 */
export function UserActions({
  userId,
  email,
  isActive,
  isWhitelisted,
}: {
  userId: string;
  email: string;
  isActive: boolean;
  isWhitelisted: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function run(
    key: string,
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fields: Record<string, string>,
    confirmMsg?: string,
  ) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError(null);
    setPending(key);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    void action(fd)
      .then((res) => {
        if (res.ok) router.refresh();
        else setError(res.error ?? "Action failed.");
      })
      .finally(() => setPending(null));
  }

  const btn =
    "inline-flex items-center gap-1 rounded-md border border-[var(--border-muted)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Pause / resume */}
      <button
        type="button"
        disabled={pending !== null}
        className={btn}
        onClick={() =>
          run(
            "active",
            setUserActiveAction,
            { user_id: userId, active: String(!isActive) },
            isActive ? `Pause runs for ${email}?` : undefined,
          )
        }
      >
        {pending === "active" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isActive ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        {isActive ? "Pause" : "Resume"}
      </button>

      {/* Whitelist toggle */}
      <button
        type="button"
        disabled={pending !== null}
        className={btn}
        onClick={() =>
          run(
            "wl",
            setUserWhitelistAction,
            { user_id: userId, whitelisted: String(!isWhitelisted) },
            isWhitelisted ? `Revoke beta access for ${email}?` : undefined,
          )
        }
      >
        {pending === "wl" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isWhitelisted ? (
          <ShieldOff className="h-3 w-3" />
        ) : (
          <Shield className="h-3 w-3" />
        )}
        {isWhitelisted ? "Unwhitelist" : "Whitelist"}
      </button>

      {/* Trigger a run */}
      <button
        type="button"
        disabled={pending !== null}
        className={btn}
        onClick={() =>
          run(
            "run",
            adminTriggerRunAction,
            { user_id: userId },
            `Trigger a run now for ${email}?`,
          )
        }
      >
        {pending === "run" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Zap className="h-3 w-3" />
        )}
        Run
      </button>

      {error && <span className="text-[11px] text-[var(--danger-400)]">{error}</span>}
    </div>
  );
}
