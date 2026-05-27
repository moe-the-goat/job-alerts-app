interface SectionHeadingProps {
  step: string;
  title: string;
  subtitle: string;
}

export function SectionHeading({ step, title, subtitle }: SectionHeadingProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          Step {step}
        </span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>
      <h2 className="mt-2 text-[19px] font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}
