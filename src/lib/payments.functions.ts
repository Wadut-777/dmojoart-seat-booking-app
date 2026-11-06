import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PriceBreakup } from "@/lib/pricing";

/**
 * Payments via NTT DATA Payment Services (Atom). See src/server/atom.server.ts.
 *
 *   startPayment      – creates a payment attempt, gets an atomTokenId for the browser checkout
 *   getPaymentStatus  – what the booking/ticket page shows after Atom redirects back
 *   payForBooking     – SIMULATED payment, only when PAYMENT_PROVIDER=simulated (local demos)
 */

const bookingId = z.object({ bookingId: z.string().uuid() });

export type StartPaymentResult =
  | { provider: "simulated" }
  | {
      provider: "atom";
      atomTokenId: string;
      merchId: string;
      custEmail: string;
      custMobile: string;
      returnUrl: string;
      scriptUrl: string;
      env: "uat" | "prod";
    };

export const startPayment = createServerFn({ method: "POST" })
  .validator((d: unknown) => bookingId.parse(d))
  .handler(async ({ data }): Promise<StartPaymentResult> => {
    const atom = await import("@/server/atom.server");
    const { sql, exec, uuid } = await import("@/server/db.server");

    const [b] = await sql<
      { id: string; booking_ref: string; total_price: number; payment_status: string; email: string | null; phone: string }[]
    >`SELECT id, booking_ref, total_price, payment_status, email, phone FROM bookings WHERE id = ${data.bookingId}`;
    if (!b) throw new Error("Booking not found");
    if (b.payment_status === "paid") throw new Error("This booking is already paid.");

    if (atom.paymentProvider() === "simulated") return { provider: "simulated" };

    const cfg = atom.atomConfig();
    const merchTxnId = atom.newMerchTxnId(b.booking_ref);
    const merchTxnDate = atom.istTimestamp();
    const email = b.email || cfg.fallbackEmail;

    await exec`INSERT INTO payment_attempts (id, booking_id, merch_txn_id, merch_txn_date, amount)
               VALUES (${uuid()}, ${b.id}, ${merchTxnId}, ${merchTxnDate}, ${b.total_price})`;

    let atomTokenId: string;
    try {
      atomTokenId = await atom.requestAtomToken({
        merchTxnId,
        merchTxnDate,
        amount: b.total_price,
        email,
        mobile: b.phone,
        reference: b.booking_ref,
      });
    } catch (e) {
      let message = e instanceof Error ? e.message : "Could not start the payment.";
      // Node's fetch hides the real reason (DNS, TLS, timeout...) in `cause`.
      const cause = e instanceof Error ? (e.cause as { code?: string; message?: string; hostname?: string } | undefined) : undefined;
      if (cause) message += ` [${cause.code ?? ""} ${cause.hostname ?? ""} ${cause.message ?? ""}]`.replace(/\s+\]/, "]");
      await exec`UPDATE payment_attempts SET status = 'failed', description = ${message.slice(0, 300)},
                 completed_at = UTC_TIMESTAMP(3) WHERE merch_txn_id = ${merchTxnId}`;
      console.error("[atom] token request failed:", message);
      throw new Error("The payment service is unavailable right now. Please try again in a moment.");
    }
    await exec`UPDATE payment_attempts SET atom_token_id = ${atomTokenId} WHERE merch_txn_id = ${merchTxnId}`;

    return {
      provider: "atom",
      atomTokenId,
      merchId: cfg.merchId,
      custEmail: email,
      custMobile: b.phone,
      returnUrl: `${cfg.baseUrl}/api/payment/return`,
      scriptUrl: cfg.jsUrl,
      env: cfg.env,
    };
  });

export type PaymentSummary = {
  id: string;
  ref: string;
  total: number;
  paymentStatus: string;
  ticketCode: string | null;
  merchantTransactionId: string | null;
  paidAt: string | null;
  hallName: string;
  city: string;
  showTime: string;
  category: string;
  seats: number;
  customer: string;
  eventTitle: string;
  failureReason: string | null;
  /** How the total was built (GST, service charge). Null for bookings made before GST was itemised. */
  breakup: PriceBreakup | null;
};

