import type { Recommendation, Severity } from "@/lib/types";

export function SeverityDot({ severity }: { severity: Severity }) {
  const color =
    severity === "flag"
      ? "var(--brick)"
      : severity === "warn"
        ? "var(--amber)"
        : "var(--teal)";
  return (
    <span
      aria-hidden
      style={{ background: color }}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
    />
  );
}

export function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono flex h-6 w-6 items-center justify-center rounded-full border border-line-strong text-[12px] text-ink-soft">
        {n}
      </span>
      <h2 className="font-display text-[19px] leading-none tracking-tight">
        {children}
      </h2>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "ink",
  sub,
}: {
  label: string;
  value: string;
  tone?: "ink" | "teal" | "brick" | "amber";
  sub?: string;
}) {
  const color =
    tone === "teal"
      ? "var(--teal)"
      : tone === "brick"
        ? "var(--brick)"
        : tone === "amber"
          ? "var(--amber)"
          : "var(--ink)";
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </div>
      <div
        className="font-mono tnum text-[20px] leading-none"
        style={{ color }}
      >
        {value}
      </div>
      {sub ? <div className="text-[11px] text-ink-faint">{sub}</div> : null}
    </div>
  );
}

const REC_STYLE: Record<
  Recommendation,
  { bg: string; fg: string; label: string; blurb: string }
> = {
  APPROVE: {
    bg: "var(--teal-soft)",
    fg: "var(--teal)",
    label: "Approve",
    blurb: "Clean to pay",
  },
  HOLD: {
    bg: "var(--amber-soft)",
    fg: "var(--amber)",
    label: "Hold",
    blurb: "Review before paying",
  },
  REJECT: {
    bg: "var(--brick-soft)",
    fg: "var(--brick)",
    label: "Reject",
    blurb: "Do not pay as-is",
  },
};

export function RecommendationBadge({ rec }: { rec: Recommendation }) {
  const s = REC_STYLE[rec];
  return (
    <div
      className="flex items-center gap-3 rounded-full px-5 py-2"
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: s.fg }}
      />
      <span className="font-display text-[18px] leading-none">{s.label}</span>
      <span className="text-[12px] opacity-70">· {s.blurb}</span>
    </div>
  );
}
