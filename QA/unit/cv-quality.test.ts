/**
 * Locks the CV quality gate (assessCvQuality):
 *   - blocks a CV with no capability signal (skills/experience/projects) or too few words
 *   - blocks with a SPECIFIC "add X" message
 *   - passes a usable CV, surfacing non-blocking gaps
 *   - is conservative: a thin-but-real student CV (projects, no jobs) PASSES
 */
import { describe, it, expect } from "vitest";
import { assessCvQuality } from "@/lib/cv-quality";

// A realistic-ish student CV with skills + projects + education + contact.
const FULL_CV = `
Jane Doe — jane@example.com — linkedin.com/in/jane
Education: BSc Computer Science, Birzeit University, expected 2027. GPA 3.6.
Skills: Python, JavaScript, React, SQL, Docker.
Projects: Built a task-tracker web app with React and a FastAPI backend.
Developed an image classifier in PyTorch for a course project.
Experience: Software Engineering Intern at Acme (summer 2025).
`.repeat(1);

describe("assessCvQuality — blocking", () => {
  it("blocks an empty / junk CV with no capability signal", () => {
    const r = assessCvQuality("hello there, thanks for reading this short note.");
    expect(r.usable).toBe(false);
    expect(r.blockingReason).toMatch(/couldn't find enough/i);
  });

  it("blocks a too-short blob even if it has a keyword", () => {
    const r = assessCvQuality("skills: python");
    expect(r.usable).toBe(false);
    expect(r.blockingReason).toBeTruthy();
  });

  it("names what's missing in the block message", () => {
    const r = assessCvQuality("My name is Sam. I like coffee and long walks. ".repeat(5));
    expect(r.usable).toBe(false);
    expect(r.blockingReason).toMatch(/skills|experience|projects/i);
  });
});

describe("assessCvQuality — passing", () => {
  it("passes a full CV with no gaps", () => {
    const r = assessCvQuality(FULL_CV);
    expect(r.usable).toBe(true);
    expect(r.gaps).toEqual([]);
  });

  it("is conservative: a student CV with projects but NO jobs still passes", () => {
    const studentCv = `
      Ahmed — ahmed@example.com
      Education: Computer Engineering student, Birzeit University.
      Skills: Python, C, SQL.
      Projects: built a chat app; developed a sorting visualizer; implemented a CNN.
    `;
    const r = assessCvQuality(studentCv);
    expect(r.usable).toBe(true);
    // No work/intern experience is a NOTE, not a block.
    expect(r.gaps.join(" ")).toMatch(/project/i);
  });

  it("passes but flags a missing skills section as a gap", () => {
    const noSkills = `
      Lina — lina@example.com — github.com/lina
      Education: BSc Software Engineering at Birzeit University, expected 2026.
      Experience: Backend intern at a local startup where she fixed bugs in the
      billing service, helped ship a new feature, and reviewed teammates' work.
      Projects: a personal portfolio site, a weekend scheduling app, and a small
      library she wrote and published while studying at university.
    `;
    const r = assessCvQuality(noSkills);
    expect(r.usable).toBe(true);
    expect(r.gaps.some((g) => /skills/i.test(g))).toBe(true);
  });

  it("flags missing contact details as a gap", () => {
    const noContact = `
      Education: BSc Computer Science, graduating next year with honors.
      Skills: Python, Django, PostgreSQL, Docker, Git, and basic React.
      Experience: Junior developer for two summers at a software house,
      working on backend services and internal dashboards for clients.
      Projects: several Django apps, a REST API, and a data-cleaning pipeline.
    `;
    const r = assessCvQuality(noContact);
    expect(r.usable).toBe(true);
    expect(r.gaps.some((g) => /contact|email|linkedin|github/i.test(g))).toBe(true);
  });
});
