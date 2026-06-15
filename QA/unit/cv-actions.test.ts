/**
 * Locks the validation + auth contract of the CV server actions so a
 * future refactor can't silently drop a check (size cap, mime check,
 * minimum text length, session check, RLS path).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();
const storageUploadMock = vi.fn();
const storageRemoveMock = vi.fn();
const storageFromMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    storage: { from: storageFromMock },
  }),
}));

vi.mock("@/lib/cv-parser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cv-parser")>(
    "@/lib/cv-parser",
  );
  return {
    ...actual,
    // A realistic CV so it clears the quality gate (skills + projects + experience).
    parseCv: vi.fn(async (_buffer: Buffer, kind: "pdf" | "docx") => ({
      text: USABLE_CV,
      kind,
      chars: USABLE_CV.length,
    })),
  };
});

import { saveCvTextAction, uploadCvAction } from "@/app/actions/cv";

// A realistic CV that clears the quality gate — used wherever a test needs the
// happy path (the gate blocks content with no skills/experience/projects signal).
const USABLE_CV = [
  "Sara Q — sara@example.com — github.com/saraq",
  "Education: BSc Computer Science, Birzeit University, expected 2027.",
  "Skills: Python, JavaScript, React, SQL, Docker.",
  "Experience: Software Engineering Intern at Acme, summer 2025.",
  "Projects: built a task tracker with React and a FastAPI backend;",
  "developed an image classifier in PyTorch for a course project.",
].join("\n");

function wireSupabase({
  user = { id: "user-123" },
  uploadError = null as { message: string } | null,
  dbError = null as { message: string } | null,
} = {}) {
  getUserMock.mockResolvedValue({ data: { user } });
  eqMock.mockResolvedValue({ error: dbError });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });
  storageUploadMock.mockResolvedValue({ error: uploadError });
  storageRemoveMock.mockResolvedValue({ error: null });
  storageFromMock.mockReturnValue({
    upload: storageUploadMock,
    remove: storageRemoveMock,
  });
}

function makeUploadForm({
  fileName = "resume.pdf",
  mimeType = "application/pdf",
  size = 1024,
}: { fileName?: string; mimeType?: string; size?: number } = {}) {
  const fd = new FormData();
  const file = new File([new Uint8Array(size)], fileName, { type: mimeType });
  fd.append("cv", file);
  return fd;
}

beforeEach(() => {
  getUserMock.mockReset();
  updateMock.mockReset();
  eqMock.mockReset();
  fromMock.mockReset();
  storageUploadMock.mockReset();
  storageRemoveMock.mockReset();
  storageFromMock.mockReset();
});

describe("uploadCvAction", () => {
  it("rejects when no file is attached", async () => {
    wireSupabase();
    const fd = new FormData();
    const res = await uploadCvAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/choose/i);
  });

  it("rejects unsupported file types", async () => {
    wireSupabase();
    const fd = makeUploadForm({ fileName: "notes.txt", mimeType: "text/plain" });
    const res = await uploadCvAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/only pdf and docx/i);
  });

  it("rejects files over the size cap", async () => {
    wireSupabase();
    const fd = makeUploadForm({ size: 6 * 1024 * 1024 });
    const res = await uploadCvAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/too large/i);
  });

  it("rejects when the session is gone", async () => {
    wireSupabase({ user: null as unknown as { id: string } });
    const fd = makeUploadForm();
    const res = await uploadCvAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/session/i);
  });

  it("uploads, writes to profiles, and returns the parsed preview on success", async () => {
    wireSupabase();
    const fd = makeUploadForm();

    const res = await uploadCvAction(undefined, fd);

    expect(res.ok).toBe(true);
    expect(res.preview).toBeTruthy();
    expect(res.chars).toBe(USABLE_CV.length);
    expect(storageFromMock).toHaveBeenCalledWith("cvs");
    expect(storageUploadMock).toHaveBeenCalledWith(
      "user-123/cv.pdf",
      expect.any(Buffer),
      expect.objectContaining({ upsert: true, contentType: "application/pdf" }),
    );
    expect(storageRemoveMock).toHaveBeenCalledWith(["user-123/cv.docx"]);
    expect(fromMock).toHaveBeenCalledWith("profiles");
    const payload = updateMock.mock.calls[0][0];
    expect(payload.cv_text).toContain("Skills:");
    expect(payload.cv_file_path).toBe("user-123/cv.pdf");
    expect(payload.cv_embedding).toBeNull();
    expect(typeof payload.cv_uploaded_at).toBe("string");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-123");
  });

  it("returns a storage error if upload fails", async () => {
    wireSupabase({ uploadError: { message: "bucket not found" } });
    const fd = makeUploadForm();
    const res = await uploadCvAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/bucket not found/);
  });
});

describe("saveCvTextAction", () => {
  it("rejects pasted text under 200 chars", async () => {
    wireSupabase();
    const fd = new FormData();
    fd.append("cv_text", "too short");
    const res = await saveCvTextAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/short/i);
  });

  it("rejects when the session is gone", async () => {
    wireSupabase({ user: null as unknown as { id: string } });
    const fd = new FormData();
    fd.append("cv_text", USABLE_CV);
    const res = await saveCvTextAction(undefined, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/session/i);
  });

  it("writes normalized text to profiles", async () => {
    wireSupabase();
    const fd = new FormData();
    // Usable CV padded to >500 chars with collapsible blank lines, to exercise
    // both the quality gate (passes) and the blank-line normalization.
    fd.append("cv_text", USABLE_CV + "    \n\n\n\n\n" + "more detail ".repeat(60));
    const res = await saveCvTextAction(undefined, fd);
    expect(res.ok).toBe(true);
    expect(res.chars).toBeGreaterThan(500);
    expect(fromMock).toHaveBeenCalledWith("profiles");
    const payload = updateMock.mock.calls[0][0];
    expect(payload.cv_embedding).toBeNull();
    expect(payload.cv_text).not.toContain("\n\n\n");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-123");
  });
});