export const getPaymentStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) => bookingId.parse(d))
  .handler(async ({ data }): Promise<PaymentSummary> => {
    const atom = await import("@/server/atom.server");
    const { sql } = await import("@/server/db.server");

    const load = async () => {
      const [row] = await sql<
        {
          id: string;
          booking_ref: string;
          total_price: number;
          price_breakup: string | null;
          payment_status: string;
          ticket_code: string | null;
          paid_at: string | null;
          seat_category: string;
          num_seats: number;
          customer_name: string;
          hall_name: string | null;
          city: string;
          show_time: string | null;
          event_title: string | null;
        }[]
      >`
        SELECT b.id, b.booking_ref, b.total_price, b.price_breakup, b.payment_status, b.ticket_code, b.paid_at, b.seat_category,
               b.num_seats, b.customer_name, b.city, h.name AS hall_name, COALESCE(b.show_label, h.show_time) AS show_time, e.title AS event_title
        FROM bookings b
        LEFT JOIN halls h ON h.id = b.hall_id
        LEFT JOIN events e ON e.id = b.event_id
        WHERE b.id = ${data.bookingId}`;
      return row;
    };

    let row = await load();
    if (!row) throw new Error("Booking not found");

    if (row.payment_status !== "paid" && atom.paymentProvider() === "atom") {
      // The customer may have paid but never returned to us — ask Atom directly.
      const open = await sql<{ merch_txn_id: string }[]>`
        SELECT merch_txn_id FROM payment_attempts
        WHERE booking_id = ${row.id} AND status = 'initiated' AND created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 DAY)
        ORDER BY created_at DESC LIMIT 3`;
      for (const a of open) await atom.syncAttempt(a.merch_txn_id);
      if (open.length) row = (await load()) ?? row;
    }

    const [transaction] = await sql<{ merch_txn_id: string | null }[]>`
      SELECT merch_txn_id FROM payment_attempts
      WHERE booking_id = ${row.id} AND merch_txn_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`;

    const [last] = await sql<{ description: string | null }[]>`
      SELECT description FROM payment_attempts WHERE booking_id = ${row.id} AND status = 'failed'
      ORDER BY created_at DESC LIMIT 1`;

    return {
      id: row.id,
      ref: row.booking_ref,
      total: row.total_price,
      paymentStatus: row.payment_status,
      ticketCode: row.ticket_code,
      merchantTransactionId: transaction?.merch_txn_id ?? null,
      paidAt: row.paid_at,
      hallName: row.hall_name ?? "",
      city: row.city,
      showTime: row.show_time ?? "To be confirmed",
      category: row.seat_category,
      seats: row.num_seats,
      customer: row.customer_name,
      eventTitle: row.event_title ?? "PremXL",
      failureReason: row.payment_status === "paid" ? null : (last?.description ?? null),
      breakup: parseBreakup(row.price_breakup),
    };
  });

function parseBreakup(json: string | null): PriceBreakup | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PriceBreakup;
  } catch {
    return null;
  }
}

function makeTicketCode(bookingRef: string) {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TKT-${bookingRef}-${random}`;
}

/** Simulated payment for local demos. Refuses to run unless PAYMENT_PROVIDER=simulated. */
export const payForBooking = createServerFn({ method: "POST" })
  .validator((d: unknown) => bookingId.parse(d))
  .handler(async ({ data }) => {
    const { paymentProvider } = await import("@/server/atom.server");
    const { sql, exec, dbTime } = await import("@/server/db.server");
    if (paymentProvider() !== "simulated") throw new Error("Simulated payments are disabled.");

    const [booking] = await sql<{ id: string; booking_ref: string; payment_status: string; ticket_code: string | null; paid_at: string | null }[]>`
      SELECT id, booking_ref, payment_status, ticket_code, paid_at FROM bookings WHERE id = ${data.bookingId}`;
    if (!booking) throw new Error("Booking not found");
    if (booking.payment_status === "paid" && booking.ticket_code) {
      return { ticketCode: booking.ticket_code, paidAt: booking.paid_at ?? new Date().toISOString() };
    }
    const ticketCode = makeTicketCode(booking.booking_ref);
    const now = new Date();
    await exec`
      UPDATE bookings
      SET payment_status = 'paid', payment_provider = 'simulated', payment_ref = ${`SIM-${Date.now()}`},
          paid_at = ${dbTime(now)}, ticket_code = COALESCE(ticket_code, ${ticketCode}), status = 'confirmed'
      WHERE id = ${booking.id}`;
    return { ticketCode, paidAt: now.toISOString() };
  });
