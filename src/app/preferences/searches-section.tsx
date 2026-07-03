"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Search as SearchIcon } from "lucide-react";
import { regenerateSearchesFromPathsAction } from "@/app/actions/preferences";
import { SectionHeading } from "./section-heading";
import { SearchCard } from "./search-card";
import type { SearchRow } from "./types";

interface SearchesSectionProps {
  initialSearches: SearchRow[];
}

export function SearchesSection({ initialSearches }: SearchesSectionProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [regenMsg, setRegenMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasNone = initialSearches.length === 0;

  function regenerate() {
    setRegenMsg(null);
    startTransition(async () => {
      const res = await regenerateSearchesFromPathsAction();
      setRegenMsg({
        ok: res.ok,
        text: res.ok ? (res.message ?? "Done.") : (res.error ?? "Couldn't regenerate."),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
      <SectionHeading
        step="3"
        title="Searches"
        subtitle="Each search is one query we send to the job boards. We seed a starter set from your paths — add, edit, or delete any of them."
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
          Regenerate rebuilds the path-suggested searches and keeps the ones you
          added yourself.
        </p>
        <button
          type="button"
          onClick={regenerate}
          disabled={isPending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-muted)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Regenerate from paths
        </button>
      </div>
      {regenMsg && (
        <p
          className={`mb-3 text-xs ${regenMsg.ok ? "text-[var(--success-400)]" : "text-[var(--danger-400)]"}`}
        >
          {regenMsg.text}
        </p>
      )}

      {hasNone && !adding && (
        <EmptyState onAdd={() => setAdding(true)} />
      )}

      {(initialSearches.length > 0 || adding) && (
        <div className="space-y-3">
          {adding && (
            <SearchCard
              key="new"
              search={null}
              startInEdit
              onClose={() => setAdding(false)}
            />
          )}
          {initialSearches.map((s) => (
            <SearchCard key={s.id} search={s} />
          ))}

          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-4 py-4 text-sm text-[var(--text-secondary)] transition-all duration-150 hover:border-[var(--accent-500)]/50 hover:bg-[var(--accent-500)]/5 hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <Plus className="h-4 w-4" />
              Add a search
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-muted)] bg-[var(--bg-elevated)]/30 px-6 py-10 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
        <SearchIcon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
        No searches yet
      </h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
        Add at least one search and we&apos;ll start scoring jobs against your CV
        on the next run.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--accent-500)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Plus className="h-4 w-4" />
        Add your first search
      </button>
    </div>
  );
}
