// Plain (non-"use server") module for values + types shared between the
// preferences server actions and the client components that render the form.
//
// These MUST NOT live in actions/preferences.ts: that file is "use server",
// which marks every export as a Server Action reference. A client component
// importing a constant array from there receives an action stub instead of
// the array — so `FREQUENCY_HOURS.includes(...)` throws
// "includes is not a function" at runtime. Keeping the constants here, in an
// ordinary module, lets both the client and the server action import the real
// values.

export type PrefState = {
  ok: boolean;
  error?: string;
  message?: string;
};

export const FREQUENCY_HOURS = [1, 24, 48, 168] as const;
export type FrequencyHours = (typeof FREQUENCY_HOURS)[number];

// Target seniority the user is aiming for. Drives the worker's per-user
// seniority filters (an entry-level user has senior roles filtered out; a
// mid/senior user keeps them) and the AI verdict prompt. Default "entry".
export const EXPERIENCE_LEVELS = ["entry", "mid", "senior"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const JOB_BOARDS = [
  "linkedin",
  "indeed",
  "glassdoor",
  "zip_recruiter",
  "google",
] as const;
export type JobBoard = (typeof JOB_BOARDS)[number];

export const JOB_TYPES = [
  "fulltime",
  "internship",
  "contract",
  "parttime",
] as const;
export type JobType = (typeof JOB_TYPES)[number];
