"use client";

import * as React from "react";
import { Check, Copy, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { tailorCvAction, type TailorState } from "@/app/actions/tailor";
import {
  CV_TEMPLATES,
  DEFAULT_TEMPLATE,
  cvToText,
  parseTailoredCv,
  renderCvHtml,
  type CvTemplateId,
  type TailoredCv,
} from "@/lib/cv-templates";

/**
 * Per-job CV tailoring — lives inside the expanded job row. Two modes:
 *   • "Gap check" (suggestions) — a cheap plain-text list of what to fix.
 *   • "Tailored draft" (recreate) — one generation returns a STRUCTURED CV
 *     that we show as copyable text AND render into a template you pick to
 *     download as a PDF. Repeat clicks are served from the server cache until
 *     the CV changes. Nothing here is invented — it only reuses the real CV.
 */
export function CvTailorPanel({ jobResultId }: { jobResultId: number }) {
  const [busy, setBusy] = React.useState<"suggestions" | "recreate" | null>(null);
  const [result, setResult] = React.useState<
    (TailorState & { mode: "suggestions" | "recreate" }) | null
  >(null);
  const [copied, setCopied] = React.useState(false);

  function run(mode: "suggestions" | "recreate") {
    if (busy) return;
    setBusy(mode);
    setCopied(false);
    const fd = new FormData();
    fd.set("job_result_id", String(jobResultId));
    fd.set("mode", mode);
    tailorCvAction(undefined, fd)
      .then((res) => setResult({ ...res, mode }))
      .catch(() =>
        setResult({ ok: false, error: "Something went wrong. Try again.", mode }),
      )
      .finally(() => setBusy(null));
  }

  // For a tailored draft, try to read the structured CV; if it doesn't parse
  // (e.g. an older cached plain-text draft) we fall back to showing raw text.
  const cv: TailoredCv | null =
    result?.ok && result.mode === "recreate" && result.content
      ? parseTailoredCv(result.content)
      : null;
  const displayText = cv
    ? cvToText(cv)
    : result?.ok
      ? (result.content ?? "")
      : "";

  function copy() {
    if (!displayText) return;
    navigator.clipboard?.writeText(displayText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="mt-3 rounded-lg bg-[var(--bg-elevated)]/70 p-3 shadow-[var(--shadow-recessed)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Tailor your CV for this job
        </p>
        <div className="flex items-center gap-1.5">
          <TailorButton
            icon={Sparkles}
            label="Gap check"
            title="What this posting wants that your CV doesn't show — and what to fix."
            loading={busy === "suggestions"}
            disabled={busy !== null}
            onClick={() => run("suggestions")}
          />
          <TailorButton
            icon={FileText}
            label="Tailored draft"
            title="A one-page CV rebuilt for this job — copy the text or download a PDF (max 3/day)."
            loading={busy === "recreate"}
            disabled={busy !== null}
            onClick={() => run("recreate")}
          />
        </div>
      </div>

      {result && !result.ok && (
        <p className="mt-2 text-[11.5px] text-[var(--danger-400)]">{result.error}</p>
      )}

      {result?.ok && displayText && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10.5px] text-[var(--text-tertiary)]">
              {result.mode === "recreate" ? "Tailored CV draft" : "Gap check"}
              {result.cached
                ? " · from cache (free)"
                : typeof result.remaining === "number"
                  ? ` · ${result.remaining} left today`
                  : ""}
              {" · nothing here is invented — it only reuses your real CV"}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-[var(--success-400)]" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy text
                </>
              )}
            </button>
          </div>

          <pre className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-[var(--surface-recessed)] p-3 font-sans text-[12px] leading-relaxed text-[var(--text-secondary)] shadow-[var(--shadow-recessed)]">
            {displayText}
          </pre>

          {cv && <DownloadBar cv={cv} />}
        </div>
      )}
    </div>
  );
}

// A4 at 96dpi — the natural pixel size of the rendered CV page. The live
// preview renders at this size and is scaled down to fit the panel.
const PAGE_W = 794;
const PAGE_H = 1123;

/** Template picker with a LIVE preview of the selected template, plus a
 *  fixed-position download. "Download" prints the preview iframe directly —
 *  no new window (so nothing to un-block) — and the browser's own "Save as
 *  PDF" produces the file at the template's exact one-page layout. */
function DownloadBar({ cv }: { cv: TailoredCv }) {
  const [template, setTemplate] = React.useState<CvTemplateId>(DEFAULT_TEMPLATE);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = React.useState(0.4);

  // The document for the chosen template — the preview iframe and the print
  // both use it, so what you see is exactly what prints.
  const html = React.useMemo(() => renderCvHtml(template, cv), [template, cv]);

  // Scale the full A4 page to the panel's width so the whole CV shows.
  React.useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setScale(w / PAGE_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function download() {
    // Print the preview iframe's document directly. The CSS transform only
    // scales how it LOOKS in the panel; printing uses the document's own A4
    // @page, so the output is full size. No window.open ⇒ no pop-up blocker.
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      /* extremely rare — the live preview is right there to print manually */
    }
  }

  const active = CV_TEMPLATES.find((t) => t.id === template);

  return (
    <div className="mt-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-overlay)]/50 p-2.5">
      {/* Row 1: label + template tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Download as PDF
        </span>
        <div className="flex items-center gap-1">
          {CV_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              aria-pressed={template === t.id}
              title={t.description}
              className={
                "rounded px-2 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)] " +
                (template === t.id
                  ? "bg-[var(--accent-500)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: live preview of the selected template (the real CV, scaled) */}
      <div
        ref={frameRef}
        className="mt-2 overflow-hidden rounded-md border border-[var(--border-muted)] bg-white"
        style={{ height: Math.round(PAGE_H * scale) }}
      >
        <iframe
          ref={iframeRef}
          title={`${active?.label} template preview`}
          srcDoc={html}
          scrolling="no"
          tabIndex={-1}
          aria-hidden="true"
          style={{
            width: PAGE_W,
            height: PAGE_H,
            border: 0,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Row 3: description — its own line, so its length never moves the button */}
      <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-tertiary)]">
        {active?.description} Opens your print dialog — choose “Save as PDF”.
      </p>

      {/* Row 4: download — always in the same place */}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-500)] px-2.5 py-1.5 text-[11.5px] font-medium text-white outline-none transition-colors hover:bg-[var(--accent-400)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Download className="h-3.5 w-3.5" />
          Download {active?.label} PDF
        </button>
      </div>
    </div>
  );
}

function TailorButton({
  icon: Icon,
  label,
  title,
  loading,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-muted)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-400)]" />
      ) : (
        <Icon className="h-3 w-3 text-[var(--text-tertiary)]" />
      )}
      {label}
    </button>
  );
}
