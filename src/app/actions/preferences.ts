"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
// Values + types live in a plain module — a "use server" file may only export
// async Server Actions, so constants imported from here by client components
// would otherwise become action references (see constants.ts).
import {
  FREQUENCY_HOURS,
  JOB_BOARDS,
  JOB_TYPES,
  type FrequencyHours,
  type JobBoard,
  type JobType,
  type PrefState,
} from "@/app/preferences/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function parseBool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}

function parseSites(raw: FormDataEntryValue | null): JobBoard[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const tokens = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const valid = new Set<string>(JOB_BOARDS);
  const out: JobBoard[] = [];
  for (const tok of tokens) {
    if (valid.has(tok) && !out.includes(tok as JobBoard)) {
      out.push(tok as JobBoard);
    }
  }
  return out;
}

export async function savePreferencesAction(
  _prev: PrefState | undefined,
  formData: FormData,
): Promise<PrefState> {
  const email = String(formData.get("notification_email") ?? "").trim().toLowerCase();
  const freq = Number(formData.get("frequency_hours") ?? 24);
  const isActive = parseBool(formData.get("is_active"));

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!FREQUENCY_HOURS.includes(freq as FrequencyHours)) {
    return { ok: false, error: "That frequency isn't supported." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const { error } = await supabase.from("preferences").upsert(
    {
      user_id: user.id,
      notification_email: email,
      frequency_hours: freq,
      is_active: isActive,
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/preferences");
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved." };
}

export type UpsertSearchInput = {
  id?: number;
  search_term: string;
  location: string;
  sites: JobBoard[];
  job_type: JobType | null;
  is_remote: boolean;
  results_wanted: number;
  hours_old: number;
  country_indeed: string;
  is_active: boolean;
};

export async function upsertSearchAction(
  _prev: PrefState | undefined,
  formData: FormData,
): Promise<PrefState> {
  const idRaw = formData.get("id");
  const id = idRaw && idRaw !== "" ? Number(idRaw) : undefined;

  const searchTerm = String(formData.get("search_term") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || "Worldwide";
  const sites = parseSites(formData.get("sites"));
  const jobTypeRaw = String(formData.get("job_type") ?? "");
  const jobType =
    JOB_TYPES.includes(jobTypeRaw as JobType) ? (jobTypeRaw as JobType) : null;
  const isRemote = parseBool(formData.get("is_remote"));
  const resultsWanted = clamp(Number(formData.get("results_wanted") ?? 30), 1, 100);
  const hoursOld = clamp(Number(formData.get("hours_old") ?? 24), 1, 720);
  const countryIndeed =
    String(formData.get("country_indeed") ?? "").trim() || "USA";
  const isActive = parseBool(formData.get("is_active"));

  if (searchTerm.length < 2) {
    return { ok: false, error: "Search term is too short." };
  }
  if (sites.length === 0) {
    return { ok: false, error: "Pick at least one job board." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const row = {
    user_id: user.id,
    search_term: searchTerm,
    location,
    sites,
    job_type: jobType,
    is_remote: isRemote,
    results_wanted: resultsWanted,
    hours_old: hoursOld,
    country_indeed: countryIndeed,
    is_active: isActive,
  };

  if (id) {
    const { error } = await supabase
      .from("search_queries")
      .update(row)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("search_queries").insert(row);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/preferences");
  revalidatePath("/dashboard");
  return { ok: true, message: id ? "Search updated." : "Search added." };
}

export async function deleteSearchAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("search_queries").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/preferences");
  revalidatePath("/dashboard");
}

export async function toggleSearchAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const next = parseBool(formData.get("next"));
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("search_queries")
    .update({ is_active: next })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/preferences");
  revalidatePath("/dashboard");
}
