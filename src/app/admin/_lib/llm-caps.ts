/**
 * Free-tier rate limits for every model the worker uses, keyed by the exact
 * model id the worker logs. Used by the admin LLM-usage dashboard to show
 * "used today vs cap" gauges.
 *
 * IMPORTANT — DOUBLED accounts: the worker round-robins across TWO Cerebras and
 * TWO Groq accounts (see core_llm key rotation), so the EFFECTIVE caps for those
 * two providers are 2x a single account's published limit. Gemini stays single-
 * account. `accounts` documents the multiplier baked into the numbers below.
 *
 * Caps are best-effort references (providers don't expose a live quota API), so
 * the dashboard labels gauges as estimates. RPM is the per-minute request limit;
 * RPD is per-day; TPM/TPD are tokens (null when the provider doesn't publish one
 * or we don't track it). Update here if a provider changes its free tier.
 */

export interface ModelCap {
  provider: string;
  label: string; // friendly display name
  accounts: number; // how many accounts the caps below already account for
  rpm: number | null;
  rpd: number | null;
  tpm: number | null;
  tpd: number | null;
}

// Single-account published limits (from the providers' dashboards), then x2 for
// the two-account providers so the gauges reflect real available headroom.
export const MODEL_CAPS: Record<string, ModelCap> = {
  // Cerebras — 2 accounts → caps doubled (single: 5 RPM / 2,400 RPD / 30K TPM / 1M TPD).
  "gpt-oss-120b": {
    provider: "Cerebras",
    label: "Cerebras gpt-oss-120b",
    accounts: 2,
    rpm: 10,
    rpd: 4800,
    tpm: 60000,
    tpd: 2000000,
  },
  // Groq — 2 accounts → caps doubled (single: 30 RPM / 1,000 RPD / 12K TPM / 100K TPD).
  "llama-3.3-70b-versatile": {
    provider: "Groq",
    label: "Groq llama-3.3-70b",
    accounts: 2,
    rpm: 60,
    rpd: 2000,
    tpm: 24000,
    tpd: 200000,
  },
  // Gemini — single account.
  "gemini-3.1-flash-lite": {
    provider: "Gemini",
    label: "Gemini 3.1 Flash Lite",
    accounts: 1,
    rpm: 15,
    rpd: 500,
    tpm: 250000,
    tpd: null,
  },
  "gemini-embedding-001": {
    provider: "Gemini",
    label: "Gemini Embedding 1 (CV/job rank)",
    accounts: 1,
    rpm: 100,
    rpd: 1000,
    tpm: 30000,
    tpd: null,
  },
  "gemini-embedding-2": {
    provider: "Gemini",
    label: "Gemini Embedding 2 (feedback RAG)",
    accounts: 1,
    rpm: 100,
    rpd: 1000,
    tpm: 30000,
    tpd: null,
  },
};

/** Cap lookup with a safe fallback for an unknown model id. */
export function capFor(model: string): ModelCap {
  return (
    MODEL_CAPS[model] ?? {
      provider: "Unknown",
      label: model,
      accounts: 1,
      rpm: null,
      rpd: null,
      tpm: null,
      tpd: null,
    }
  );
}
