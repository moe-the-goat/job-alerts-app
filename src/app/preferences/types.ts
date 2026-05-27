import type { JobBoard, JobType } from "@/app/actions/preferences";

export interface SearchRow {
  id: number;
  search_term: string;
  location: string;
  sites: JobBoard[] | string[]; // Supabase returns the JSONB as-is
  job_type: JobType | null;
  is_remote: boolean;
  results_wanted: number;
  hours_old: number;
  country_indeed: string;
  is_active: boolean;
  updated_at: string;
}

export const SITE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  zip_recruiter: "ZipRecruiter",
  google: "Google",
};

export const FREQUENCY_LABELS: Record<number, string> = {
  1: "Hourly (debug)",
  24: "Daily",
  48: "Every 2 days",
  168: "Weekly",
};
