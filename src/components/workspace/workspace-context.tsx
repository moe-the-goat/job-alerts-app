"use client";

import * as React from "react";
import type { FeedbackType } from "@/app/dashboard/(workspace)/feedback/_lib/types";

/** What the command palette needs to know about one job row. */
export interface PaletteJob {
  id: number;
  title: string | null;
  company: string | null;
}

/**
 * The results grid registers this adapter while mounted so the command
 * palette can focus rows and fire feedback actions on the focused row.
 */
export interface JobGridAdapter {
  jobs: PaletteJob[];
  focusedJobId: number | null;
  focusJob: (id: number) => void;
  /** Fires a feedback action on the focused row (no-op if none focused). */
  actOnFocused: (type: FeedbackType) => void;
}

interface WorkspaceContextValue {
  gridAdapter: JobGridAdapter | null;
  registerGridAdapter: (adapter: JobGridAdapter | null) => void;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(
  null,
);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [gridAdapter, setGridAdapter] = React.useState<JobGridAdapter | null>(
    null,
  );
  const registerGridAdapter = React.useCallback(
    (adapter: JobGridAdapter | null) => setGridAdapter(adapter),
    [],
  );
  const value = React.useMemo(
    () => ({ gridAdapter, registerGridAdapter }),
    [gridAdapter, registerGridAdapter],
  );
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>.");
  }
  return ctx;
}

/** True when the event target is a place where single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
