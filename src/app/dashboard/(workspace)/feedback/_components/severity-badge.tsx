import { AlertCircle, AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";

export type SeverityKind = "scam" | "suspicious" | "low_quality" | "trusted";

interface SeverityBadgeProps {
  kind: SeverityKind;
}

const META: Record<
  SeverityKind,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    text: string;
    ring: string;
  }
> = {
  scam: {
    label: "Scam",
    icon: ShieldAlert,
    bg: "bg-[var(--danger-400)]/15",
    text: "text-[var(--danger-400)]",
    ring: "ring-[var(--danger-400)]/40",
  },
  suspicious: {
    label: "Suspicious",
    icon: AlertCircle,
    bg: "bg-[var(--warning-400)]/15",
    text: "text-[var(--warning-400)]",
    ring: "ring-[var(--warning-400)]/40",
  },
  low_quality: {
    label: "Low signal",
    icon: AlertTriangle,
    bg: "bg-[var(--bg-overlay)]",
    text: "text-[var(--text-tertiary)]",
    ring: "ring-[var(--border-muted)]",
  },
  trusted: {
    label: "Trusted",
    icon: ShieldCheck,
    bg: "bg-[var(--success-400)]/10",
    text: "text-[var(--success-400)]",
    ring: "ring-[var(--success-400)]/30",
  },
};

export function SeverityBadge({ kind }: SeverityBadgeProps) {
  const meta = META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider ring-1 ring-inset",
        meta.bg,
        meta.text,
        meta.ring,
      ].join(" ")}
    >
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}
