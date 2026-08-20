// ---- Core domain types shared by the API routes and the UI ----

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number; // as printed on the invoice (may disagree with qty*unitPrice)
}

export interface ExtractedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface POLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseOrder {
  poNumber: string;
  vendor: string;
  lines: POLine[];
  taxRate: number; // e.g. 0.06 for 6%
}

// ---- Reconciliation output ----

export type Severity = "ok" | "warn" | "flag";

export interface Discrepancy {
  code:
    | "PRICE_MISMATCH"
    | "QTY_MISMATCH"
    | "LINE_MATH_ERROR"
    | "UNBILLED_PO_LINE"
    | "UNEXPECTED_LINE"
    | "SUBTOTAL_ERROR"
    | "TAX_ERROR"
    | "TOTAL_ERROR"
    | "LOW_CONFIDENCE_MATCH";
  severity: Severity;
  message: string;
  detail?: string;
  amountImpact?: number; // signed $ impact of this issue (positive = overbilled)
}

export interface ReconciledLine {
  invoiceIndex: number | null; // index into invoice.lineItems, or null if PO-only
  poId: string | null; // matched PO line id, or null if invoice-only
  description: string;
  matchConfidence: number; // 0..1 from the semantic matcher
  severity: Severity;
  discrepancies: Discrepancy[];
  // snapshot of the compared numbers for the UI
  invoiceQty?: number;
  poQty?: number;
  invoiceUnitPrice?: number;
  poUnitPrice?: number;
  invoiceAmount?: number;
}

export type Recommendation = "APPROVE" | "HOLD" | "REJECT";

export interface ReconciliationResult {
  lines: ReconciledLine[];
  discrepancies: Discrepancy[]; // flat list, all issues
  recommendation: Recommendation;
  summary: {
    invoiceTotal: number;
    expectedTotal: number;
    variance: number; // invoiceTotal - expectedTotal
    overbilledAmount: number; // sum of positive amount impacts
    flagCount: number;
    warnCount: number;
    matchedLines: number;
  };
  narrative: string;
  currency: string;
}

// A single mapping produced by the LLM semantic matcher.
export interface MatchPair {
  invoiceIndex: number;
  poId: string | null;
  confidence: number;
}
