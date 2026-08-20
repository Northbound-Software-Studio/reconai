import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "sample-invoice.pdf");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const rows = [
  ["Repaint standard parking stalls", "240", "$4.50", "$1,080.00"],
  ["ADA handicap stall re-stencil (blue)", "12", "$34.00", "$408.00"],
  ["Wheel stops - replace", "26", "$42.00", "$1,092.00"],
  ["Thermoplastic directional arrows", "16", "$35.00", "$600.00"],
  ["Mobilization / trip charge", "1", "$250.00", "$250.00"],
];

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 0; padding: 56px 60px; font-size: 12.5px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #14463d; padding-bottom: 18px; }
  .brand { font-size: 22px; font-weight: 700; color: #14463d; letter-spacing: .3px; }
  .brand small { display:block; font-size: 11px; font-weight: 400; color:#555; letter-spacing:0; margin-top:4px; }
  .inv { text-align: right; }
  .inv h1 { margin: 0; font-size: 30px; letter-spacing: 4px; color:#14463d; font-weight:700; }
  .meta { margin-top: 8px; font-size: 12px; color:#333; line-height:1.6; }
  .parties { display:flex; justify-content: space-between; margin: 26px 0 8px; }
  .parties h3 { margin:0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color:#8a8a8a; font-family: Arial, sans-serif; }
  .parties p { margin:0; line-height:1.5; }
  table { width:100%; border-collapse: collapse; margin-top: 20px; }
  th { background:#14463d; color:#fff; text-align:left; padding:9px 12px; font-size:10px; text-transform:uppercase; letter-spacing:1px; font-family: Arial, sans-serif; }
  th.r, td.r { text-align:right; }
  td { padding: 11px 12px; border-bottom: 1px solid #e3e0d6; }
  tbody tr:nth-child(even){ background:#faf8f2; }
  .totals { width: 260px; margin-left:auto; margin-top:16px; }
  .totals div { display:flex; justify-content: space-between; padding:6px 12px; }
  .totals .grand { border-top:2px solid #14463d; margin-top:4px; font-weight:700; font-size:15px; color:#14463d; }
  .terms { margin-top: 34px; font-size: 11px; color:#666; border-top:1px solid #e3e0d6; padding-top:14px; line-height:1.6; }
</style></head>
<body>
  <div class="top">
    <div class="brand">Nutmeg Sign &amp; Striping LLC
      <small>418 Weston St · Hartford, CT 06120 · (860) 555-0142</small>
    </div>
    <div class="inv">
      <h1>INVOICE</h1>
      <div class="meta">
        Invoice #: <b>INV-4821</b><br>
        Date: <b>July 18, 2026</b><br>
        PO Ref: <b>PO-2026-0417</b><br>
        Terms: Net 30
      </div>
    </div>
  </div>

  <div class="parties">
    <div>
      <h3>Bill To</h3>
      <p><b>Propark Mobility</b><br>Accounts Payable<br>One Union Place<br>Hartford, CT 06103</p>
    </div>
    <div style="text-align:right">
      <h3>Service Location</h3>
      <p>Church Street Garage<br>Levels 2–4, surface lot<br>Hartford, CT</p>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th class="r">Qty</th><th class="r">Unit Price</th><th class="r">Amount</th></tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) =>
            `<tr><td>${r[0]}</td><td class="r">${r[1]}</td><td class="r">${r[2]}</td><td class="r">${r[3]}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>$3,430.00</span></div>
    <div><span>Sales Tax (6.35%)</span><span>$217.81</span></div>
    <div class="grand"><span>Total Due</span><span>$3,647.81</span></div>
  </div>

  <div class="terms">
    Payment due within 30 days of invoice date. Please remit to the address above or via ACH.
    A 1.5% monthly service charge applies to past-due balances. Thank you for your business.
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({ path: OUT, format: "Letter", printBackground: true });
await browser.close();
console.log("Wrote", OUT);
