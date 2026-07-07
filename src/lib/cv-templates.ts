// CV templates — pure renderers that turn a structured, tailored CV into a
// print-ready HTML document. Three visual styles share ONE semantic body
// generator and differ only in CSS, so a template is genuinely just a skin
// over the same data (and adding a fourth is cheap).
//
// PRIVACY: every value here is neutral placeholder content. The real CV data
// is injected at render time, in the browser, for the signed-in owner only —
// nothing identifying is ever committed to this file.

export type CvLink = { label: string; url?: string };

export type CvContact = {
  location?: string;
  phone?: string;
  email?: string;
  links?: CvLink[];
};

export type CvSkill = { label: string; value: string };

export type CvEntry = {
  title: string;
  subtitle?: string; // employer / school / org
  meta?: string; // location, GPA, etc.
  date?: string;
  tech?: string; // tech-stack line
  bullets?: string[];
};

export type CvSection =
  | { kind: "skills"; heading: string; skills: CvSkill[] }
  | { kind: "entries"; heading: string; entries: CvEntry[] } // projects / experience / education
  | { kind: "list"; heading: string; items: string[] }; // certifications, etc.

export type TailoredCv = {
  name: string;
  headline?: string; // a short professional title/line under the name
  contact: CvContact;
  summary?: string;
  sections: CvSection[];
};

export const CV_TEMPLATES = [
  {
    id: "classic",
    label: "Classic",
    description: "Centered header, clean sans — a balanced all-rounder.",
  },
  {
    id: "ats",
    label: "ATS Plain",
    description: "Left-aligned, single column — safest for applicant-tracking parsers.",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Editorial serif with an accent — stands out, still one column.",
  },
] as const;

export type CvTemplateId = (typeof CV_TEMPLATES)[number]["id"];

export const DEFAULT_TEMPLATE: CvTemplateId = "classic";

export function isTemplateId(v: string): v is CvTemplateId {
  return CV_TEMPLATES.some((t) => t.id === v);
}

// ---- Parsing the LLM's JSON into a TailoredCv (defensive) ------------------

/** Extract + validate a TailoredCv from the model's raw text. Strips markdown
 *  code fences, tolerates extra prose around the JSON, and returns null if the
 *  shape isn't usable — so callers can fall back to showing plain text. */
export function parseTailoredCv(raw: string): TailoredCv | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip a ```json ... ``` (or ``` ... ```) fence if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Otherwise, clip to the outermost { ... } so leading/trailing prose is ignored.
  if (text[0] !== "{") {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    text = text.slice(start, end + 1);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.name !== "string" || !Array.isArray(o.sections)) return null;

  const contact = (o.contact ?? {}) as Record<string, unknown>;
  const sections: CvSection[] = [];
  for (const s of o.sections as unknown[]) {
    if (!s || typeof s !== "object") continue;
    const sec = s as Record<string, unknown>;
    const heading = typeof sec.heading === "string" ? sec.heading : "";
    if (sec.kind === "skills" && Array.isArray(sec.skills)) {
      const skills = (sec.skills as unknown[])
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x?.label === "string" && typeof x?.value === "string")
        .map((x) => ({ label: String(x.label), value: String(x.value) }));
      if (skills.length) sections.push({ kind: "skills", heading, skills });
    } else if (sec.kind === "list" && Array.isArray(sec.items)) {
      const items = (sec.items as unknown[]).filter((x): x is string => typeof x === "string");
      if (items.length) sections.push({ kind: "list", heading, items });
    } else if (sec.kind === "entries" && Array.isArray(sec.entries)) {
      const entries: CvEntry[] = (sec.entries as unknown[])
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x?.title === "string")
        .map((x) => ({
          title: String(x.title),
          subtitle: typeof x.subtitle === "string" ? x.subtitle : undefined,
          meta: typeof x.meta === "string" ? x.meta : undefined,
          date: typeof x.date === "string" ? x.date : undefined,
          tech: typeof x.tech === "string" ? x.tech : undefined,
          bullets: Array.isArray(x.bullets)
            ? (x.bullets as unknown[]).filter((b): b is string => typeof b === "string")
            : undefined,
        }));
      if (entries.length) sections.push({ kind: "entries", heading, entries });
    }
  }
  if (!sections.length) return null;

  return {
    name: o.name,
    headline: typeof o.headline === "string" ? o.headline : undefined,
    summary: typeof o.summary === "string" ? o.summary : undefined,
    contact: {
      location: typeof contact.location === "string" ? contact.location : undefined,
      phone: typeof contact.phone === "string" ? contact.phone : undefined,
      email: typeof contact.email === "string" ? contact.email : undefined,
      links: Array.isArray(contact.links)
        ? (contact.links as unknown[])
            .map((l) => l as Record<string, unknown>)
            .filter((l) => typeof l?.label === "string")
            .map((l) => ({
              label: String(l.label),
              url: typeof l.url === "string" ? l.url : undefined,
            }))
        : undefined,
    },
    sections,
  };
}

