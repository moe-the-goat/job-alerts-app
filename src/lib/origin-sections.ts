/**
 * Shared local/global sectioning for job lists. Used by the dashboard
 * results grid (client) and the tokenized email feedback page (server) —
 * a plain pure module so it can cross the server/client boundary freely.
 */
export interface OriginSection<T> {
  label: string;
  icon: "globe" | "pin" | null;
  jobs: T[];
}

/**
 * Splits results by worker-persisted origin. Until the worker writes the
 * `origin` column (task W1), rows have no origin and land in one section.
 */
export function groupByOrigin<T extends { origin?: "global" | "local" | null }>(
  jobs: T[],
): OriginSection<T>[] {
  const local = jobs.filter((j) => j.origin === "local");
  const global = jobs.filter((j) => j.origin === "global");
  const untagged = jobs.filter((j) => j.origin == null);
  if (local.length === 0 && global.length === 0) {
    return [{ label: "This run's picks", icon: null, jobs: untagged }];
  }
  const sections = [
    { label: "Local (Palestinian)", icon: "pin" as const, jobs: local },
    {
      label: "Global / Remote",
      icon: "globe" as const,
      jobs: [...global, ...untagged],
    },
  ];
  return sections.filter((s) => s.jobs.length > 0);
}
