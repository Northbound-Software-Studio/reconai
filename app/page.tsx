"use client";

import { useCallback, useRef, useState } from "react";
import { POEditor } from "@/components/POEditor";
import { Results } from "@/components/Results";
import { StepLabel } from "@/components/ui";
import { reconcile } from "@/lib/reconcile";
import { SAMPLE_INVOICE, SAMPLE_MATCHES, SAMPLE_PO } from "@/lib/sampleData";
import type {
  ExtractedInvoice,
  PurchaseOrder,
  ReconciliationResult,
} from "@/lib/types";

type Phase = "idle" | "extracting" | "reconciling";
interface Upload {
  name: string;
  base64: string;
  mediaType: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
}

export default function Home() {
  const [upload, setUpload] = useState<Upload | null>(null);
  const [invoice, setInvoice] = useState<ExtractedInvoice | null>(null);
  const [po, setPo] = useState<PurchaseOrder>(SAMPLE_PO);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";

  const acceptFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setInvoice(null);
    try {
      const base64 = await fileToBase64(file);
      setUpload({ name: file.name, base64, mediaType: file.type });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file.");
    }
  }, []);

  const loadSample = useCallback(async () => {
    setError(null);
    setResult(null);
    setInvoice(null);
    setPo(SAMPLE_PO);
    try {
      const res = await fetch("/sample-invoice.pdf");
      const blob = await res.blob();
      const file = new File([blob], "sample-invoice.pdf", {
        type: "application/pdf",
      });
      await acceptFile(file);
    } catch {
      setError("Could not load the sample file.");
    }
  }, [acceptFile]);

  const instantSample = useCallback(() => {
    setError(null);
    setUpload({
      name: "sample-invoice.pdf",
      base64: "",
      mediaType: "application/pdf",
    });
    setPo(SAMPLE_PO);
    setInvoice(SAMPLE_INVOICE);
    setResult(reconcile(SAMPLE_INVOICE, SAMPLE_PO, SAMPLE_MATCHES));
  }, []);

  const run = useCallback(async () => {
    if (!upload) return;
    setError(null);
    setResult(null);

    async function extract(u: Upload): Promise<ExtractedInvoice> {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: u.base64, mediaType: u.mediaType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed.");
      return data.invoice as ExtractedInvoice;
    }

    async function runReconcile(
      inv: ExtractedInvoice,
    ): Promise<ReconciliationResult> {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice: inv, po }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reconciliation failed.");
      return data.result as ReconciliationResult;
    }

    try {
      let inv = invoice;
      if (!inv) {
        setPhase("extracting");
        inv = await extract(upload);
        setInvoice(inv);
      }
      setPhase("reconciling");
      const r = await runReconcile(inv);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPhase("idle");
    }
  }, [upload, invoice, po]);

  const runDisabled =
    !upload || busy || (!!upload && !upload.base64 && !invoice);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8">
      {/* Masthead */}
      <header className="rise mb-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="font-display text-[22px] tracking-tight">
              ReconAI
            </span>
          </div>
          <span className="font-mono hidden text-[12px] text-ink-faint sm:block">
            invoice ↔ PO audit agent
          </span>
        </div>
        <h1 className="font-display mt-8 max-w-3xl text-[34px] leading-[1.08] tracking-tight sm:text-[44px]">
          Every invoice, checked against what you actually ordered.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-soft">
          Upload an invoice. An AI agent reads every line item, matches it to
          your purchase order even when the wording differs, re-checks the math,
          and tells you whether it&rsquo;s safe to pay — with every mismatch
          flagged and priced.
        </p>
      </header>

      {/* Workspace */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Step 1 — invoice */}
        <section
          className="rise card flex flex-col gap-4 rounded-xl p-6"
          style={{ animationDelay: "80ms" }}
        >
          <StepLabel n={1}>The invoice</StepLabel>

          {!upload ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) acceptFile(f);
              }}
              className="flex min-h-[190px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors"
              style={{
                borderColor: dragging ? "var(--teal)" : "var(--line-strong)",
                background: dragging ? "var(--teal-soft)" : "transparent",
              }}
            >
              <UploadGlyph />
              <span className="text-[14px] text-ink-soft">
                Drop a PDF or image invoice, or{" "}
                <span className="text-teal underline underline-offset-2">
                  browse
                </span>
              </span>
              <span className="font-mono text-[11px] text-ink-faint">
                PDF · PNG · JPG — up to 8&nbsp;MB
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileGlyph />
                  <span className="truncate text-[13px]">{upload.name}</span>
                </div>
                <button
                  onClick={() => {
                    setUpload(null);
                    setInvoice(null);
                    setResult(null);
                  }}
                  disabled={busy}
                  className="text-ink-faint transition-colors hover:text-brick disabled:opacity-30"
                  aria-label="Remove file"
                >
                  ×
                </button>
              </div>

              {invoice ? (
                <div className="rounded-lg border border-line">
                  <div className="flex items-center justify-between border-b border-line px-3 py-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-teal">
                      ✓ extracted · {invoice.lineItems.length} lines
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint">
                      {invoice.invoiceNumber}
                    </span>
                  </div>
                  <ul className="max-h-[190px] overflow-auto p-1.5">
                    {invoice.lineItems.map((l, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-3 px-2 py-1.5 text-[12.5px]"
                      >
                        <span className="truncate text-ink-soft">
                          {l.description}
                        </span>
                        <span className="font-mono tnum shrink-0 text-ink-faint">
                          {l.quantity}×
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed text-ink-faint">
                  Ready to read. The agent transcribes every line exactly as
                  printed — including any numbers that look wrong — so nothing is
                  silently &ldquo;fixed&rdquo; before the audit.
                </p>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
            }}
          />
        </section>

        {/* Step 2 — PO */}
        <section
          className="rise card flex flex-col gap-4 rounded-xl p-6"
          style={{ animationDelay: "160ms" }}
        >
          <div className="flex items-center justify-between">
            <StepLabel n={2}>The purchase order</StepLabel>
            <span className="font-mono text-[11px] text-ink-faint">
              your record
            </span>
          </div>
          <POEditor po={po} onChange={setPo} disabled={busy} />
        </section>
      </div>

      {/* Action bar */}
      <div
        className="rise mt-6 flex flex-col items-center gap-3"
        style={{ animationDelay: "240ms" }}
      >
        <button
          onClick={run}
          disabled={runDisabled}
          className="relative w-full max-w-md overflow-hidden rounded-full px-8 py-3.5 text-[15px] font-medium text-paper transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--ink)" }}
        >
          {busy ? <span className="scanline absolute inset-0" /> : null}
          <span className="relative">
            {phase === "extracting"
              ? "Reading the invoice…"
              : phase === "reconciling"
                ? "Matching lines & checking the math…"
                : "Run reconciliation →"}
          </span>
        </button>

        <div className="flex items-center gap-4 text-[12.5px]">
          <button
            onClick={loadSample}
            disabled={busy}
            className="text-ink-soft underline decoration-line-strong underline-offset-2 transition-colors hover:text-teal disabled:opacity-40"
          >
            Load a sample invoice
          </button>
          <span className="text-line-strong">·</span>
          <button
            onClick={instantSample}
            disabled={busy}
            className="text-ink-faint underline decoration-line-strong underline-offset-2 transition-colors hover:text-teal disabled:opacity-40"
          >
            Preview sample output (no API key)
          </button>
        </div>

        {error ? (
          <p className="mt-1 max-w-md rounded-lg bg-brick-soft px-4 py-2.5 text-center text-[13px] text-brick">
            {error}
          </p>
        ) : null}
      </div>

      {/* Results */}
      {result ? <Results result={result} /> : null}

      {/* How it works */}
      <footer
        className="rise mt-16 border-t border-line pt-8"
        style={{ animationDelay: "300ms" }}
      >
        <h3 className="font-mono mb-4 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          How it works
        </h3>
        <div className="grid gap-6 text-[13.5px] leading-relaxed text-ink-soft sm:grid-cols-3">
          <p>
            <b className="text-ink">Extraction.</b> Claude reads the invoice
            (PDF or photo) and transcribes each line item verbatim into
            structured data — never silently correcting the numbers it will
            later be checked against.
          </p>
          <p>
            <b className="text-ink">Semantic matching.</b> The hard part:
            invoice wording rarely matches the PO. The model maps &ldquo;Wheel
            stops - replace&rdquo; to &ldquo;Wheel stop replacement&rdquo; and
            returns a confidence for each pairing.
          </p>
          <p>
            <b className="text-ink">Deterministic audit.</b> Every dollar —
            price deltas, quantity deltas, line math, tax, totals, and the final
            Approve / Hold / Reject — is computed in plain code, so the verdict
            is auditable and reproducible.
          </p>
        </div>
      </footer>
    </main>
  );
}

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <rect x="1" y="1" width="24" height="24" rx="6" fill="var(--ink)" />
      <path
        d="M7 13.5l3.2 3.2L19 8"
        stroke="var(--paper)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4m0 0L7 9m5-5l5 5M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2"
        stroke="var(--ink-faint)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke="var(--teal)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6"
        stroke="var(--teal)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
