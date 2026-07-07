"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Check,
  Briefcase,
  EyeOff,
  LayoutList,
  Search,
  Settings2,
  Shield,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { isTypingTarget, useWorkspace } from "./workspace-context";

interface Command {
  id: string;
  group: "Navigation" | "Job actions" | "Jump to job";
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  kbd?: { keys: string[]; join?: "then" | "+" };
  run: () => void;
}

/**
 * Subsequence fuzzy match. Returns a score (lower = better) or null when
 * the query doesn't match. Substring hits beat scattered-letter hits.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return direct; // substring: rank by how early it starts
  let ti = 0;
  let spread = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    spread += found - ti;
    ti = found + 1;
  }
  return 100 + spread; // scattered match ranks below any substring match
}

const NAV_TIMEOUT_MS = 1200;

export function CommandPalette() {
  const router = useRouter();
  const { gridAdapter } = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingG = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const gArmed = React.useRef(false);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  // Global shortcuts: Cmd/Ctrl+K toggles; G-then-R/T/P navigates.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (open || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      const key = e.key.toLowerCase();
      if (gArmed.current) {
        gArmed.current = false;
        if (pendingG.current) clearTimeout(pendingG.current);
        const target = { r: "/dashboard/feedback", t: "/dashboard/tracker", p: "/preferences" }[key];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        return;
      }
      if (key === "g") {
        gArmed.current = true;
        pendingG.current = setTimeout(() => {
          gArmed.current = false;
        }, NAV_TIMEOUT_MS);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = React.useMemo<Command[]>(() => {
    const nav: Command[] = [
      {
        id: "nav-results",
        group: "Navigation",
        label: "Go to Results",
        icon: LayoutList,
        kbd: { keys: ["G", "R"], join: "then" },
        run: () => router.push("/dashboard/feedback"),
      },
      {
        id: "nav-tracker",
        group: "Navigation",
        label: "Go to Tracker",
        icon: SquareKanban,
        kbd: { keys: ["G", "T"], join: "then" },
        run: () => router.push("/dashboard/tracker"),
      },
      {
        id: "nav-preferences",
        group: "Navigation",
        label: "Go to Preferences",
        icon: Settings2,
        kbd: { keys: ["G", "P"], join: "then" },
        run: () => router.push("/preferences"),
      },
    ];

    const focused =
      gridAdapter &&
      gridAdapter.jobs.find((j) => j.id === gridAdapter.focusedJobId);

    const actions: Command[] = focused
      ? [
          {
            id: "act-applied",
            group: "Job actions",
            label: "Mark Applied",
            sublabel: focused.title ?? undefined,
            icon: Check,
            kbd: { keys: ["A"] },
            run: () => gridAdapter.actOnFocused("applied"),
          },
          {
            id: "act-bookmark",
            group: "Job actions",
            label: "Bookmark",
            sublabel: focused.title ?? undefined,
            icon: Bookmark,
            run: () => gridAdapter.actOnFocused("bookmarked"),
          },
          {
            id: "act-not-relevant",
            group: "Job actions",
            label: "Not for me",
            sublabel: focused.title ?? undefined,
            icon: EyeOff,
            run: () => gridAdapter.actOnFocused("not_relevant"),
          },
          {
            id: "act-block",
            group: "Job actions",
            label: "Block company",
            sublabel: focused.company ?? undefined,
            icon: Shield,
            kbd: { keys: ["B"] },
            run: () => gridAdapter.actOnFocused("block_company"),
          },
        ]
      : [];

    const jumps: Command[] = (gridAdapter?.jobs ?? []).map((job) => ({
      id: `jump-${job.id}`,
      group: "Jump to job" as const,
      label: job.title ?? "Untitled role",
      sublabel: job.company ?? undefined,
      icon: Briefcase,
      run: () => gridAdapter?.focusJob(job.id),
    }));

    return [...nav, ...actions, ...jumps];
  }, [gridAdapter, router]);

  const visible = React.useMemo(() => {
    const scored = commands
      .map((cmd) => ({
        cmd,
        score: fuzzyScore(query, `${cmd.label} ${cmd.sublabel ?? ""}`),
      }))
      .filter((row): row is { cmd: Command; score: number } => row.score !== null)
      .sort((a, b) => a.score - b.score);
    // With no query, jump-to-job entries would swamp the list — cap them.
    const list = scored.map((s) => s.cmd);
    if (query.trim() === "") {
      const jumps = list.filter((c) => c.group === "Jump to job").slice(0, 5);
      return [...list.filter((c) => c.group !== "Jump to job"), ...jumps];
    }
    return list;
  }, [commands, query]);

  function onQueryChange(next: string) {
    setQuery(next);
    setActiveIndex(0); // a new query invalidates the old highlight position
  }

  function runCommand(cmd: Command | undefined) {
    if (!cmd) return;
    close();
    cmd.run();
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        runCommand(visible[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 px-4 pt-[14vh] backdrop-blur-[2px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      data-testid="command-palette"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={cn(
          "row-detail-enter w-full max-w-xl overflow-hidden rounded-xl",
          "bg-[var(--bg-overlay)]/92 backdrop-blur-xl",
          "ring-1 ring-inset ring-[var(--border-muted)]",
          "shadow-[var(--shadow-overlay)]",
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Type a command or search your jobs…"
            aria-label="Search commands"
            className="h-12 w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <Kbd keys={["Esc"]} />
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-1.5" role="listbox">
          {visible.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-[var(--text-tertiary)]">
              Nothing matches “{query}”.
            </p>
          )}
          {visible.map((cmd, i) => {
            const Icon = cmd.icon;
            // Group header renders on the first item of each group run —
            // derived from the previous element, no render-time mutation.
            const header =
              i === 0 || visible[i - 1].group !== cmd.group ? cmd.group : null;
            return (
              <React.Fragment key={cmd.id}>
                {header && (
                  <p className="px-3 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    {header}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => runCommand(cmd)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] outline-none transition-colors duration-150",
                    i === activeIndex
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {cmd.label}
                    {cmd.sublabel && (
                      <span className="ml-2 text-[11px] text-[var(--text-tertiary)]">
                        {cmd.sublabel}
                      </span>
                    )}
                  </span>
                  {cmd.kbd && <Kbd keys={cmd.kbd.keys} join={cmd.kbd.join} />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
