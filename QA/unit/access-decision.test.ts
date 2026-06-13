/**
 * Locks the approve/reject decision logic shared by the admin email links and
 * the /admin page: approve creates the account via invite, whitelists it, marks
 * the row approved, and emails the user; reject marks + emails; an already
 * decided request is a safe no-op. Also the token hashing round-trip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture admin-client interactions.
const createUserMock =
  vi.fn<
    (args: {
      email: string;
      email_confirm?: boolean;
      user_metadata?: unknown;
    }) => Promise<unknown>
  >();
const updates: { table: string; payload: Record<string, unknown> }[] = [];

function makeAdminClient() {
  return {
    auth: { admin: { createUser: createUserMock } },
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdminClient(),
}));

const sendEmailMock = vi.fn(async (_args: unknown) => ({ ok: true }));
vi.mock("@/lib/email-smtp", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

import {
  approveRequest,
  rejectRequest,
  hashToken,
  mintToken,
  type AccessRequestRow,
} from "@/lib/access-requests";

function pendingRow(over: Partial<AccessRequestRow> = {}): AccessRequestRow {
  return {
    id: 7,
    email: "ada@example.com",
    first_name: "Ada",
    last_name: "Lovelace",
    status: "pending",
    note: null,
    created_at: "2026-06-13T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  createUserMock.mockReset();
  sendEmailMock.mockClear();
  updates.length = 0;
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
});

describe("token helpers", () => {
  it("mintToken returns a raw secret whose sha256 matches the stored hash", () => {
    const { raw, hash } = mintToken();
    expect(hash).toBe(hashToken(raw));
    expect(raw).not.toBe(hash);
    expect(hash).toHaveLength(64); // sha256 hex
  });
});

describe("approveRequest", () => {
  it("creates a confirmed account, whitelists them, marks approved, and emails them a claim link", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "new-uid" } }, error: null });

    const res = await approveRequest(pendingRow());
    expect(res.ok).toBe(true);

    // Created a confirmed account (no Supabase invite email) with name metadata.
    expect(createUserMock).toHaveBeenCalledTimes(1);
    const [args] = createUserMock.mock.calls[0];
    expect(args.email).toBe("ada@example.com");
    expect(args.email_confirm).toBe(true);
    expect(args.user_metadata).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
    });

    // Whitelisted the new profile + marked the request approved.
    expect(updates).toEqual(
      expect.arrayContaining([
        { table: "profiles", payload: { is_whitelisted: true } },
        expect.objectContaining({
          table: "access_requests",
          payload: expect.objectContaining({ status: "approved", created_user_id: "new-uid" }),
        }),
      ]),
    );

    // Emailed the applicant a link to the token-less /claim page.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0][0] as { to: string; text: string };
    expect(mail.to).toBe("ada@example.com");
    expect(mail.text).toContain("/claim?email=ada%40example.com");
  });

  it("returns an error and does not whitelist when account creation fails", async () => {
    createUserMock.mockResolvedValue({ data: null, error: { message: "already registered" } });
    const res = await approveRequest(pendingRow());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/account creation failed/i);
    expect(updates).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("is a no-op on an already-decided request", async () => {
    const res = await approveRequest(pendingRow({ status: "approved" }));
    expect(res).toMatchObject({ ok: true, alreadyDecided: true });
    expect(createUserMock).not.toHaveBeenCalled();
  });
});

describe("rejectRequest", () => {
  it("marks rejected and emails the applicant", async () => {
    const res = await rejectRequest(pendingRow());
    expect(res.ok).toBe(true);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "access_requests",
          payload: expect.objectContaining({ status: "rejected" }),
        }),
      ]),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("is a no-op on an already-decided request", async () => {
    const res = await rejectRequest(pendingRow({ status: "rejected" }));
    expect(res).toMatchObject({ ok: true, alreadyDecided: true });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