// ---- Placeholder sample (used for picker previews — NO real data) ----------

export const SAMPLE_CV: TailoredCv = {
  name: "Your Name",
  headline: "Software Engineer",
  contact: {
    location: "City, Country",
    phone: "+000 000 0000",
    email: "you@example.com",
    links: [
      { label: "linkedin.com/in/you", url: "https://linkedin.com" },
      { label: "github.com/you", url: "https://github.com" },
    ],
  },
  summary:
    "A one-line professional summary tailored to the role, drawn entirely from your real experience.",
  sections: [
    {
      kind: "skills",
      heading: "Technical Skills",
      skills: [
        { label: "Languages", value: "Python, TypeScript, SQL" },
        { label: "Frameworks", value: "FastAPI, Next.js, React" },
        { label: "Tools", value: "Docker, Git, PostgreSQL" },
      ],
    },
    {
      kind: "entries",
      heading: "Projects",
      entries: [
        {
          title: "A Project From Your CV",
          date: "2026",
          tech: "Python, Next.js, PostgreSQL",
          bullets: [
            "A real bullet from your CV, re-emphasized to match what this posting cares about.",
            "Another genuine achievement, quantified where your CV already gives numbers.",
          ],
        },
      ],
    },
    {
      kind: "entries",
      heading: "Education",
      entries: [
        {
          title: "Your Degree",
          subtitle: "Your University",
          meta: "GPA: —",
          date: "20XX – 20XX",
        },
      ],
    },
    {
      kind: "list",
      heading: "Certifications",
      items: ["A certification exactly as it appears on your CV"],
    },
  ],
};

// ---- Plain-text serialization (the copyable "text only" view) --------------

/** A readable plain-text rendering of the structured CV — what the panel shows
 *  and lets the user copy, independent of any visual template. */
export function cvToText(cv: TailoredCv): string {
  const out: string[] = [cv.name];
  if (cv.headline) out.push(cv.headline);
  const c = cv.contact;
  const contactLine = [
    c.location,
    c.phone,
    c.email,
    ...(c.links ?? []).map((l) => l.label),
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contactLine) out.push(contactLine);
  if (cv.summary) out.push("", "SUMMARY", cv.summary);

  for (const s of cv.sections) {
    out.push("", s.heading.toUpperCase());
    if (s.kind === "skills") {
      for (const sk of s.skills) out.push(`${sk.label}: ${sk.value}`);
    } else if (s.kind === "list") {
      for (const i of s.items) out.push(`• ${i}`);
    } else {
      for (const e of s.entries) {
        const head = [e.title, e.date].filter(Boolean).join("  —  ");
        out.push(head);
        const sub = [e.subtitle, e.meta].filter(Boolean).join("  ·  ");
        if (sub) out.push(sub);
        if (e.tech) out.push(e.tech);
        for (const b of e.bullets ?? []) out.push(`  • ${b}`);
      }
    }
  }
  return out.join("\n");
}

