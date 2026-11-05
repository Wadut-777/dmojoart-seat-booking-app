import { randomUUID } from "node:crypto";

import { isDuplicate, sql, transaction } from "@/server/db.server";
import { Pdf, type Rgb } from "@/server/pdf.server";
import { loadTaxSettings } from "@/server/tax.server";
import { computeBreakup, DEFAULT_TAX, normaliseTax, rupees, type PriceBreakup, type TaxSettings } from "@/lib/pricing";

type BookingRow = {
  id: string;
  booking_ref: string;
  customer_name: string;
  email: string | null;
  phone: string;
  city: string;
  seat_category: string;
  unit_price: number;
  num_seats: number;
  total_price: number;
  price_breakup: string | null;
  payment_status: string;
  payment_provider: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  ticket_code: string | null;
  hall_name: string | null;
  show_time: string | null;
  event_title: string | null;
};

export type InvoiceRecord = { invoiceNo: string; issuedAt: string; seller: TaxSettings["seller"] };

/** Financial year (April to March) of a date, in IST: "2026-27". */
export function financialYear(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function loadBooking(bookingId: string): Promise<BookingRow | null> {
  const [row] = await sql<BookingRow[]>`
    SELECT b.id, b.booking_ref, b.customer_name, b.email, b.phone, b.city, b.seat_category, b.unit_price, b.num_seats,
           b.total_price, b.price_breakup, b.payment_status, b.payment_provider, b.payment_ref, b.paid_at, b.ticket_code,
           h.name AS hall_name, h.show_time, e.title AS event_title
    FROM bookings b
    LEFT JOIN halls h ON h.id = b.hall_id
    LEFT JOIN events e ON e.id = b.event_id
    WHERE b.id = ${bookingId}`;
  return row ?? null;
}

/** The invoice for a paid booking. Created on first request, then always the same number and seller details. */
async function ensureInvoice(b: BookingRow): Promise<InvoiceRecord> {
  const read = async (): Promise<InvoiceRecord | null> => {
    const [inv] = await sql<{ invoice_no: string; issued_at: string; seller_snapshot: string }[]>`
      SELECT invoice_no, issued_at, seller_snapshot FROM invoices WHERE booking_id = ${b.id}`;
    return inv ? { invoiceNo: inv.invoice_no, issuedAt: inv.issued_at, seller: normaliseTax({ seller: JSON.parse(inv.seller_snapshot) }).seller } : null;
  };
  const existing = await read();
  if (existing) return existing;

  const settings = await loadTaxSettings();
  const issuedAt = b.paid_at ?? new Date().toISOString();
  const fy = financialYear(issuedAt);
  try {
    await transaction(
      async (tx) => {
        const [again] = await tx.sql<{ id: string }[]>`SELECT id FROM invoices WHERE booking_id = ${b.id}`;
        if (again) return;
        await tx.exec`INSERT INTO invoice_counter (fy, n) VALUES (${fy}, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE n = LAST_INSERT_ID(n + 1)`;
        const [row] = await tx.sql<{ n: number }[]>`SELECT LAST_INSERT_ID() AS n`;
        const no = `${settings.seller.invoicePrefix}/${fy}/${String(Number(row?.n)).padStart(6, "0")}`;
        await tx.exec`
          INSERT INTO invoices (id, booking_id, invoice_no, fy, issued_at, seller_snapshot)
          VALUES (${randomUUID()}, ${b.id}, ${no}, ${fy}, ${issuedAt.slice(0, 23).replace("T", " ")}, ${JSON.stringify(settings.seller)})`;
      },
      { lock: `dmojo_invoice_${b.id}` },
    );
  } catch (e) {
    if (!isDuplicate(e)) throw e;
  }
  const created = await read();
  if (!created) throw new Error("Could not create the invoice.");
  return created;
}

/* ───────────── drawing ───────────── */

const INK: Rgb = [0.1, 0.1, 0.12];
const MUTED: Rgb = [0.4, 0.42, 0.48];
const RULE: Rgb = [0.8, 0.82, 0.86];
const HEAD: Rgb = [0.93, 0.94, 0.97];
const L = 40;
const R = 555;

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
  const rest = n % 100;
  if (rest) parts.push(rest < 20 ? (ONES[rest] ?? "") : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`);
  return parts.join(" ");
}

/** 12345 -> "Rupees Twelve Thousand Three Hundred Forty Five Only" (Indian lakh/crore grouping). */
export function amountInWords(total: number): string {
  let n = Math.round(total);
  if (n === 0) return "Rupees Zero Only";
  const units: [number, string][] = [[10_000_000, "Crore"], [100_000, "Lakh"], [1000, "Thousand"]];
  const parts: string[] = [];
  for (const [size, name] of units) {
    if (n >= size) {
      parts.push(`${below1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(below1000(n));
  return `Rupees ${parts.join(" ")} Only`;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type Line = { description: string; sac: string; qty: string; rate: string; taxable: string; gst: string; amount: string };

function lineItems(b: BookingRow, br: PriceBreakup | null, sac: string): { lines: Line[]; breakup: PriceBreakup } {
  if (!br) {
    // Booking made before GST was introduced: one line for what was actually paid.
    const plain = computeBreakup(Number(b.unit_price), b.num_seats, DEFAULT_TAX);
    return {
      breakup: { ...plain, total: Number(b.total_price), subtotal: Number(b.total_price), roundOff: 0 },
      lines: [
        {
          description: `Ticket - ${b.seat_category}`,
          sac,
          qty: String(b.num_seats),
          rate: rupees(Number(b.unit_price)),
          taxable: rupees(Number(b.total_price)),
          gst: "-",
          amount: rupees(Number(b.total_price)),
        },
      ],
    };
  }
  const lines: Line[] = [
    {
      description: `Ticket - ${b.seat_category}`,
      sac,
      qty: String(br.seats),
      rate: rupees(br.taxableTicket / Math.max(1, br.seats)),
      taxable: rupees(br.taxableTicket),
      gst: br.gstApplied ? `${br.ticketGstRate}%` : "-",
      amount: rupees(br.taxableTicket + br.ticketGst),
    },
  ];
  if (br.serviceCharge > 0) {
    lines.push({
      description: "Service charge",
      sac,
      qty: String(br.seats),
      rate: rupees(br.serviceCharge / Math.max(1, br.seats)),
      taxable: rupees(br.serviceCharge),
      gst: br.gstApplied ? `${br.serviceChargeGstRate}%` : "-",
      amount: rupees(br.serviceCharge + br.serviceChargeGst),
    });
  }
  return { lines, breakup: br };
}

export function renderInvoice(b: BookingRow, inv: InvoiceRecord, txnId: string | null): Buffer {
  const pdf = new Pdf();
  const stored = b.price_breakup ? (JSON.parse(b.price_breakup) as PriceBreakup) : null;
  const { lines, breakup } = lineItems(b, stored, inv.seller.sacCode);
  const taxInvoice = !!stored?.gstApplied && !!inv.seller.gstin;
  const seller = inv.seller;

  // Header band
  pdf.rect(0, 0, pdf.width, 8, { fill: [0.57, 0.69, 0.96] });
  pdf.text(L, 44, seller.legalName, { size: 18, bold: true, color: INK });
  let y = 60;
  for (const line of pdf.wrap(seller.address, 9, 260)) {
    if (line) pdf.text(L, y, line, { size: 9, color: MUTED });
    y += 12;
  }
  const contact = [seller.email, seller.phone].filter(Boolean).join("  |  ");
  if (contact) (pdf.text(L, y, contact, { size: 9, color: MUTED }), (y += 12));
  if (seller.gstin) (pdf.text(L, y, `GSTIN: ${seller.gstin}`, { size: 9, bold: true, color: INK }), (y += 12));
  if (seller.state) pdf.text(L, y, `State: ${seller.state}${seller.stateCode ? ` (${seller.stateCode})` : ""}`, { size: 9, color: MUTED });

  pdf.text(R, 44, taxInvoice ? "TAX INVOICE" : "INVOICE", { size: 20, bold: true, align: "right", color: INK });
  pdf.text(R, 62, `Invoice no: ${inv.invoiceNo}`, { size: 10, bold: true, align: "right" });
  pdf.text(R, 76, `Date: ${fmtDate(inv.issuedAt)}`, { size: 10, align: "right" });
  pdf.text(R, 90, "Payment status: PAID", { size: 10, bold: true, align: "right" });

  // Bill to + booking details
  const top = 128;
  pdf.line(L, top - 10, R, top - 10, 0.8, RULE);
  pdf.text(L, top + 4, "BILLED TO", { size: 8, bold: true, color: MUTED });
  pdf.text(L, top + 20, b.customer_name, { size: 11, bold: true });
  let by = top + 34;
  if (b.phone) (pdf.text(L, by, `Phone: ${b.phone}`, { size: 9, color: MUTED }), (by += 12));
  if (b.email) (pdf.text(L, by, b.email, { size: 9, color: MUTED }), (by += 12));
  pdf.text(L, by, `City: ${b.city}`, { size: 9, color: MUTED });
  if (taxInvoice) pdf.text(L, by + 12, `Place of supply: ${seller.state}${seller.stateCode ? ` (${seller.stateCode})` : ""}`, { size: 9, color: MUTED });

  const col = 310;
  pdf.text(col, top + 4, "BOOKING DETAILS", { size: 8, bold: true, color: MUTED });
  const details: [string, string][] = [
    ["Booking ID", b.booking_ref],
    ["Merchant Transaction ID", txnId ?? b.payment_ref ?? "-"],
    ["Ticket code", b.ticket_code ?? "-"],
    ["Show", b.event_title ?? "PremXL"],
    ["Venue", [b.hall_name, b.city].filter(Boolean).join(", ")],
    ["Show time", b.show_time ?? "To be confirmed"],
    ["Paid on", b.paid_at ? fmtDate(b.paid_at) : "-"],
  ];
  let dy = top + 20;
  for (const [k, v] of details) {
    pdf.text(col, dy, k, { size: 8.5, color: MUTED });
    const wrapped = pdf.wrap(v, 8.5, R - (col + 110), true);
    pdf.text(col + 110, dy, wrapped[0] ?? "", { size: 8.5, bold: true });
    dy += 13;
  }

  // Items table
  const ty = Math.max(by + 40, dy + 14);
  const cols = { desc: L + 6, sac: 250, qty: 300, rate: 360, taxable: 430, gst: 470, amount: R - 6 };
  pdf.rect(L, ty, R - L, 22, { fill: HEAD });
  const head = (x: number, t: string, align: "left" | "right" = "right") => pdf.text(x, ty + 14.5, t, { size: 8, bold: true, align, color: INK });
  head(cols.desc, "Description", "left");
  head(cols.sac, "SAC", "left");
  head(cols.qty, "Qty");
  head(cols.rate, "Rate (Rs.)");
  head(cols.taxable, "Taxable (Rs.)");
  head(cols.gst, "GST");
  head(cols.amount, "Amount (Rs.)");
  let ry = ty + 22;
  for (const line of lines) {
    pdf.text(cols.desc, ry + 15, line.description, { size: 9.5 });
    pdf.text(cols.sac, ry + 15, line.sac, { size: 9, color: MUTED });
    pdf.text(cols.qty, ry + 15, line.qty, { size: 9.5, align: "right" });
    pdf.text(cols.rate, ry + 15, line.rate, { size: 9.5, align: "right" });
    pdf.text(cols.taxable, ry + 15, line.taxable, { size: 9.5, align: "right" });
    pdf.text(cols.gst, ry + 15, line.gst, { size: 9.5, align: "right" });
    pdf.text(cols.amount, ry + 15, line.amount, { size: 9.5, align: "right" });
    ry += 24;
    pdf.line(L, ry, R, ry, 0.4, RULE);
  }

  // Totals
  const lab = 440;
  let sy = ry + 18;
  const row = (label: string, value: string, bold = false) => {
    pdf.text(lab, sy, label, { size: bold ? 11 : 9.5, bold, align: "right", color: bold ? INK : MUTED });
    pdf.text(R - 6, sy, value, { size: bold ? 11 : 9.5, bold, align: "right" });
    sy += bold ? 18 : 15;
  };
  const taxable = breakup.taxableTicket + breakup.serviceCharge;
  row("Taxable value", rupees(taxable));
  if (taxInvoice) {
    const split = (rate: number, amount: number, name: string) => {
      if (amount <= 0) return;
      if (breakup.gstSplit === "igst") row(`IGST @ ${rate}% (${name})`, rupees(amount));
      else {
        row(`CGST @ ${rate / 2}% (${name})`, rupees(amount / 2));
        row(`SGST @ ${rate / 2}% (${name})`, rupees(amount - amount / 2));
      }
    };
    split(breakup.ticketGstRate, breakup.ticketGst, "tickets");
    split(breakup.serviceChargeGstRate, breakup.serviceChargeGst, "service charge");
  }
  if (Math.abs(breakup.roundOff) > 0.004) row("Round off", `${breakup.roundOff < 0 ? "-" : ""}${rupees(Math.abs(breakup.roundOff))}`);
  pdf.line(300, sy - 8, R, sy - 8, 0.8, INK);
  sy += 6;
  row("Total paid (Rs.)", rupees(Number(b.total_price)), true);
  pdf.text(R - 6, sy, amountInWords(Number(b.total_price)), { size: 8.5, align: "right", color: MUTED });
  sy += 26;

  if (stored && !stored.gstApplied && breakup.serviceCharge === 0) {
    pdf.text(L, sy, "No GST has been charged on this booking.", { size: 8.5, color: MUTED });
    sy += 14;
  }
  if (!stored) {
    pdf.text(L, sy, "This booking was made before GST was itemised, so the amount shown is the total price paid.", { size: 8.5, color: MUTED });
    sy += 14;
  }
  for (const line of pdf.wrap(seller.footerNote, 8.5, R - L)) {
    if (line) pdf.text(L, sy, line, { size: 8.5, color: MUTED });
    sy += 12;
  }
  pdf.line(L, 800, R, 800, 0.5, RULE);
  pdf.text(pdf.width / 2, 815, `${seller.legalName}${seller.gstin ? `  |  GSTIN ${seller.gstin}` : ""}`, { size: 8, align: "center", color: MUTED });

  return pdf.build(`${taxInvoice ? "Tax Invoice" : "Invoice"} ${inv.invoiceNo}`);
}

/** Builds the PDF for a paid booking. Throws a user-readable error otherwise. */
export async function invoicePdfFor(bookingId: string): Promise<{ pdf: Buffer; invoiceNo: string }> {
  const b = await loadBooking(bookingId);
  if (!b) throw new Error("Booking not found.");
  if (b.payment_status !== "paid") throw new Error("An invoice is available once the payment is complete.");
  const inv = await ensureInvoice(b);
  const [attempt] = await sql<{ merch_txn_id: string }[]>`
    SELECT merch_txn_id FROM payment_attempts WHERE booking_id = ${b.id}
    ORDER BY (status = 'paid') DESC, created_at DESC LIMIT 1`;
  return { pdf: renderInvoice(b, inv, attempt?.merch_txn_id ?? null), invoiceNo: inv.invoiceNo };
}
