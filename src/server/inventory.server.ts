import type { Tx } from "./db.server";

/** How long an unpaid (pending) booking keeps its seats before they are offered to others again. */
export function holdMinutes(): number {
  const n = Number(process.env["BOOKING_HOLD_MINUTES"] ?? 15);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 24 * 60) : 15;
}

/**
 * Seats currently taken in one seat category of one hall for one event (or for "no event").
 * Paid bookings always count; pending ones count only while their hold is still running.
 * Failed and refunded bookings free their seats.
 */
export async function seatsTaken(
  q: Pick<Tx, "sql">,
  hallId: string,
  categoryName: string,
  eventId: string | null,
): Promise<number> {
  const [row] = await q.sql<{ n: number | string | null }[]>`
    SELECT COALESCE(SUM(num_seats), 0) AS n FROM bookings
    WHERE hall_id = ${hallId} AND seat_category = ${categoryName} AND event_id <=> ${eventId}
      AND (payment_status = 'paid'
           OR (payment_status = 'pending' AND created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${holdMinutes()} MINUTE)))`;
  return Number(row?.n ?? 0);
}

/** Seats left, or null when the category has no limit set (capacity 0 = unlimited, as before). */
export function seatsLeft(capacity: number, taken: number): number | null {
  return capacity > 0 ? Math.max(0, capacity - taken) : null;
}