// ---- HTML rendering --------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only allow safe link targets; otherwise render the label as plain text. */
function safeHref(url?: string): string | null {
  if (!url) return null;
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

function link(l: CvLink): string {
  const href = safeHref(l.url);
  const label = esc(l.label);
  return href ? `<a href="${esc(href)}">${label}</a>` : label;
}

function contactHtml(c: CvContact): string {
  const line1 = [c.location].filter(Boolean).map((x) => esc(x as string));
  const line2 = [
    c.phone ? esc(c.phone) : null,
    c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : null,
  ].filter(Boolean);
  const line3 = (c.links ?? []).map(link);
  const parts: string[] = [];
  if (line1.length) parts.push(`<div class="cv-contact-line">${line1.join("")}</div>`);
  if (line2.length)
    parts.push(`<div class="cv-contact-line">${line2.join(' <span class="cv-dot">·</span> ')}</div>`);
  if (line3.length)
    parts.push(`<div class="cv-contact-line">${line3.join(' <span class="cv-dot">·</span> ')}</div>`);
  return `<div class="cv-contact">${parts.join("")}</div>`;
}

function sectionHtml(s: CvSection): string {
  const title = `<h2 class="cv-section-title">${esc(s.heading)}</h2>`;
  if (s.kind === "skills") {
    const rows = s.skills
      .map(
        (sk) =>
          `<div class="cv-skill"><span class="cv-skill-label">${esc(sk.label)}</span><span class="cv-skill-value">${esc(sk.value)}</span></div>`,
      )
      .join("");
    return `<section class="cv-section">${title}<div class="cv-skills">${rows}</div></section>`;
  }
  if (s.kind === "list") {
    const items = s.items.map((i) => `<li>${esc(i)}</li>`).join("");
    return `<section class="cv-section">${title}<ul class="cv-list">${items}</ul></section>`;
  }
  const entries = s.entries
    .map((e) => {
      const head = `<div class="cv-entry-head"><span class="cv-entry-title">${esc(e.title)}</span>${
        e.date ? `<span class="cv-entry-date">${esc(e.date)}</span>` : ""
      }</div>`;
      const sub =
        e.subtitle || e.meta
          ? `<div class="cv-entry-sub">${[e.subtitle, e.meta].filter(Boolean).map((x) => esc(x as string)).join(' <span class="cv-dot">·</span> ')}</div>`
          : "";
      const tech = e.tech ? `<div class="cv-tech">${esc(e.tech)}</div>` : "";
      const bullets = e.bullets?.length
        ? `<ul class="cv-bullets">${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
        : "";
      return `<div class="cv-entry">${head}${sub}${tech}${bullets}</div>`;
    })
    .join("");
  return `<section class="cv-section">${title}<div class="cv-entries">${entries}</div></section>`;
}

/** Shared semantic body — same markup for every template; CSS does the rest. */
function cvBodyHtml(cv: TailoredCv): string {
  const header = `<header class="cv-header">
    <h1 class="cv-name">${esc(cv.name)}</h1>
    ${cv.headline ? `<div class="cv-headline">${esc(cv.headline)}</div>` : ""}
    ${contactHtml(cv.contact)}
  </header>`;
  const summary = cv.summary
    ? `<section class="cv-section cv-summary-section"><h2 class="cv-section-title">Summary</h2><p class="cv-summary">${esc(cv.summary)}</p></section>`
    : "";
  const body = cv.sections.map(sectionHtml).join("");
  return `<div class="cv">${header}${summary}${body}</div>`;
}

// Shared reset + print rules; each template appends its own look.
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 14mm 15mm; }
  html, body { background: #fff; color: #1a1a1a; }
  a { color: inherit; text-decoration: none; }
  .cv { max-width: 720px; margin: 0 auto; }
  .cv-dot { opacity: 0.5; padding: 0 2px; }
  .cv-section { margin-top: 12px; break-inside: avoid; }
  .cv-bullets { list-style: disc; padding-left: 16px; margin-top: 3px; }
  .cv-bullets li, .cv-list li { margin: 2px 0; }
  @media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

const CLASSIC_CSS = `
  body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; }
  .cv-header { text-align: center; padding-bottom: 8px; }
  .cv-name { font-size: 24pt; font-weight: 700; letter-spacing: 0.3px; }
  .cv-headline { font-size: 11pt; color: #444; margin-top: 2px; }
  .cv-contact { margin-top: 6px; font-size: 9pt; color: #333; }
  .cv-contact-line { margin-top: 1px; }
  .cv-contact a { border-bottom: 1px solid #ccc; }
  .cv-section-title { font-size: 10.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    border-bottom: 1.5px solid #1a1a1a; padding-bottom: 2px; margin-bottom: 5px; }
  .cv-summary { font-size: 10pt; }
  .cv-skill { display: grid; grid-template-columns: 130px 1fr; gap: 8px; margin: 2px 0; }
  .cv-skill-label { font-weight: 700; }
  .cv-entry { margin-bottom: 7px; }
  .cv-entry-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .cv-entry-title { font-weight: 700; }
  .cv-entry-date { font-size: 9pt; color: #555; white-space: nowrap; }
  .cv-entry-sub { font-size: 9.5pt; color: #444; }
  .cv-tech { font-size: 9pt; color: #666; font-style: italic; margin-top: 1px; }
  .cv-bullets { font-size: 9.8pt; }
`;

const ATS_CSS = `
  body { font-family: Arial, "Helvetica Neue", sans-serif; font-size: 10.5pt; line-height: 1.38; color: #000; }
  .cv-header { padding-bottom: 6px; border-bottom: 1px solid #000; }
  .cv-name { font-size: 20pt; font-weight: 700; }
  .cv-headline { font-size: 10.5pt; color: #222; margin-top: 1px; }
  .cv-contact { margin-top: 4px; font-size: 9pt; color: #000; }
  .cv-contact-line { margin-top: 1px; }
  .cv-section-title { font-size: 11pt; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
  .cv-summary { font-size: 10pt; }
  .cv-skill { display: block; margin: 2px 0; }
  .cv-skill-label { font-weight: 700; }
  .cv-skill-label::after { content: ": "; }
  .cv-entry { margin-bottom: 7px; }
  .cv-entry-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .cv-entry-title { font-weight: 700; }
  .cv-entry-date { font-size: 9.5pt; }
  .cv-entry-sub { font-size: 10pt; }
  .cv-tech { font-size: 9.5pt; color: #333; margin-top: 1px; }
  .cv-bullets { font-size: 10pt; }
`;

const MODERN_CSS = `
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.42; color: #20242c; }
  .cv-header { padding-bottom: 10px; border-bottom: 2px solid #1f3a5f; }
  .cv-name { font-size: 23pt; font-weight: 700; color: #1f3a5f; letter-spacing: 0.2px; }
  .cv-headline { font-size: 11pt; color: #55606f; margin-top: 2px; font-style: italic; }
  .cv-contact { margin-top: 6px; font-size: 9pt; color: #444; font-family: "Helvetica Neue", Arial, sans-serif; }
  .cv-contact-line { margin-top: 1px; }
  .cv-contact a { color: #1f3a5f; }
  .cv-section-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
    color: #1f3a5f; margin-bottom: 5px; font-family: "Helvetica Neue", Arial, sans-serif; }
  .cv-summary { font-size: 10.2pt; }
  .cv-skills { display: block; }
  .cv-skill { display: grid; grid-template-columns: 120px 1fr; gap: 8px; margin: 2px 0; }
  .cv-skill-label { font-weight: 700; color: #1f3a5f; }
  .cv-entry { margin-bottom: 8px; }
  .cv-entry-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .cv-entry-title { font-weight: 700; }
  .cv-entry-date { font-size: 9pt; color: #55606f; white-space: nowrap;
    font-family: "Helvetica Neue", Arial, sans-serif; }
  .cv-entry-sub { font-size: 9.5pt; color: #55606f; }
  .cv-tech { font-size: 9pt; color: #7a5a2e; margin-top: 1px; }
  .cv-bullets { font-size: 9.8pt; }
`;

const TEMPLATE_CSS: Record<CvTemplateId, string> = {
  classic: CLASSIC_CSS,
  ats: ATS_CSS,
  modern: MODERN_CSS,
};

/** A complete, self-contained HTML document for the chosen template — ready to
 *  drop into a print window and "Save as PDF". */
export function renderCvHtml(templateId: CvTemplateId, cv: TailoredCv): string {
  const css = TEMPLATE_CSS[templateId] ?? CLASSIC_CSS;
  const title = `${cv.name} — CV`;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
</head><body>${cvBodyHtml(cv)}</body></html>`;
}
