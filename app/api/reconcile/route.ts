import type Anthropic from "@anthropic-ai/sdk";
import { callTool } from "@/lib/anthropic";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { reconcile } from "@/lib/reconcile";
import type {
  ExtractedInvoice,
  MatchPair,
  PurchaseOrder,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You align invoice line items to purchase-order (PO) line items for a procurement audit. Descriptions rarely match word-for-word: vendors abbreviate, reorder words, use synonyms, or split/merge wording ("Std Parking Fee - Lot 4" vs "Monthly parking, Lot #4"; "Asphalt seal-coat" vs "Sealcoating - asphalt").

Your ONLY job is to decide, for each invoice line, which PO line describes the SAME good or service.
- Match on the nature of the item, NOT on price or amount (prices may legitimately disagree — that's what the audit checks).
- Each PO line may be used at most once. Pick the single best PO line per invoice line.
- If an invoice line has no plausible PO counterpart, set poId to null.
- confidence is 0..1: 1.0 = obviously the same item, ~0.5 = plausible but ambiguous, <0.3 = weak.
Return one entry for every invoice line.`;

const SCHEMA: Anthropic.Messages.Tool.InputSchema = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          invoiceIndex: { type: "integer" },
          poId: { type: ["string", "null"] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["invoiceIndex", "poId", "confidence"],
      },
    },
  },
  required: ["matches"],
};

export async function POST(req: Request) {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    return Response.json(
      { error: `Rate limit reached. Try again in ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }

  let body: { invoice?: ExtractedInvoice; po?: PurchaseOrder };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { invoice, po } = body;
  if (!invoice?.lineItems || !po?.lines) {
    return Response.json(
      { error: "Missing invoice or purchase order." },
      { status: 400 },
    );
  }

  // Give the matcher only what it needs: descriptions + quantities to
  // disambiguate near-duplicates. Prices are withheld on purpose.
  const invoiceList = invoice.lineItems
    .map((l, i) => `  [${i}] "${l.description}" (qty ${l.quantity})`)
    .join("\n");
  const poList = po.lines
    .map((l) => `  {${l.id}} "${l.description}" (qty ${l.quantity})`)
    .join("\n");

  const prompt = `INVOICE LINES (index in brackets):\n${invoiceList}\n\nPURCHASE ORDER LINES (id in braces):\n${poList}\n\nReturn a match for every invoice index using the map_lines tool.`;

  let matches: MatchPair[];
  try {
    const out = await callTool<{ matches: MatchPair[] }>({
      system: SYSTEM,
      content: [{ type: "text", text: prompt }],
      toolName: "map_lines",
      toolDescription:
        "Record the best PO line match for each invoice line item.",
      schema: SCHEMA,
      maxTokens: 8000,
    });
    matches = out.matches ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Matching failed.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return Response.json({ error: message }, { status });
  }

  // Enforce "each PO line used at most once", keeping the highest-confidence
  // claim — defensive, in case the model reused an id.
  const claimed = new Map<string, MatchPair>();
  for (const m of matches) {
    if (!m.poId) continue;
    const prev = claimed.get(m.poId);
    if (!prev || m.confidence > prev.confidence) claimed.set(m.poId, m);
  }
  const cleaned: MatchPair[] = matches.map((m) => {
    if (m.poId && claimed.get(m.poId) !== m) {
      return { ...m, poId: null };
    }
    return m;
  });

  const result = reconcile(invoice, po, cleaned);
  return Response.json({ result });
}
