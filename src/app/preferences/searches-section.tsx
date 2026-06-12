"use client";

import { useState } from "react";
import { Plus, Search as SearchIcon } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { SearchCard } from "./search-card";
import type { SearchRow } from "./types";

interface SearchesSectionProps {
  initialSearches: SearchRow[];
}

export function SearchesSection({ initialSearches }: SearchesSectionProps) {
  const [adding, setAdding] = useState(false);
  const hasNone = initialSearches.length === 0;

  return (
    <section className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
      <SectionHeading
        step="2"
        title="Searches"
        subtitle="Each search is one query we send to the job boards. Add as many as you like."
      />

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
