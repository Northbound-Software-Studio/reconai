import type Anthropic from "@anthropic-ai/sdk";
import { callTool } from "@/lib/anthropic";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type { ExtractedInvoice } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const SYSTEM = `You are a meticulous accounts-payable clerk. You read a single vendor invoice (a PDF or image) and transcribe it into structured data EXACTLY as printed. Rules:
- Copy every billable line item in order. Use the amount printed on the line, even if it looks wrong — do NOT recompute or "fix" numbers. Downstream checks depend on seeing the invoice's real figures.
- quantity and unitPrice are the printed values; amount is the printed line total.
- subtotal, tax, and total are the printed document totals. If a field is absent, use 0.
- currency is the 3-letter code (default USD). Dates as printed.
- Do not invent lines that aren't there. Do not merge or split lines.`;

const SCHEMA: Anthropic.Messages.Tool.InputSchema = {
  type: "object",
  properties: {
    vendor: { type: "string", description: "Billing vendor / supplier name" },
    invoiceNumber: { type: "string" },
    invoiceDate: { type: "string" },
    currency: { type: "string", description: "3-letter code, e.g. USD" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          amount: { type: "number", description: "Printed line total" },
        },
        required: ["description", "quantity", "unitPrice", "amount"],
      },
    },
    subtotal: { type: "number" },
    tax: { type: "number" },
    total: { type: "number" },
  },
  required: [
    "vendor",
    "invoiceNumber",
    "invoiceDate",
    "currency",
    "lineItems",
    "subtotal",
    "tax",
    "total",
  ],
};

export async function POST(req: Request) {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    return Response.json(
      { error: `Rate limit reached. Try again in ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }

  let body: { fileBase64?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { fileBase64, mediaType } = body;
  if (!fileBase64 || !mediaType) {
    return Response.json(
      { error: "Missing fileBase64 or mediaType." },
      { status: 400 },
    );
  }

  // Rough base64 -> byte size guard.
  const approxBytes = Math.floor((fileBase64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return Response.json(
      { error: "File too large. Please use a document under 8 MB." },
      { status: 413 },
    );
  }

  const isPdf = mediaType === "application/pdf";
  const isImage = mediaType.startsWith("image/");
  if (!isPdf && !isImage) {
    return Response.json(
      { error: "Only PDF or image invoices are supported." },
      { status: 415 },
    );
  }

  const content: Anthropic.Messages.ContentBlockParam[] = [
    isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileBase64,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: fileBase64,
          },
        },
    {
      type: "text",
      text: "Transcribe this invoice into the record_invoice tool exactly as printed.",
    },
  ];

  try {
    const invoice = await callTool<ExtractedInvoice>({
      system: SYSTEM,
      content,
      toolName: "record_invoice",
      toolDescription: "Record the structured contents of the invoice.",
      schema: SCHEMA,
      maxTokens: 12000,
    });
    return Response.json({ invoice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return Response.json({ error: message }, { status });
  }
}
