/**
 * Price build-up for a booking: ticket value, GST, service charge, round-off.
 * Pure and browser-safe: the server uses it to charge, the booking page uses it to show the same numbers.
 * All arithmetic is in paise (integers) so nothing drifts.
 */

export type TaxSettings = {
  /** Charge GST. When false the booking total is just seats × price (+ service charge, if any). */
  gstEnabled: boolean;
  /** GST % on tickets. */
  ticketGstRate: number;
  /** true: the listed ticket price already contains GST. false: GST is added on top. */
  pricesIncludeGst: boolean;
  serviceChargeType: "none" | "percent" | "flat";
  /** Percent of the ticket price, or rupees per ticket when type is "flat". */
  serviceChargeValue: number;
  /** GST % on the service charge (applied only when GST is enabled). */
  serviceChargeGstRate: number;
  /** "cgst_sgst" for sales inside the seller's state, "igst" otherwise. Only affects how the invoice shows the tax. */
  gstSplit: "cgst_sgst" | "igst";
  seller: {
    legalName: string;
    gstin: string;
    address: string;
    state: string;
    stateCode: string;
    email: string;
    phone: string;
    /** Service accounting code printed on the invoice. */
    sacCode: string;
    invoicePrefix: string;
    footerNote: string;
  };
};

export const DEFAULT_TAX: TaxSettings = {
  gstEnabled: false,
  ticketGstRate: 18,
  pricesIncludeGst: false,
  serviceChargeType: "none",
  serviceChargeValue: 0,
  serviceChargeGstRate: 18,
  gstSplit: "cgst_sgst",
  seller: {
    legalName: "D Mojo Art",
    gstin: "",
    address: "",
    state: "Assam",
    stateCode: "18",
    email: "",
    phone: "",
    sacCode: "999699",
    invoicePrefix: "INV",
    footerNote: "This is a computer generated invoice and does not require a signature.",
  },
};

export type PriceBreakup = {
  /** Listed price of one ticket. */
  unitPrice: number;
  seats: number;
  gstApplied: boolean;
  pricesIncludeGst: boolean;
  gstSplit: "cgst_sgst" | "igst";
  /** Ticket value before GST. */
  taxableTicket: number;
  ticketGstRate: number;
  ticketGst: number;
  serviceCharge: number;
  serviceChargeGstRate: number;
  serviceChargeGst: number;
  /** Total before rounding. */
  subtotal: number;
  /** Added to reach a whole-rupee total (can be negative). */
  roundOff: number;
  /** Whole rupees: what the customer pays and what is sent to the payment gateway. */
  total: number;
};

const toPaise = (rupees: number) => Math.round(rupees * 100);
const fromPaise = (p: number) => p / 100;
const clampRate = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

/** Fills missing or invalid fields so old or hand-edited settings can never break a booking. */
export function normaliseTax(raw: unknown): TaxSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TaxSettings> & { seller?: Partial<TaxSettings["seller"]> };
  const type = r.serviceChargeType === "percent" || r.serviceChargeType === "flat" ? r.serviceChargeType : "none";
  const text = (v: unknown, fallback: string) => (typeof v === "string" ? v.trim() : fallback);
  const s: Partial<TaxSettings["seller"]> = r.seller ?? {};
  return {
    gstEnabled: r.gstEnabled === true,
    ticketGstRate: clampRate(Number(r.ticketGstRate ?? DEFAULT_TAX.ticketGstRate)),
    pricesIncludeGst: r.pricesIncludeGst === true,
    serviceChargeType: type,
    serviceChargeValue: Math.max(0, Number.isFinite(Number(r.serviceChargeValue)) ? Number(r.serviceChargeValue) : 0),
    serviceChargeGstRate: clampRate(Number(r.serviceChargeGstRate ?? DEFAULT_TAX.serviceChargeGstRate)),
    gstSplit: r.gstSplit === "igst" ? "igst" : "cgst_sgst",
    seller: {
      legalName: text(s.legalName, DEFAULT_TAX.seller.legalName),
      gstin: text(s.gstin, "").toUpperCase(),
      address: text(s.address, ""),
      state: text(s.state, DEFAULT_TAX.seller.state),
      stateCode: text(s.stateCode, DEFAULT_TAX.seller.stateCode),
      email: text(s.email, ""),
      phone: text(s.phone, ""),
      sacCode: text(s.sacCode, DEFAULT_TAX.seller.sacCode),
      invoicePrefix: text(s.invoicePrefix, DEFAULT_TAX.seller.invoicePrefix) || "INV",
      footerNote: text(s.footerNote, DEFAULT_TAX.seller.footerNote),
    },
  };
}

export function computeBreakup(unitPrice: number, seats: number, tax: TaxSettings): PriceBreakup {
  const gross = toPaise(unitPrice) * seats; // listed ticket value
  const rate = tax.gstEnabled ? tax.ticketGstRate : 0;

  let ticketGst = 0;
  let taxable = gross;
  if (rate > 0) {
    if (tax.pricesIncludeGst) {
      ticketGst = Math.round((gross * rate) / (100 + rate));
      taxable = gross - ticketGst;
    } else {
      ticketGst = Math.round((gross * rate) / 100);
    }
  }

  let service = 0;
  if (tax.serviceChargeType === "percent") service = Math.round((gross * tax.serviceChargeValue) / 100);
  if (tax.serviceChargeType === "flat") service = toPaise(tax.serviceChargeValue) * seats;
  const serviceRate = tax.gstEnabled ? tax.serviceChargeGstRate : 0;
  const serviceGst = Math.round((service * serviceRate) / 100);

  const subtotal = taxable + ticketGst + service + serviceGst;
  const total = Math.round(subtotal / 100) * 100;

  return {
    unitPrice,
    seats,
    gstApplied: tax.gstEnabled,
    pricesIncludeGst: tax.pricesIncludeGst,
    gstSplit: tax.gstSplit,
    taxableTicket: fromPaise(taxable),
    ticketGstRate: rate,
    ticketGst: fromPaise(ticketGst),
    serviceCharge: fromPaise(service),
    serviceChargeGstRate: serviceRate,
    serviceChargeGst: fromPaise(serviceGst),
    subtotal: fromPaise(subtotal),
    roundOff: fromPaise(total - subtotal),
    total: total / 100,
  };
}

/** True when the breakup adds anything beyond seats × price, so the UI knows whether to show the lines. */
export const hasExtras = (b: PriceBreakup) => b.ticketGst > 0 || b.serviceCharge > 0 || b.serviceChargeGst > 0;

export const rupees = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
