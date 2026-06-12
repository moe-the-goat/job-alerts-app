"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import {
  saveCvTextAction,
  uploadCvAction,
  type CvState,
} from "@/app/actions/cv";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CvFormProps {
  initialText: string;
  initialPath: string | null;
  initialUploadedAt: string | null;
}

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function CvForm({
  initialText,
  initialPath,
  initialUploadedAt,
}: CvFormProps) {
  const [uploadState, uploadAction] = useActionState<CvState | undefined, FormData>(
    uploadCvAction,
    undefined,
  );

  // When an upload completes, swap the editor seed to the freshly-parsed
  // text. We remount the editor via `key` so React resets its internal
  // value cleanly — no useEffect / setState-in-effect.
  const editorSeed = uploadState?.ok && uploadState.preview ? uploadState.preview : initialText;
  const editorKey = uploadState?.ok && uploadState.chars
    ? `upload-${uploadState.chars}`
    : "initial";

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <section
        className="animate-fade-in-up"
        style={{ animationDelay: "60ms" }}
      >
        <SectionHeading
          step="1"
          title="Upload a file"
          subtitle="PDF or DOCX, up to 5 MB. We extract the text and discard the file from memory."
        />
        <UploadZone action={uploadAction} />

        {uploadState?.error && (
          <FormFeedback variant="error" message={uploadState.error} />
        )}
        {uploadState?.ok && uploadState.message && (
          <FormFeedback variant="success" message={uploadState.message} />
        )}

        {(initialPath || uploadState?.ok) && (
          <p className="mt-4 text-xs text-[var(--text-tertiary)]">
            <FileText className="mr-1 inline h-3 w-3 align-[-2px]" />
            {uploadState?.ok
              ? "Just uploaded · stored privately in your account."
              : initialUploadedAt
                ? `Stored privately · uploaded ${formatRelative(initialUploadedAt)}.`
                : "Stored privately in your account."}
          </p>
        )}
      </section>

      <section
        className="animate-fade-in-up"
        style={{ animationDelay: "120ms" }}
      >
        <SectionHeading
          step="2"
          title="Review or paste manually"
          subtitle="What's in this box is exactly what the AI sees. Fix anything garbled."
        />
        <CvEditor key={editorKey} initial={editorSeed} />
      </section>
    </div>
  );
}

function CvEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [saveState, saveAction] = useActionState<CvState | undefined, FormData>(
    saveCvTextAction,
    undefined,
  );

  return (
    <form action={saveAction} className="space-y-3">
      <Textarea
        name="cv_text"
        rows={18}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your CV here, or upload a file on the left and it will land here."
        className="font-mono text-[13px]"
      />

      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
        <span>
          <span className="text-[var(--text-secondary)]">
            {text.length.toLocaleString()}
          </span>{" "}
          characters
        </span>
        {saveState?.ok && (
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success-400)]" />
            Saved
          </span>
        )}
      </div>

      {saveState?.error && (
        <FormFeedback variant="error" message={saveState.error} />
      )}
      {saveState?.ok && saveState.message && (
        <FormFeedback variant="success" message={saveState.message} />
      )}

      <SaveTextButton />
    </form>
  );
}

function SectionHeading({
  step,
  title,
  subtitle,
}: {
  step: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          Step {step}
        </span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>
      <h2 className="mt-2 text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}

function UploadZone({ action }: { action: (formData: FormData) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setFileName(file.name);
    formRef.current?.requestSubmit();
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped || !inputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(dropped);
    inputRef.current.files = dt.files;
    submit();
  }

  return (
    <form ref={formRef} action={action}>
      <UploadDropZone
        inputRef={inputRef}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        fileName={fileName}
        onDrop={onDrop}
        onSelect={submit}
      />
    </form>
  );
}

interface UploadDropZoneProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  fileName: string | null;
  onDrop: (e: React.DragEvent<HTMLLabelElement>) => void;
  onSelect: () => void;
}

function UploadDropZone({
  inputRef,
  isDragging,
  setIsDragging,
  fileName,
  onDrop,
  onSelect,
}: UploadDropZoneProps) {
  const { pending } = useFormStatus();
  return (
    <label
      htmlFor="cv-file"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={[
        // A recessed "well" — the one place on the page that visually
        // invites something to be dropped into it.
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center",
        "bg-[var(--surface-recessed)]/80 shadow-[var(--shadow-recessed)]",
        "transition-all duration-200 ease-out motion-safe:will-change-transform",
        isDragging
          ? "border-[var(--accent-500)] bg-[var(--accent-500)]/10 shadow-[var(--shadow-recessed),0_0_0_3px_rgba(83,155,245,0.18)] motion-safe:scale-[1.01]"
          : "border-[var(--border-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]/50",
        pending && "pointer-events-none opacity-60",
      ].join(" ")}
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-overlay)] text-[var(--accent-400)] ring-1 ring-inset ring-[var(--border-muted)]">
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Upload className="h-5 w-5" />
        )}
      </div>
      <div className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
        {pending
          ? "Reading…"
          : fileName
            ? fileName
            : "Drop your CV here, or click to browse"}
      </div>
      <div className="mt-1.5 text-xs text-[var(--text-tertiary)]">
        PDF or DOCX · up to 5 MB
      </div>
      <input
        ref={inputRef}
        id="cv-file"
        name="cv"
        type="file"
        accept={ACCEPT}
        onChange={onSelect}
        disabled={pending}
        className="sr-only"
      />
    </label>
  );
}

function SaveTextButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="md">
      {!pending && <Save className="h-4 w-4" />}
      {pending ? "Saving…" : "Save text"}
    </Button>
  );
}

function FormFeedback({
  variant,
  message,
}: {
  variant: "error" | "success";
  message: string;
}) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle2;
  const color =
    variant === "error" ? "text-[var(--danger-400)]" : "text-[var(--success-400)]";
  return (
    <p className={`mt-3 flex items-start gap-1.5 text-xs leading-relaxed ${color}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString();
}
