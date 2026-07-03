/**
 * Locks the validation + auth + RLS contract of the Preferences and
 * Search server actions: email format, frequency allowlist, site
 * sanitization, clamping, session check, scoped UPDATE/DELETE by
 * user_id (defense in depth on top of Supabase RLS).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const upsertMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const eqMock1 = vi.fn();
const eqMock2 = vi.fn();
const fromMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

import {
  deleteSearchAction,
  savePathsAction,
  savePreferenceNoteAction,
  savePreferencesAction,
  toggleSearchAction,
  upsertSearchAction,
} from "@/app/actions/preferences";

beforeEach(() => {
  getUserMock.mockReset();
  upsertMock.mockReset();
  insertMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  eqMock1.mockReset();
  eqMock2.mockReset();
  fromMock.mockReset();
});

function wireAuthed(userId = "user-abc") {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } } });
}

function wireUpsertOk() {
  upsertMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ upsert: upsertMock });
}

describe("savePreferencesAction", () => {
  it("rejects invalid email", async () => {
    wireAuthed();
    const fd = new FormData();
    fd.append("notification_email", "not-an-email");
    fd.append("frequency_hours", "24");
    fd.append("is_active", "true");
    const res = await savePreferencesAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/email/i);
  });

  it("rejects out-of-allowlist frequency", async () => {
    wireAuthed();
    const fd = new FormData();
    fd.append("notification_email", "a@b.co");
    fd.append("frequency_hours", "12");
    fd.append("is_active", "true");
    const res = await savePreferencesAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/frequency/i);
  });

  it("rejects when session is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const fd = new FormData();
    fd.append("notification_email", "a@b.co");
    fd.append("frequency_hours", "24");
    fd.append("is_active", "true");
    const res = await savePreferencesAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/session/i);
  });

  it("upserts on (user_id) with lowercased email + bool active", async () => {
    wireAuthed("user-abc");
    wireUpsertOk();
    const fd = new FormData();
    fd.append("notification_email", "  Me@Example.com  ");
    fd.append("frequency_hours", "48");
    fd.append("is_active", "on");

    const res = await savePreferencesAction(undefined, fd);

    expect(res.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("preferences");
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toEqual({
      user_id: "user-abc",
      notification_email: "me@example.com",
      frequency_hours: 48,
      is_active: true,
      min_match_percentage: 0, // absent in the form → defaults to 0 (no filter)
      experience_level: "entry", // absent in the form → defaults to entry
    });
    expect(opts).toEqual({ onConflict: "user_id" });
  });

  it("clamps and persists the min-match threshold", async () => {
    wireAuthed("user-abc");
    wireUpsertOk();
    const fd = new FormData();
    fd.append("notification_email", "me@example.com");
    fd.append("frequency_hours", "24");
    fd.append("is_active", "on");
    fd.append("min_match_percentage", "150"); // out of range → clamped to 100

    const res = await savePreferencesAction(undefined, fd);

    expect(res.ok).toBe(true);
    const [row] = upsertMock.mock.calls[0];
    expect(row.min_match_percentage).toBe(100);
  });

  it("persists a valid experience level", async () => {
    wireAuthed("user-abc");
    wireUpsertOk();
    const fd = new FormData();
    fd.append("notification_email", "me@example.com");
    fd.append("frequency_hours", "24");
    fd.append("is_active", "on");
    fd.append("experience_level", "senior");

    const res = await savePreferencesAction(undefined, fd);

    expect(res.ok).toBe(true);
    expect(upsertMock.mock.calls[0][0].experience_level).toBe("senior");
  });

  it("falls back to entry for an out-of-allowlist experience level", async () => {
    wireAuthed("user-abc");
    wireUpsertOk();
    const fd = new FormData();
    fd.append("notification_email", "me@example.com");
    fd.append("frequency_hours", "24");
    fd.append("is_active", "on");
    fd.append("experience_level", "principal-overlord"); // not allowed

    const res = await savePreferencesAction(undefined, fd);

    expect(res.ok).toBe(true);
    expect(upsertMock.mock.calls[0][0].experience_level).toBe("entry");
  });
});

describe("upsertSearchAction", () => {
  function wireInsertOk() {
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });
  }
  function wireUpdateOk() {
    eqMock2.mockResolvedValue({ error: null });
    eqMock1.mockReturnValue({ eq: eqMock2 });
    updateMock.mockReturnValue({ eq: eqMock1 });
    fromMock.mockReturnValue({ update: updateMock });
  }

  it("rejects empty search term", async () => {
    wireAuthed();
    const fd = new FormData();
    fd.append("search_term", "x");
    fd.append("sites", "linkedin");
    const res = await upsertSearchAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/short/i);
  });

  it("rejects when no valid site is selected", async () => {
    wireAuthed();
    const fd = new FormData();
    fd.append("search_term", "Backend Engineer");
    fd.append("sites", "not-a-real-site,whatever");
    const res = await upsertSearchAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/job board/i);
  });

  it("sanitizes sites to the allowlist and inserts on create", async () => {
    wireAuthed("user-abc");
    wireInsertOk();
    const fd = new FormData();
    fd.append("search_term", "ML Engineer");
    fd.append("location", "Berlin");
    fd.append("sites", "linkedin,not-a-real-site,glassdoor,LinkedIn"); // dups + invalid + case
    fd.append("job_type", "fulltime");
    fd.append("is_remote", "true");
    fd.append("results_wanted", "9999"); // should clamp
    fd.append("hours_old", "0"); // should clamp
    fd.append("country_indeed", "DE");
    fd.append("is_active", "true");

    const res = await upsertSearchAction(undefined, fd);
    expect(res.ok).toBe(true);

    expect(fromMock).toHaveBeenCalledWith("search_queries");
    const row = insertMock.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: "user-abc",
      search_term: "ML Engineer",
      location: "Berlin",
      sites: ["linkedin", "glassdoor"],
      job_type: "fulltime",
      is_remote: true,
      results_wanted: 100,
      hours_old: 1,
      country_indeed: "DE",
      is_active: true,
    });
  });

  it("scopes UPDATE to id AND user_id when editing", async () => {
    wireAuthed("user-abc");
    wireUpdateOk();
    const fd = new FormData();
    fd.append("id", "42");
    fd.append("search_term", "Senior Engineer");
    fd.append("sites", "indeed");
    fd.append("is_active", "true");

    const res = await upsertSearchAction(undefined, fd);
    expect(res.ok).toBe(true);

    expect(fromMock).toHaveBeenCalledWith("search_queries");
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(eqMock1).toHaveBeenCalledWith("id", 42);
    expect(eqMock2).toHaveBeenCalledWith("user_id", "user-abc");
  });

  it("falls back to defaults for missing location / country_indeed", async () => {
    wireAuthed();
    wireInsertOk();
    const fd = new FormData();
    fd.append("search_term", "Designer");
    fd.append("sites", "linkedin");
    // no location, no country_indeed
    const res = await upsertSearchAction(undefined, fd);
    expect(res.ok).toBe(true);
    const row = insertMock.mock.calls[0][0];
    expect(row.location).toBe("Worldwide");
    expect(row.country_indeed).toBe("USA");
    expect(row.results_wanted).toBe(30);
    expect(row.hours_old).toBe(24);
  });
});

describe("savePreferenceNoteAction", () => {
  it("rejects when session is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const fd = new FormData();
    fd.append("preference_note", "remote only");
    const res = await savePreferenceNoteAction(undefined, fd);
    expect(res.ok).toBe(false);
  });

  it("updates the note scoped to the user (defense in depth on RLS)", async () => {
    wireAuthed("user-abc");
    eqMock1.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock1 });
    fromMock.mockReturnValue({ update: updateMock });

    const fd = new FormData();
    fd.append("preference_note", "  Prioritize internships, no crypto  ");
    const res = await savePreferenceNoteAction(undefined, fd);

    expect(res.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("preferences");
    expect(updateMock).toHaveBeenCalledWith({
      preference_note: "Prioritize internships, no crypto", // trimmed
    });
    expect(eqMock1).toHaveBeenCalledWith("user_id", "user-abc");
  });

  it("stores null when the note is cleared", async () => {
    wireAuthed("user-abc");
    eqMock1.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock1 });
    fromMock.mockReturnValue({ update: updateMock });

    const fd = new FormData();
    fd.append("preference_note", "   ");
    const res = await savePreferenceNoteAction(undefined, fd);

    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ preference_note: null });
  });
});

describe("savePathsAction", () => {
  it("rejects when session is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const fd = new FormData();
    fd.append("paths", "backend,ai_ml");
    const res = await savePathsAction(undefined, fd);
    expect(res.ok).toBe(false);
  });

  it("validates + dedupes slugs against the catalog and scopes the update to the user", async () => {
    wireAuthed("user-abc");
    eqMock1.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock1 });
    fromMock.mockReturnValue({ update: updateMock });

    const fd = new FormData();
    // duplicate + invalid + mixed case + whitespace
    fd.append("paths", "Backend, ai_ml , backend, not_a_path");
    const res = await savePathsAction(undefined, fd);

    expect(res.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("preferences");
    expect(updateMock).toHaveBeenCalledWith({ paths: ["backend", "ai_ml"] });
    expect(eqMock1).toHaveBeenCalledWith("user_id", "user-abc");
  });

  it("stores an empty array when nothing valid is selected", async () => {
    wireAuthed("user-abc");
    eqMock1.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock1 });
    fromMock.mockReturnValue({ update: updateMock });

    const fd = new FormData();
    fd.append("paths", "nonsense,also_bad");
    const res = await savePathsAction(undefined, fd);
    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ paths: [] });
  });
});

describe("deleteSearchAction", () => {
  it("scopes DELETE to id AND user_id (defense in depth on RLS)", async () => {
    wireAuthed("user-abc");
    eqMock2.mockResolvedValue({ error: null });
    eqMock1.mockReturnValue({ eq: eqMock2 });
    deleteMock.mockReturnValue({ eq: eqMock1 });
    fromMock.mockReturnValue({ delete: deleteMock });

    const fd = new FormData();
    fd.append("id", "7");
    await deleteSearchAction(fd);

    expect(fromMock).toHaveBeenCalledWith("search_queries");
    expect(eqMock1).toHaveBeenCalledWith("id", 7);
    expect(eqMock2).toHaveBeenCalledWith("user_id", "user-abc");
  });

  it("is a no-op when id is missing or zero", async () => {
    wireAuthed();
    await deleteSearchAction(new FormData());
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("toggleSearchAction", () => {
  it("updates is_active to the next value and scopes to user_id", async () => {
    wireAuthed("user-abc");
    eqMock2.mockResolvedValue({ error: null });
    eqMock1.mockReturnValue({ eq: eqMock2 });
    updateMock.mockReturnValue({ eq: eqMock1 });
    fromMock.mockReturnValue({ update: updateMock });

    const fd = new FormData();
    fd.append("id", "11");
    fd.append("next", "false");
    await toggleSearchAction(fd);

    expect(updateMock).toHaveBeenCalledWith({ is_active: false });
    expect(eqMock1).toHaveBeenCalledWith("id", 11);
    expect(eqMock2).toHaveBeenCalledWith("user_id", "user-abc");
  });
});
