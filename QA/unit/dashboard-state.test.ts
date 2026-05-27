/**
 * Locks the aggregation + redirect contract of the dashboard state
 * loader. Specifically: `ready` is the AND of (hasCv, hasPrefs,
 * activeSearches > 0, isActive) — losing any one of those silently
 * would unlock the workspace for a user whose pipeline can't run.
 *
 * Each test re-imports the module to defeat React.cache memoization
 * (the loader is wrapped in `cache()` for per-request dedup, which
 * would otherwise leak between tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

interface Scenario {
  user?: { id: string; email: string } | null;
  profile?: { cv_text: string | null; cv_uploaded_at: string | null } | null;
  prefs?: {
    notification_email: string;
    frequency_hours: number;
    is_active: boolean;
    next_run_at: string | null;
  } | null;
  searches?: number;
  lastRun?: object | null;
}

function wireSupabase(s: Scenario) {
  getUserMock.mockResolvedValue({ data: { user: s.user ?? null } });
  fromMock.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: s.profile ?? null, error: null }),
          }),
        }),
      };
    }
    if (table === "preferences") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: s.prefs ?? null, error: null }),
          }),
        }),
      };
    }
    if (table === "search_queries") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ count: s.searches ?? 0, error: null }),
          }),
        }),
      };
    }
    if (table === "runs") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: s.lastRun ?? null, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

async function freshLoader() {
  vi.resetModules();
  return await import("@/app/dashboard/_lib/dashboard-state");
}

beforeEach(() => {
  redirectMock.mockClear();
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("loadDashboardState", () => {
  it("redirects to /login when no session", async () => {
    wireSupabase({ user: null });
    const { loadDashboardState } = await freshLoader();
    await expect(loadDashboardState()).rejects.toThrow("REDIRECT:/login");
  });

  it("marks ready=true only when CV + prefs + active searches + is_active all hold", async () => {
    wireSupabase({
      user: { id: "u1", email: "a@b.co" },
      profile: { cv_text: "a".repeat(500), cv_uploaded_at: "2026-05-27T10:00:00Z" },
      prefs: {
        notification_email: "a@b.co",
        frequency_hours: 24,
        is_active: true,
        next_run_at: null,
      },
      searches: 2,
      lastRun: null,
    });

    const { loadDashboardState } = await freshLoader();
    const state = await loadDashboardState();
    expect(state.ready).toBe(true);
    expect(state.hasCv).toBe(true);
    expect(state.hasPrefs).toBe(true);
    expect(state.isActive).toBe(true);
    expect(state.activeSearches).toBe(2);
    expect(state.cvChars).toBe(500);
  });

  it("ready=false when CV is missing", async () => {
    wireSupabase({
      user: { id: "u1", email: "a@b.co" },
      profile: { cv_text: null, cv_uploaded_at: null },
      prefs: {
        notification_email: "a@b.co",
        frequency_hours: 24,
        is_active: true,
        next_run_at: null,
      },
      searches: 2,
    });

    const { loadDashboardState } = await freshLoader();
    const state = await loadDashboardState();
    expect(state.ready).toBe(false);
    expect(state.hasCv).toBe(false);
  });

  it("ready=false when preferences row is missing", async () => {
    wireSupabase({
      user: { id: "u1", email: "a@b.co" },
      profile: { cv_text: "a".repeat(500), cv_uploaded_at: null },
      prefs: null,
      searches: 2,
    });

    const { loadDashboardState } = await freshLoader();
    const state = await loadDashboardState();
    expect(state.ready).toBe(false);
    expect(state.hasPrefs).toBe(false);
  });

  it("ready=false when there are no active searches", async () => {
    wireSupabase({
      user: { id: "u1", email: "a@b.co" },
      profile: { cv_text: "a".repeat(500), cv_uploaded_at: null },
      prefs: {
        notification_email: "a@b.co",
        frequency_hours: 24,
        is_active: true,
        next_run_at: null,
      },
      searches: 0,
    });

    const { loadDashboardState } = await freshLoader();
    const state = await loadDashboardState();
    expect(state.ready).toBe(false);
    expect(state.activeSearches).toBe(0);
  });

  it("ready=false when the pipeline is paused", async () => {
    wireSupabase({
      user: { id: "u1", email: "a@b.co" },
      profile: { cv_text: "a".repeat(500), cv_uploaded_at: null },
      prefs: {
        notification_email: "a@b.co",
        frequency_hours: 24,
        is_active: false,
        next_run_at: null,
      },
      searches: 2,
    });

    const { loadDashboardState } = await freshLoader();
    const state = await loadDashboardState();
    expect(state.ready).toBe(false);
    expect(state.isActive).toBe(false);
  });
});

describe("requireReady", () => {
  it("redirects to /dashboard when not ready", async () => {
    wireSupabase({
      user: { id: "u1", email: "a@b.co" },
      profile: { cv_text: null, cv_uploaded_at: null },
      prefs: null,
      searches: 0,
    });

    const { requireReady } = await freshLoader();
    await expect(requireReady()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("returns the state when ready", async () => {
    wireSupabase({
      user: { id: "u1", email: "a@b.co" },
      profile: { cv_text: "a".repeat(500), cv_uploaded_at: null },
      prefs: {
        notification_email: "a@b.co",
        frequency_hours: 24,
        is_active: true,
        next_run_at: null,
      },
      searches: 2,
    });

    const { requireReady } = await freshLoader();
    const state = await requireReady();
    expect(state.ready).toBe(true);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
