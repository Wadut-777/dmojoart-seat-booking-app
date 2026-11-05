import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[0-9]{10}$/),
  hallId: z.string().uuid(),
  eventId: z.string().uuid().optional().or(z.literal("")),
  categoryId: z.string().uuid(),
  seats: z.number().int().min(1).max(20),
  source: z.enum(["self", "executive"]),
  executiveId: z.string().uuid().optional().or(z.literal("")),
});

export const createBooking = createServerFn({ method: "POST" })
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { sql, transaction, uuid } = await import("@/server/db.server");

    const [hall] = await sql<{ id: string; name: string; city: string; show_time: string | null }[]>`
      SELECT id, name, city, show_time FROM halls WHERE id = ${data.hallId} AND is_active = 1`;
    if (!hall) throw new Error("Hall not found");

    const [category] = await sql<{ id: string; name: string; price: number; hall_id: string; capacity: number }[]>`
      SELECT id, name, price, hall_id, capacity FROM hall_categories WHERE id = ${data.categoryId}`;
    if (!category || category.hall_id !== hall.id) throw new Error("Seat category not found");

    if (data.eventId) {
      const [event] = await sql<{ booking_open: boolean; is_active: boolean }[]>`
        SELECT booking_open, is_active FROM events WHERE id = ${data.eventId}`;
      if (!event || !event.booking_open || !event.is_active) {
        throw new Error("Bookings are closed for this show");
      }
    }

    let executiveId: string | null = null;
    if (data.source === "executive") {
      if (!data.executiveId) throw new Error("Select the executive who is making this booking");
      const [exec] = await sql<{ id: string }[]>`
        SELECT id FROM executives WHERE id = ${data.executiveId} AND is_active = 1`;
      if (!exec) throw new Error("Executive not found");
      executiveId = exec.id;
    }

    const unitPrice = Number(category.price);
    // Server-side price build-up (ticket value, GST, service charge, round-off) from the admin's tax settings.
    // With GST and service charge off (the default) this equals unitPrice × seats, exactly as before.
    const { loadTaxSettings } = await import("@/server/tax.server");
    const { computeBreakup } = await import("@/lib/pricing");
    const breakup = computeBreakup(unitPrice, data.seats, await loadTaxSettings());
    const total = breakup.total;
    const breakupJson = JSON.stringify(breakup);
    const id = uuid();

    // MySQL has no sequences: take the next number from the one-row counter, inside the same
    // transaction, so a failed insert doesn't burn a booking number.
    //
    // Capacity: when the category has a limit (capacity > 0), count seats already paid for or held and refuse
    // the booking if it would not fit. The check and the insert run under a per-category lock so two
    // customers can never take the last seat at the same time. Capacity 0 means "no limit" (the old behaviour).
    const capacity = Number(category.capacity);
    const { seatsTaken, seatsLeft } = await import("@/server/inventory.server");
    const refPrefix = process.env["BOOKING_REF_PREFIX"] ?? "PXL-2026-";
    const bookingRef = await transaction(
      async (tx) => {
        if (capacity > 0) {
          const left = seatsLeft(capacity, await seatsTaken(tx, hall.id, category.name, data.eventId || null));
          if (left !== null && data.seats > left) {
            throw new Error(
              left <= 0
                ? `Sold out: no ${category.name} seats are left.`
                : `Only ${left} ${category.name} seat${left === 1 ? "" : "s"} left. Please reduce the number of tickets.`,
            );
          }
        }
        await tx.exec`UPDATE booking_counter SET n = LAST_INSERT_ID(n + 1) WHERE id = 1`;
        const [row] = await tx.sql<{ n: number }[]>`SELECT LAST_INSERT_ID() AS n`;
        const ref = `${refPrefix}${String(Number(row?.n)).padStart(6, "0")}`;
        await tx.exec`
          INSERT INTO bookings (
            id, booking_ref, customer_name, email, phone, city, event_id, hall_id, seat_category, unit_price,
            num_seats, total_price, price_breakup, booking_source, executive_id
          ) VALUES (
            ${id}, ${ref}, ${data.name}, ${data.email || null}, ${data.phone}, ${hall.city}, ${data.eventId || null},
            ${hall.id}, ${category.name}, ${unitPrice}, ${data.seats}, ${total}, ${breakupJson}, ${data.source}, ${executiveId}
          )`;
        return ref;
      },
      capacity > 0 ? { lock: `dmojo_cat_${category.id}` } : {},
    );

    return {
      id,
      bookingRef,
      total,
      breakup,
      hallName: hall.name,
      city: hall.city,
      showTime: hall.show_time ?? "",
      category: category.name,
    };
  });
