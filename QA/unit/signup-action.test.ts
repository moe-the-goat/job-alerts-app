/**
 * Locks the closed-beta signup contract: signupAction files an access_request
 * and emails the admin — it must NOT create a Supabase account. Also: name +
 * email validation, duplicate-request handling, and that the admin email
 * carries approve/reject links.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mocks -----------------------------------------------------------------
const getUserMock = vi.fn();
const serverFromMock = vi.fn();
const signUpMock = vi.fn(); // must NEVER be called by the request-first flow

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "app.example.com"]]),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock, signUp: signUpMock },
    from: serverFromMock,
  }),
}));

// Admin client: a chainable stub recording the access_requests insert.
const adminState = {
  existing: null as { id: number; status: string } | null,
  insertPayload: null as Record<string, unknown> | null,
  insertError: null as { message: string } | null,
};
function makeAdminClient() {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async () => ({ data: adminState.existing }),
        insert(payload: Record<string, unknown>) {
          adminState.insertPayload = payload;
          return {
            select: () => ({
              single: async () =>
                adminState.insertError
                  ? { data: null, error: adminState.insertError }
                  : { data: { id: 7 }, error: null },
            }),
          };
        },
      };
    },
  };
}
const createAdminClientMock = vi.fn(() => makeAdminClient());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const sendEmailMock = vi.fn(async (_args: unknown) => ({ ok: true }));
vi.mock("@/lib/email-smtp", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

import { signupAction } from "@/app/actions/auth";

beforeEach(() => {
  getUserMock.mockReset();
  serverFromMock.mockReset();
  signUpMock.mockReset();
  sendEmailMock.mockClear();
  createAdminClientMock.mockClear();
  adminState.existing = null;
  adminState.insertPayload = null;
  adminState.insertError = null;
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("signupAction (request-first)", () => {
  it("rejects a missing name", async () => {
    const res = await signupAction(undefined, form({ email: "a@b.co", first_name: "Ada" }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/name/i);
  });

  it("rejects an invalid email", async () => {
    const res = await signupAction(
      undefined,
      form({ email: "nope", first_name: "Ada", last_name: "Lovelace" }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/valid email/i);
  });

  it("files a request, emails the admin with decision links, and creates NO account", async () => {
    const res = await signupAction(
      undefined,
      form({
        email: "Ada@Example.com",
        first_name: "Ada",
        last_name: "Lovelace",
        note: "I love job hunting",
      }),
    );

    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/request received/i);

    // No Supabase account.
    expect(signUpMock).not.toHaveBeenCalled();

    // Wrote a pending request with lowercased email + a token hash, no password.
    expect(adminState.insertPayload).toMatchObject({
      email: "ada@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
      note: "I love job hunting",
    });
    expect(typeof adminState.insertPayload?.decision_token_hash).toBe("string");
    expect(adminState.insertPayload).not.toHaveProperty("password");

    // Emailed the admin, with both decision links.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0] as { to: string; html: string; text: string };
    expect(arg.to).toBe("mohaabuhijleh@gmail.com");
    expect(arg.text).toMatch(/action=approve/);
    expect(arg.text).toMatch(/action=reject/);
  });

  it("short-circuits when an approved request already exists", async () => {
    adminState.existing = { id: 1, status: "approved" };
    const res = await signupAction(
      undefined,
      form({ email: "a@b.co", first_name: "Ada", last_name: "Lovelace" }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already approved/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("tells a repeat applicant their request is already pending", async () => {
    adminState.existing = { id: 1, status: "pending" };
    const res = await signupAction(
      undefined,
      form({ email: "a@b.co", first_name: "Ada", last_name: "Lovelace" }),
    );
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/already requested/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
