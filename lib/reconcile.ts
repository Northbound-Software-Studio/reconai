import type {
  Discrepancy,
  ExtractedInvoice,
  MatchPair,
  PurchaseOrder,
  ReconciledLine,
  ReconciliationResult,
  Recommendation,
  Severity,
} from "./types";

// ---------------------------------------------------------------------------
// Deterministic reconciliation engine.
//
// Design principle: the LLM is ONLY trusted to decide which invoice line maps
// to which PO line (a fuzzy, semantic judgment). Every number — price deltas,
// quantity deltas, line math, subtotals, tax, totals, the overbilled figure,
// and the final Approve/Hold/Reject decision — is computed here, in plain
// deterministic TypeScript, so the result is auditable and reproducible.
// ---------------------------------------------------------------------------

const CENT = 0.01;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => round2(n);
const near = (a: number, b: number, tol = CENT) => Math.abs(a - b) <= tol;

const worst = (a: Severity, b: Severity): Severity => {
  const rank: Record<Severity, number> = { ok: 0, warn: 1, flag: 2 };
  return rank[a] >= rank[b] ? a : b;
};

export function reconcile(
  invoice: ExtractedInvoice,
  po: PurchaseOrder,
  matches: MatchPair[],
): ReconciliationResult {
  const lines: ReconciledLine[] = [];
  const allDiscrepancies: Discrepancy[] = [];
  const currency = invoice.currency || "USD";

  // Fast lookup for PO lines and which ones got consumed by a match.
  const poById = new Map(po.lines.map((l) => [l.id, l]));
  const matchedPoIds = new Set<string>();
  const matchByInvoiceIndex = new Map<number, MatchPair>();
  for (const m of matches) matchByInvoiceIndex.set(m.invoiceIndex, m);

  let overbilledAmount = 0;

  // --- Walk each invoice line ---
  invoice.lineItems.forEach((inv, i) => {
    const discs: Discrepancy[] = [];
    let severity: Severity = "ok";

    const match = matchByInvoiceIndex.get(i);
    const po_ = match && match.poId ? poById.get(match.poId) : undefined;

    // Line-level math check (independent of the PO): qty * unitPrice == amount?
    // Note: the dollar impact is folded into the per-line "billed vs authorized"
    // calculation below, so we do NOT add it to overbilledAmount here (that
    // would double-count the same dollars).
    const computed = round2(inv.quantity * inv.unitPrice);
    if (!near(computed, inv.amount)) {
      const impact = round2(inv.amount - computed);
      const d: Discrepancy = {
        code: "LINE_MATH_ERROR",
        severity: "flag",
        message: `Line total doesn't match qty × unit price`,
        detail: `${inv.quantity} × ${fmt(inv.unitPrice, currency)} = ${fmt(
          computed,
          currency,
        )}, but the invoice shows ${fmt(inv.amount, currency)}.`,
        amountImpact: impact,
      };
      discs.push(d);
      severity = worst(severity, "flag");
    }

    if (!po_) {
      // Billed for something that isn't on the purchase order at all.
      const d: Discrepancy = {
        code: "UNEXPECTED_LINE",
        severity: "flag",
        message: `Line not found on the purchase order`,
        detail: `"${inv.description}" was billed (${fmt(
          inv.amount,
          currency,
        )}) but no matching PO line was authorized.`,
        amountImpact: inv.amount,
      };
      discs.push(d);
      severity = worst(severity, "flag");
      overbilledAmount += Math.max(0, inv.amount);
    } else {
      matchedPoIds.add(po_.id);

      // Low-confidence semantic match — worth a human glance.
      if (match && match.confidence < 0.6) {
        discs.push({
          code: "LOW_CONFIDENCE_MATCH",
          severity: "warn",
          message: `Uncertain match to PO line`,
          detail: `Matched "${inv.description}" to "${po_.description}" with ${(
            match.confidence * 100
          ).toFixed(0)}% confidence.`,
        });
        severity = worst(severity, "warn");
      }

      // Unit price check.
      if (!near(inv.unitPrice, po_.unitPrice)) {
        const impact = round2((inv.unitPrice - po_.unitPrice) * inv.quantity);
        discs.push({
          code: "PRICE_MISMATCH",
          severity: "flag",
          message: `Unit price differs from PO`,
          detail: `Billed ${fmt(inv.unitPrice, currency)}/unit vs PO price ${fmt(
            po_.unitPrice,
            currency,
          )}/unit.`,
          amountImpact: impact,
        });
        severity = worst(severity, "flag");
      }

      // Quantity check.
      if (!near(inv.quantity, po_.quantity, 1e-6)) {
        const over = inv.quantity > po_.quantity;
        const impact = round2((inv.quantity - po_.quantity) * po_.unitPrice);
        discs.push({
          code: "QTY_MISMATCH",
          severity: over ? "flag" : "warn",
          message: over
            ? `Billed more units than ordered`
            : `Billed fewer units than ordered`,
          detail: `Invoice qty ${inv.quantity} vs PO qty ${po_.quantity}.`,
          amountImpact: impact,
        });
        severity = worst(severity, over ? "flag" : "warn");
      }

      // Per-line overbilling vs what the PO authorized.
      const authorized = round2(po_.unitPrice * po_.quantity);
      const lineOverbill = round2(inv.amount - authorized);
      if (lineOverbill > CENT) overbilledAmount += lineOverbill;
    }

    for (const d of discs) allDiscrepancies.push(d);

    lines.push({
      invoiceIndex: i,
      poId: po_?.id ?? null,
      description: inv.description,
      matchConfidence: match?.confidence ?? 0,
      severity,
      discrepancies: discs,
      invoiceQty: inv.quantity,
      poQty: po_?.quantity,
      invoiceUnitPrice: inv.unitPrice,
      poUnitPrice: po_?.unitPrice,
      invoiceAmount: inv.amount,
    });
  });

  // --- PO lines that were never billed (ordered but missing from invoice) ---
  for (const po_ of po.lines) {
    if (matchedPoIds.has(po_.id)) continue;
    const d: Discrepancy = {
      code: "UNBILLED_PO_LINE",
      severity: "warn",
      message: `PO line not billed on this invoice`,
      detail: `"${po_.description}" (${po_.quantity} × ${fmt(
        po_.unitPrice,
        currency,
      )}) was ordered but does not appear on the invoice.`,
      amountImpact: round2(-po_.unitPrice * po_.quantity),
    };
    allDiscrepancies.push(d);
    lines.push({
      invoiceIndex: null,
      poId: po_.id,
      description: po_.description,
      matchConfidence: 1,
      severity: "warn",
      discrepancies: [d],
      poQty: po_.quantity,
      poUnitPrice: po_.unitPrice,
    });
  }

  // --- Document-level math: subtotal, tax, total ---
  const summedLineAmounts = round2(
    invoice.lineItems.reduce((s, l) => s + l.amount, 0),
  );
  if (!near(summedLineAmounts, invoice.subtotal, 0.02)) {
    allDiscrepancies.push({
      code: "SUBTOTAL_ERROR",
      severity: "flag",
      message: `Subtotal doesn't equal the sum of line items`,
      detail: `Line items sum to ${fmt(
        summedLineAmounts,
        currency,
      )}, but the stated subtotal is ${fmt(invoice.subtotal, currency)}.`,
      amountImpact: round2(invoice.subtotal - summedLineAmounts),
    });
  }

  const expectedTax = round2(invoice.subtotal * po.taxRate);
  if (po.taxRate > 0 && !near(invoice.tax, expectedTax, 0.02)) {
    allDiscrepancies.push({
      code: "TAX_ERROR",
      severity: "warn",
      message: `Tax differs from the expected rate`,
      detail: `Expected ${(po.taxRate * 100).toFixed(2)}% of ${fmt(
        invoice.subtotal,
        currency,
      )} = ${fmt(expectedTax, currency)}, but the invoice shows ${fmt(
        invoice.tax,
        currency,
      )}.`,
      amountImpact: round2(invoice.tax - expectedTax),
    });
  }

  const computedTotal = round2(invoice.subtotal + invoice.tax);
  if (!near(computedTotal, invoice.total, 0.02)) {
    allDiscrepancies.push({
      code: "TOTAL_ERROR",
      severity: "flag",
      message: `Total doesn't equal subtotal + tax`,
      detail: `${fmt(invoice.subtotal, currency)} + ${fmt(
        invoice.tax,
        currency,
      )} = ${fmt(computedTotal, currency)}, but the invoice total is ${fmt(
        invoice.total,
        currency,
      )}.`,
      amountImpact: round2(invoice.total - computedTotal),
    });
  }

  // --- Expected total from the PO (the authorized spend) ---
  const expectedSubtotal = round2(
    po.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  );
  const expectedTotal = round2(expectedSubtotal * (1 + po.taxRate));
  const variance = round2(invoice.total - expectedTotal);

  const flagCount = allDiscrepancies.filter((d) => d.severity === "flag").length;
  const warnCount = allDiscrepancies.filter((d) => d.severity === "warn").length;

  const recommendation = decide({
    flagCount,
    overbilledAmount: round2(overbilledAmount),
    expectedTotal,
    hasFootingError: allDiscrepancies.some((d) =>
      ["SUBTOTAL_ERROR", "TOTAL_ERROR", "LINE_MATH_ERROR"].includes(d.code),
    ),
    warnCount,
  });

  const summary = {
    invoiceTotal: money(invoice.total),
    expectedTotal,
    variance,
    overbilledAmount: round2(overbilledAmount),
    flagCount,
    warnCount,
    matchedLines: matchedPoIds.size,
  };

  const narrative = buildNarrative(
    recommendation,
    summary,
    allDiscrepancies,
    currency,
  );

  // Sort lines: flags first, then warns, then clean — matches how a reviewer scans.
  const rank: Record<Severity, number> = { flag: 0, warn: 1, ok: 2 };
  lines.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    lines,
    discrepancies: allDiscrepancies,
    recommendation,
    summary,
    narrative,
    currency,
  };
}

