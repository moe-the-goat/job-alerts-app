"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteSearchAction,
  toggleSearchAction,
  upsertSearchAction,
} from "@/app/actions/preferences";
import {
  JOB_BOARDS,
  JOB_TYPES,
  type JobBoard,
  type JobType,
  type PrefState,
} from "./constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SITE_LABELS, type SearchRow } from "./types";

interface SearchCardProps {
  search: SearchRow | null;
  startInEdit?: boolean;
  onClose?: () => void;
}

const DEFAULT_SITES: JobBoard[] = ["linkedin", "indeed"];

export function SearchCard({ search, startInEdit, onClose }: SearchCardProps) {
  const [editing, setEditing] = useState(Boolean(startInEdit));

  if (editing) {
    return (
      <SearchEditor
        search={search}
        onSaved={() => {
          setEditing(false);
          onClose?.();
        }}
        onCancel={() => {
          setEditing(false);
          onClose?.();
        }}
      />
    );
  }

  if (!search) return null;
  return (
    <SearchView
      search={search}
      onEdit={() => setEditing(true)}
    />
  );
}

function SearchView({
  search,
  onEdit,
}: {
  search: SearchRow;
  onEdit: () => void;
}) {
  const sites = (search.sites as string[]).map((s) => SITE_LABELS[s] ?? s);
  const dim = !search.is_active;

  return (
    <article
      className={[
        "group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 transition-all duration-150",
        "hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]/80",
        dim && "opacity-60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-medium text-[var(--text-primary)]">
              {search.search_term}
            </h3>
            {!search.is_active && (
              <span className="shrink-0 rounded-md bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] ring-1 ring-inset ring-[var(--border-muted)]">
                Paused
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-[var(--text-tertiary)]" />
              {search.location}
            </span>
            {search.is_remote && (
              <span className="text-[var(--text-tertiary)]">· Remote</span>
            )}
            {search.job_type && (
              <span className="text-[var(--text-tertiary)]">
                · {jobTypeLabel(search.job_type)}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {sites.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-md bg-[var(--bg-overlay)] px-2 py-0.5 text-[10.5px] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)]"
              >
                {label}
              </span>
            ))}
            <span className="ml-1 text-[10.5px] text-[var(--text-tertiary)]">
              top {search.results_wanted} · last {search.hours_old}h
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <form action={toggleSearchAction}>
            <input type="hidden" name="id" value={search.id} />
            <input
              type="hidden"
              name="next"
              value={(!search.is_active).toString()}
            />
            <button
              type="submit"
              className="rounded-md px-2 py-1.5 text-[11px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {search.is_active ? "Pause" : "Resume"}
            </button>
          </form>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            aria-label="Edit search"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <DeleteButton id={search.id} />
        </div>
      </div>
    </article>
  );
}

function SearchEditor({
  search,
  onSaved,
  onCancel,
}: {
  search: SearchRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, action] = useActionState<PrefState | undefined, FormData>(
    async (prev, fd) => {
      const result = await upsertSearchAction(prev, fd);
      if (result.ok) onSaved();
      return result;
    },
    undefined,
  );

  const initialSites = (search?.sites as JobBoard[] | undefined) ?? DEFAULT_SITES;
  const [sites, setSites] = useState<JobBoard[]>(
    initialSites.filter((s): s is JobBoard => (JOB_BOARDS as readonly string[]).includes(s)),
  );
  const [isRemote, setIsRemote] = useState(search?.is_remote ?? true);
  const [isActive, setIsActive] = useState(search?.is_active ?? true);
  const [jobType, setJobType] = useState<JobType | "">(search?.job_type ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleSite = (site: JobBoard) => {
    setSites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site],
    );
  };

  return (
    <form
      action={action}
      className="rounded-xl border border-[var(--accent-500)]/30 bg-gradient-to-br from-[var(--accent-500)]/[0.04] to-transparent p-5 space-y-5 ring-1 ring-[var(--accent-500)]/15"
    >
      {search?.id && <input type="hidden" name="id" value={search.id} />}
      <input type="hidden" name="sites" value={sites.join(",")} />
      <input type="hidden" name="job_type" value={jobType} />
      <input
        type="hidden"
        name="is_remote"
        value={isRemote ? "true" : "false"}
      />
      <input
        type="hidden"
        name="is_active"
        value={isActive ? "true" : "false"}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          name="search_term"
          label="Search term"
          defaultValue={search?.search_term ?? ""}
          placeholder="Senior Software Engineer"
          required
          autoFocus
        />
        <Input
          name="location"
          label="Location"
          defaultValue={search?.location ?? "Worldwide"}
          placeholder="Worldwide"
        />
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
          Job boards
        </div>
        <div className="flex flex-wrap gap-1.5">
          {JOB_BOARDS.map((site) => (
            <SiteChip
              key={site}
              site={site}
              selected={sites.includes(site)}
              onToggle={() => toggleSite(site)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">
            Job type
          </div>
          <div className="flex flex-wrap gap-1.5">
            <TypeChip
              label="Any"
              selected={jobType === ""}
              onClick={() => setJobType("")}
            />
            {JOB_TYPES.map((t) => (
              <TypeChip
                key={t}
                label={jobTypeLabel(t)}
                selected={jobType === t}
                onClick={() => setJobType(t)}
              />
            ))}
          </div>
        </div>
        <Switch
          checked={isRemote}
          onCheckedChange={setIsRemote}
          label="Remote-eligible"
          description="Include roles tagged as remote on the source board."
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ChevronDown
            className={[
              "h-3 w-3 transition-transform",
              showAdvanced && "rotate-180",
            ].join(" ")}
          />
          Advanced
        </button>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg bg-[var(--bg-overlay)]/40 p-4 sm:grid-cols-3">
            <Input
              name="results_wanted"
              type="number"
              min={1}
              max={100}
              label="Results wanted"
              defaultValue={search?.results_wanted ?? 30}
              hint="Per board, 1–100"
            />
            <Input
              name="hours_old"
              type="number"
              min={1}
              max={720}
              label="Hours old"
              defaultValue={search?.hours_old ?? 24}
              hint="Recency window"
            />
            <Input
              name="country_indeed"
              label="Indeed country"
              defaultValue={search?.country_indeed ?? "USA"}
              hint="Used only when Indeed is enabled"
            />
          </div>
        )}
      </div>

      <Switch
        checked={isActive}
        onCheckedChange={setIsActive}
        label={isActive ? "Active" : "Paused"}
        description="Paused searches stay saved but skip the next run."
      />

      {state?.error && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--danger-400)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state.error}</span>
        </p>
      )}
      {state?.ok && state.message && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--success-400)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state.message}</span>
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
        <Button type="button" variant="ghost" size="md" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <SaveSearchButton isNew={!search?.id} />
      </div>
    </form>
  );
}

function SaveSearchButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="md">
      {!pending && <Save className="h-3.5 w-3.5" />}
      {pending ? "Saving…" : isNew ? "Add search" : "Save changes"}
    </Button>
  );
}

function DeleteButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <form action={deleteSearchAction} className="inline-flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-2 py-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-[var(--danger-400)]/15 px-2 py-1 text-[11px] font-medium text-[var(--danger-400)] hover:bg-[var(--danger-400)]/25 outline-none focus-visible:ring-2 focus-visible:ring-[rgba(248,113,113,0.45)]"
        >
          Delete
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--danger-400)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      aria-label="Delete search"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function SiteChip({
  site,
  selected,
  onToggle,
}: {
  site: JobBoard;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={[
        "rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        selected
          ? "bg-[var(--accent-500)]/15 text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-500)]/40"
          : "bg-[var(--bg-overlay)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)] hover:text-[var(--text-primary)] hover:ring-[var(--border-strong)]",
      ].join(" ")}
    >
      {SITE_LABELS[site]}
    </button>
  );
}

function TypeChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "rounded-md px-2.5 py-1.5 text-[12px] transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        selected
          ? "bg-[var(--accent-500)]/15 text-[var(--accent-300)] ring-1 ring-inset ring-[var(--accent-500)]/40"
          : "bg-[var(--bg-overlay)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-muted)] hover:text-[var(--text-primary)] hover:ring-[var(--border-strong)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function jobTypeLabel(t: JobType): string {
  if (t === "fulltime") return "Full-time";
  if (t === "parttime") return "Part-time";
  if (t === "internship") return "Internship";
  if (t === "contract") return "Contract";
  return t;
}
