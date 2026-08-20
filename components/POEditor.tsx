"use client";

import { fmt } from "@/lib/reconcile";
import type { POLine, PurchaseOrder } from "@/lib/types";

let idCounter = 1000;
const newId = () => `X${idCounter++}`;

export function POEditor({
  po,
  onChange,
  disabled,
}: {
  po: PurchaseOrder;
  onChange: (po: PurchaseOrder) => void;
  disabled?: boolean;
}) {
  const update = (patch: Partial<PurchaseOrder>) => onChange({ ...po, ...patch });

  const updateLine = (id: string, patch: Partial<POLine>) =>
    update({
      lines: po.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });

  const removeLine = (id: string) =>
    update({ lines: po.lines.filter((l) => l.id !== id) });

  const addLine = () =>
    update({
      lines: [
        ...po.lines,
        { id: newId(), description: "", quantity: 1, unitPrice: 0 },
      ],
    });

  const subtotal = po.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = subtotal * (1 + po.taxRate);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={po.poNumber}
          disabled={disabled}
          onChange={(e) => update({ poNumber: e.target.value })}
          className="font-mono w-36 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-ink-soft hover:border-line focus:border-line-strong focus:outline-none"
          aria-label="PO number"
        />
        <label className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          Tax
          <input
            type="number"
            step="0.01"
            disabled={disabled}
            value={+(po.taxRate * 100).toFixed(2)}
            onChange={(e) =>
              update({ taxRate: (parseFloat(e.target.value) || 0) / 100 })
            }
            className="font-mono tnum w-16 rounded border border-line bg-paper px-1.5 py-0.5 text-right text-[12px] focus:border-line-strong focus:outline-none"
          />
          %
        </label>
      </div>

      {/* header */}
      <div className="font-mono grid grid-cols-[1fr_54px_74px_74px_24px] gap-2 border-b border-line px-1 pb-1 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit</span>
        <span className="text-right">Line</span>
        <span />
      </div>

      <div className="flex flex-col">
        {po.lines.map((l) => (
          <div
            key={l.id}
            className="ledger-row grid grid-cols-[1fr_54px_74px_74px_24px] items-center gap-2 py-1.5"
          >
            <input
              value={l.description}
              disabled={disabled}
              placeholder="Description"
              onChange={(e) => updateLine(l.id, { description: e.target.value })}
              className="rounded border border-transparent bg-transparent px-1 py-1 text-[13px] hover:border-line focus:border-line-strong focus:outline-none"
            />
            <input
              type="number"
              disabled={disabled}
              value={l.quantity}
              onChange={(e) =>
                updateLine(l.id, { quantity: parseFloat(e.target.value) || 0 })
              }
              className="font-mono tnum rounded border border-transparent bg-transparent px-1 py-1 text-right text-[13px] hover:border-line focus:border-line-strong focus:outline-none"
            />
            <input
              type="number"
              step="0.01"
              disabled={disabled}
              value={l.unitPrice}
              onChange={(e) =>
                updateLine(l.id, { unitPrice: parseFloat(e.target.value) || 0 })
              }
              className="font-mono tnum rounded border border-transparent bg-transparent px-1 py-1 text-right text-[13px] hover:border-line focus:border-line-strong focus:outline-none"
            />
            <span className="font-mono tnum px-1 text-right text-[13px] text-ink-soft">
              {fmt(l.quantity * l.unitPrice, "USD")}
            </span>
            <button
              onClick={() => removeLine(l.id)}
              disabled={disabled}
              aria-label="Remove line"
              className="text-ink-faint transition-colors hover:text-brick disabled:opacity-30"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={addLine}
          disabled={disabled}
          className="font-mono text-[12px] text-ink-soft transition-colors hover:text-teal disabled:opacity-40"
        >
          + add line
        </button>
        <div className="font-mono tnum text-right text-[13px]">
          <span className="text-ink-faint">authorized&nbsp;</span>
          <span className="text-ink">{fmt(total, "USD")}</span>
        </div>
      </div>
    </div>
  );
}