function decide(x: {
  flagCount: number;
  overbilledAmount: number;
  expectedTotal: number;
  hasFootingError: boolean;
  warnCount: number;
}): Recommendation {
  const materiality = Math.max(50, x.expectedTotal * 0.01);
  if (x.hasFootingError || x.overbilledAmount > materiality) return "REJECT";
  if (x.flagCount > 0 || x.warnCount > 0) return "HOLD";
  return "APPROVE";
}

function buildNarrative(
  rec: Recommendation,
  summary: ReconciliationResult["summary"],
  discs: Discrepancy[],
  currency: string,
): string {
  const flags = discs.filter((d) => d.severity === "flag");
  const warns = discs.filter((d) => d.severity === "warn");

  if (rec === "APPROVE") {
    return `Every invoice line matched an authorized PO line at the agreed price and quantity, and the document's math checks out. Invoice total ${fmt(
      summary.invoiceTotal,
      currency,
    )} matches the expected ${fmt(
      summary.expectedTotal,
      currency,
    )}. Safe to approve.`;
  }

  const parts: string[] = [];
  parts.push(
    rec === "REJECT"
      ? `Do not pay as-is.`
      : `Hold for review before paying.`,
  );

  if (summary.overbilledAmount > 0.01) {
    parts.push(
      `The invoice appears to overbill by ${fmt(
        summary.overbilledAmount,
        currency,
      )} against what the PO authorized.`,
    );
  } else if (summary.variance !== 0) {
    const dir = summary.variance > 0 ? "above" : "below";
    parts.push(
      `The total is ${fmt(
        Math.abs(summary.variance),
        currency,
      )} ${dir} the ${fmt(summary.expectedTotal, currency)} authorized by the PO.`,
    );
  }

  if (flags.length) {
    const top = flags.slice(0, 3).map((d) => d.message.toLowerCase());
    parts.push(
      `${flags.length} issue${flags.length > 1 ? "s" : ""} need${
        flags.length > 1 ? "" : "s"
      } attention: ${top.join("; ")}${flags.length > 3 ? "; and more" : ""}.`,
    );
  }
  if (warns.length) {
    parts.push(
      `${warns.length} lower-priority note${warns.length > 1 ? "s" : ""} to confirm.`,
    );
  }

  return parts.join(" ");
}

export function fmt(n: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
