import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Public (no-session) feedback endpoint for the email page (task W2).
 *
 * Auth model: the bearer of a valid token IS the authorization. The token
 * never reaches the database in raw form — the submit_email_feedback RPC
 * (SECURITY DEFINER, migration 0012) hashes it, checks expiry, and verifies
 * the job belongs to the token's exact (user, run) before appending one
 * feedback row. This route is a thin validation + status-mapping shim.
 */

const EMAIL_FEEDBACK_TYPES = [
  "applied",
  "bookmarked",
  "not_relevant",
  "block_company",
] as const;
type EmailFeedbackType = (typeof EMAIL_FEEDBACK_TYPES)[number];

interface EmailFeedbackPayload {
  token: string;
  job_result_id: number;
  feedback_type: EmailFeedbackType;
  note: string | null;
}

// Mirror the RPC's cap so an oversized paste is rejected cheaply at the edge
// rather than silently truncated in Postgres.
const MAX_NOTE_LENGTH = 500;

interface RpcResult {
  ok: boolean;
  error?: string;
  id?: number;
  duplicate?: boolean;
}

function parsePayload(input: unknown): EmailFeedbackPayload | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (token.length < 20 || token.length > 200) return null;

  const jobResultId = Number(raw.job_result_id);
  if (!Number.isInteger(jobResultId) || jobResultId <= 0) return null;

  const feedbackType = String(raw.feedback_type ?? "");
  if (!EMAIL_FEEDBACK_TYPES.includes(feedbackType as EmailFeedbackType)) {
    return null;
  }

  // Note is optional. Trim, drop blanks to null, and reject anything past the
  // cap rather than silently truncating — a too-long note is a client bug.
  let note: string | null = null;
  if (raw.note != null) {
    if (typeof raw.note !== "string") return null;
    const trimmed = raw.note.trim();
    if (trimmed.length > MAX_NOTE_LENGTH) return null;
    note = trimmed.length > 0 ? trimmed : null;
  }

  return {
    token,
    job_result_id: jobResultId,
    feedback_type: feedbackType as EmailFeedbackType,
    note,
  };
}

// In-band RPC errors → HTTP statuses the client component can message on.
const RPC_ERROR_STATUS: Record<string, number> = {
  invalid_token: 401,
  expired: 410,
  job_not_found: 404,
  invalid_type: 400,
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid payload — token, job_result_id and feedback_type are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_email_feedback", {
    p_token: payload.token,
    p_job_result_id: payload.job_result_id,
    p_feedback_type: payload.feedback_type,
    p_note: payload.note,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as RpcResult | null;
  if (!result || typeof result.ok !== "boolean") {
    return NextResponse.json(
      { error: "Unexpected response from the feedback service." },
      { status: 502 },
    );
  }

  if (!result.ok) {
    const status = RPC_ERROR_STATUS[result.error ?? ""] ?? 400;
    return NextResponse.json({ error: result.error ?? "rejected" }, { status });
  }

  return NextResponse.json(
    { ok: true, id: result.id, duplicate: result.duplicate === true },
    { status: 200 },
  );
}
