import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FEEDBACK_TYPES = [
  "applied",
  "bookmarked",
  "not_relevant",
  "block_company",
  "wrong_location",
  "other",
] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

interface FeedbackPayload {
  job_result_id: number;
  feedback_type: FeedbackType;
  note?: string;
}

interface JobResultRow {
  id: number;
  user_id: string;
  job_url: string;
  title: string | null;
  company: string | null;
}

function parsePayload(input: unknown): FeedbackPayload | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const jobResultId = Number(raw.job_result_id);
  if (!Number.isInteger(jobResultId) || jobResultId <= 0) return null;

  const feedbackType = String(raw.feedback_type ?? "");
  if (!FEEDBACK_TYPES.includes(feedbackType as FeedbackType)) return null;

  const noteRaw = raw.note;
  const note =
    typeof noteRaw === "string" && noteRaw.trim().length > 0
      ? noteRaw.trim().slice(0, 1000)
      : undefined;

  return {
    job_result_id: jobResultId,
    feedback_type: feedbackType as FeedbackType,
    note,
  };
}

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
      { error: "Invalid payload — job_result_id and feedback_type are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // RLS already scopes this to the user, but eq("user_id", ...) makes it a
  // 404-style miss instead of a "no row found" surprise — and locks the
  // contract at the application layer.
  const { data: job, error: jobErr } = await supabase
    .from("job_results")
    .select("id, user_id, job_url, title, company")
    .eq("id", payload.job_result_id)
    .eq("user_id", user.id)
    .maybeSingle<JobResultRow>();
  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json(
      { error: "Job not found or not yours." },
      { status: 404 },
    );
  }

  // One verdict per (user, job): a new reaction REPLACES the previous one
  // rather than appending a contradictory second row (migration 0016 adds the
  // unique index + the UPDATE grant this upsert needs). The latest reaction
  // wins. A note only backfills when supplied — a bare re-tap that carries no
  // note must not wipe a note saved on the existing row, so we resolve the
  // note client-side... but upsert can't express "keep old note if new is
  // null" in one statement. We read the existing row's note first and merge.
  const { data: existing } = await supabase
    .from("feedback")
    .select("note")
    .eq("user_id", user.id)
    .eq("job_result_id", job.id)
    .maybeSingle<{ note: string | null }>();
  const mergedNote = payload.note ?? existing?.note ?? null;

  const { data: inserted, error: insertErr } = await supabase
    .from("feedback")
    .upsert(
      {
        user_id: user.id,
        job_result_id: job.id,
        job_url: job.job_url,
        title: job.title,
        company: job.company,
        feedback_type: payload.feedback_type,
        note: mergedNote,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_result_id" },
    )
    .select("id")
    .single<{ id: number }>();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Could not save feedback." },
      { status: 500 },
    );
  }

  // UX shortcut: "Bookmark" reaction also lands the job in Tab B as a
  // saved bookmark. The plan calls this out explicitly — it's a single
  // user action that crosses the two-tab boundary cleanly. ON CONFLICT
  // is a no-op via the unique (user_id, job_result_id) constraint, so
  // re-bookmarking the same job is safe.
  if (payload.feedback_type === "bookmarked") {
    const { error: bmErr } = await supabase
      .from("bookmarks")
      .upsert(
        {
          user_id: user.id,
          job_result_id: job.id,
          status: "saved",
        },
        { onConflict: "user_id,job_result_id", ignoreDuplicates: true },
      );
    if (bmErr) {
      // Don't fail the whole request — the feedback row already landed.
      // Surface the bookmark issue so the client can show a soft warning.
      return NextResponse.json(
        {
          ok: true,
          id: inserted.id,
          warning: `Saved feedback but couldn't bookmark: ${bmErr.message}`,
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id }, { status: 200 });
}
