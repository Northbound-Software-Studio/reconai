"use client";

import { fmt } from "@/lib/reconcile";
import type { ReconciledLine, ReconciliationResult } from "@/lib/types";
import { RecommendationBadge, SeverityDot, Stat } from "./ui";

function lineBorder(sev: ReconciledLine["severity"]) {
  return sev === "flag"
    ? "var(--brick)"
    : sev === "warn"
      ? "var(--amber)"
      : "var(--line-strong)";
}

export function Results({ result }: { result: ReconciliationResult }) {
  const { summary, currency } = result;
  const varTone =
    Math.abs(summary.variance) < 0.01
      ? "ink"
      : summary.variance > 0
        ? "brick"
        : "amber";

  return (
    <section className="rise mt-10">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Reconciliation
        </span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <div className="card rounded-xl">
        {/* Verdict + narrative */}
        <div className="flex flex-col gap-4 border-b border-line p-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <RecommendationBadge rec={result.recommendation} />
            <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
              {result.narrative}
            </p>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line md:grid-cols-5 md:divide-y-0">
          <Stat
            label="Invoice total"
            value={fmt(summary.invoiceTotal, currency)}
          />
          <Stat
            label="PO authorized"
            value={fmt(summary.expectedTotal, currency)}
          />
          <Stat
            label="Variance"
            tone={varTone}
            value={`${summary.variance > 0 ? "+" : ""}${fmt(
              summary.variance,
              currency,
            )}`}
          />
          <Stat
            label="Overbilled"
            tone={summary.overbilledAmount > 0.01 ? "brick" : "ink"}
            value={fmt(summary.overbilledAmount, currency)}
          />
          <Stat
            label="Issues"
            tone={summary.flagCount > 0 ? "brick" : "ink"}
            value={`${summary.flagCount} flag${
              summary.flagCount === 1 ? "" : "s"
            }`}
            sub={`${summary.warnCount} to confirm`}
          />
        </div>

        {/* Line-by-line */}
        <ul className="p-3 sm:p-4">
          {result.lines.map((line, i) => (
            <li
              key={i}
              className="rise mb-2 rounded-lg bg-paper/40 p-3 sm:p-4"
              style={{
                borderLeft: `3px solid ${lineBorder(line.severity)}`,
                animationDelay: `${Math.min(i * 45, 360)}ms`,
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex items-center gap-2.5">
                  <SeverityDot severity={line.severity} />
                  <span className="text-[14.5px] font-medium">
                    {line.description}
                  </span>
                  {line.invoiceIndex === null ? (
                    <span className="font-mono rounded bg-amber-soft px-1.5 py-0.5 text-[10px] text-amber">
                      PO ONLY
                    </span>
                  ) : line.poId === null ? (
                    <span className="font-mono rounded bg-brick-soft px-1.5 py-0.5 text-[10px] text-brick">
                      NOT ON PO
                    </span>
                  ) : null}
                </div>
                {line.invoiceAmount != null ? (
                  <span className="font-mono tnum text-[13px] text-ink-soft">
                    {fmt(line.invoiceAmount, currency)}
                  </span>
                ) : null}
              </div>

              {/* Compare row */}
              {line.invoiceIndex !== null && line.poId !== null ? (
                <div className="font-mono mt-2 flex flex-wrap gap-x-5 gap-y-1 pl-[18px] text-[12px] text-ink-faint">
                  <Compare
                    label="qty"
                    a={line.invoiceQty}
                    b={line.poQty}
                  />
                  <Compare
                    label="unit"
                    a={line.invoiceUnitPrice}
                    b={line.poUnitPrice}
                    money
                    currency={currency}
                  />
                  <span>
                    match&nbsp;
                    <span style={{ color: "var(--ink-soft)" }}>
                      {(line.matchConfidence * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
              ) : null}

              {/* Discrepancy messages */}
              {line.discrepancies.length ? (
                <ul className="mt-2 space-y-1 pl-[18px]">
                  {line.discrepancies.map((d, j) => (
                    <li
                      key={j}
                      className="flex items-start gap-2 text-[12.5px] leading-snug"
                      style={{
                        color:
                          d.severity === "flag"
                            ? "var(--brick)"
                            : d.severity === "warn"
                              ? "var(--amber)"
                              : "var(--ink-soft)",
                      }}
                    >
                      <span className="mt-[3px]">
                        <SeverityDot severity={d.severity} />
                      </span>
                      <span>
                        <span className="font-medium">{d.message}.</span>{" "}
                        <span className="text-ink-soft">{d.detail}</span>
                        {d.amountImpact != null &&
                        Math.abs(d.amountImpact) > 0.01 ? (
                          <span className="font-mono">
                            {" "}
                            ({d.amountImpact > 0 ? "+" : ""}
                            {fmt(d.amountImpact, currency)})
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 pl-[18px] text-[12px] text-teal">
                  Matches PO at agreed price and quantity.
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Compare({
  label,
  a,
  b,
  money,
  currency = "USD",
}: {
  label: string;
  a?: number;
  b?: number;
  money?: boolean;
  currency?: string;
}) {
  if (a == null || b == null) return null;
  const same = Math.abs(a - b) < (money ? 0.01 : 1e-6);
  const show = (n: number) => (money ? fmt(n, currency) : String(n));
  return (
    <span>
      {label}&nbsp;
      <span style={{ color: same ? "var(--ink-soft)" : "var(--brick)" }}>
        {show(a)}
      </span>
      <span className="opacity-50"> vs </span>
      <span>{show(b)}</span>
    </span>
  );
}
