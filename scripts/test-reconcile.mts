import assert from "node:assert";
import { reconcile, fmt } from "../lib/reconcile.ts";
import { SAMPLE_INVOICE, SAMPLE_PO, SAMPLE_MATCHES } from "../lib/sampleData.ts";

const r = reconcile(SAMPLE_INVOICE, SAMPLE_PO, SAMPLE_MATCHES);

console.log("Recommendation:", r.recommendation);
console.log("Invoice total :", fmt(r.summary.invoiceTotal));
console.log("PO authorized :", fmt(r.summary.expectedTotal));
console.log("Variance      :", fmt(r.summary.variance));
console.log("Overbilled    :", fmt(r.summary.overbilledAmount));
console.log("Flags / warns :", r.summary.flagCount, "/", r.summary.warnCount);
console.log("\nDiscrepancy codes:");
for (const d of r.discrepancies) console.log("  -", d.code, `(${d.severity})`, d.amountImpact ?? "");

// --- Assertions ---
assert.strictEqual(r.recommendation, "REJECT", "should reject");
// PO: subtotal 3191.00 + 6.35% tax (202.63) = 3393.63
assert.strictEqual(r.summary.expectedTotal, 3393.63, "expected total (PO)");
assert.strictEqual(r.summary.invoiceTotal, 3647.81, "invoice total");
assert.strictEqual(r.summary.variance, 254.18, "variance");

// Overbilled = price(72) + qty(252) + math(40) + unexpected(250) = 614
assert.strictEqual(r.summary.overbilledAmount, 614, "overbilled amount");

const codes = r.discrepancies.map((d) => d.code).sort();
for (const expected of [
  "PRICE_MISMATCH",
  "QTY_MISMATCH",
  "LINE_MATH_ERROR",
  "UNEXPECTED_LINE",
  "UNBILLED_PO_LINE",
]) {
  assert.ok(codes.includes(expected), `missing ${expected}`);
}

// Clean document-level math => no subtotal/tax/total errors
for (const bad of ["SUBTOTAL_ERROR", "TAX_ERROR", "TOTAL_ERROR"]) {
  assert.ok(!codes.includes(bad), `unexpected ${bad}`);
}

// Line [0] should be perfectly clean
const clean = r.lines.find((l) => l.description === "Repaint standard parking stalls");
assert.ok(clean && clean.severity === "ok" && clean.discrepancies.length === 0, "line 0 clean");

console.log("\n✅ All reconciliation assertions passed.");
