/**
 * The three sample jobs shown in both the inbox mock and the dashboard
 * mock on the landing page. Defined once so the two artifacts stay in
 * sync — that visual parallel is the whole point.
 */
export type Pick = {
  score: number;
  title: string;
  company: string;
  location: string;
  match: string;
};

export const SAMPLE_PICKS: Pick[] = [
  {
    score: 92,
    title: "Senior Software Engineer",
    company: "Linear",
    location: "Remote · EU",
    match: "Python, distributed infra, 3+ yrs",
  },
  {
    score: 88,
    title: "Backend Engineer",
    company: "Vercel",
    location: "Berlin · Hybrid",
    match: "TypeScript, edge runtime",
  },
  {
    score: 86,
    title: "ML Platform Engineer",
    company: "Hugging Face",
    location: "Paris · Remote-friendly",
    match: "PyTorch, training at scale",
  },
];
