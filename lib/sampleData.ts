import type { ExtractedInvoice, MatchPair, PurchaseOrder } from "./types";

// A realistic, on-theme sample: a parking-lot striping vendor billing a parking
// operator. The invoice deliberately contains one of every discrepancy type so
// the demo shows the full range of what the engine catches. Descriptions are
// worded differently from the PO on purpose, to exercise the semantic matcher.

export const SAMPLE_PO: PurchaseOrder = {
  poNumber: "PO-2026-0417",
  vendor: "Nutmeg Sign & Striping LLC",
  taxRate: 0.0635, // Connecticut sales tax, 6.35%
  lines: [
    {
      id: "P1",
      description: "Line striping — standard stall (repaint)",
      quantity: 240,
      unitPrice: 4.5,
    },
    {
      id: "P2",
      description: "ADA stall restencil (blue)",
      quantity: 12,
      unitPrice: 28.0,
    },
    {
      id: "P3",
      description: "Wheel stop replacement",
      quantity: 20,
      unitPrice: 42.0,
    },
    {
      id: "P4",
      description: "Directional arrow — thermoplastic",
      quantity: 16,
      unitPrice: 35.0,
    },
    {
      id: "P5",
      description: "Curb painting — yellow (linear ft)",
      quantity: 300,
      unitPrice: 1.25,
    },
  ],
};

// What Claude would extract from public/sample-invoice.pdf.
export const SAMPLE_INVOICE: ExtractedInvoice = {
  vendor: "Nutmeg Sign & Striping LLC",
  invoiceNumber: "INV-4821",
  invoiceDate: "2026-07-18",
  currency: "USD",
  lineItems: [
    // clean match
    {
      description: "Repaint standard parking stalls",
      quantity: 240,
      unitPrice: 4.5,
      amount: 1080.0,
    },
    // price mismatch: billed $34/unit vs PO $28
    {
      description: "ADA handicap stall re-stencil (blue)",
      quantity: 12,
      unitPrice: 34.0,
      amount: 408.0,
    },
    // quantity mismatch: 26 billed vs 20 ordered
    {
      description: "Wheel stops - replace",
      quantity: 26,
      unitPrice: 42.0,
      amount: 1092.0,
    },
    // line math error: 16 × 35 = 560, but the line shows 600
    {
      description: "Thermoplastic directional arrows",
      quantity: 16,
      unitPrice: 35.0,
      amount: 600.0,
    },
    // unexpected line: not on the PO at all
    {
      description: "Mobilization / trip charge",
      quantity: 1,
      unitPrice: 250.0,
      amount: 250.0,
    },
  ],
  subtotal: 3430.0, // = 1080 + 408 + 1092 + 600 + 250 (foots correctly)
  tax: 217.81, // 6.35% of 3430
  total: 3647.81, // subtotal + tax (foots correctly)
  // Note: P5 "Curb painting" was ordered but never billed → flagged as unbilled.
};

// The semantic mapping the LLM matcher would produce for the sample. Used only
// by the client-side "See a sample result" preview, which then runs the SAME
// deterministic engine the server uses.
export const SAMPLE_MATCHES: MatchPair[] = [
  { invoiceIndex: 0, poId: "P1", confidence: 0.97 },
  { invoiceIndex: 1, poId: "P2", confidence: 0.93 },
  { invoiceIndex: 2, poId: "P3", confidence: 0.95 },
  { invoiceIndex: 3, poId: "P4", confidence: 0.92 },
  { invoiceIndex: 4, poId: null, confidence: 0.15 },
];
