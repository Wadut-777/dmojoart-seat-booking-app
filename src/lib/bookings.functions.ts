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

    const [category] = await sql<{ id: string; name: string; price: number; hall_id: string }[]>`
      SELECT id, name, price, hall_id FROM hall_categories WHERE id = ${data.categoryId}`;
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
    const total = unitPrice * data.seats;
    const id = uuid();

    // MySQL has no sequences: take the next number from the one-row counter, inside the same
    // transaction, so a failed insert doesn't burn a booking number.
    const bookingRef = await transaction(async (tx) => {
      await tx.exec`UPDATE booking_counter SET n = LAST_INSERT_ID(n + 1) WHERE id = 1`;
      const [row] = await tx.sql<{ n: number }[]>`SELECT LAST_INSERT_ID() AS n`;
      const ref = `PXL-2026-${String(Number(row?.n)).padStart(6, "0")}`;
      await tx.exec`
        INSERT INTO bookings (
          id, booking_ref, customer_name, email, phone, city, event_id, hall_id, seat_category, unit_price,
          num_seats, total_price, booking_source, executive_id
        ) VALUES (
          ${id}, ${ref}, ${data.name}, ${data.email || null}, ${data.phone}, ${hall.city}, ${data.eventId || null},
          ${hall.id}, ${category.name}, ${unitPrice}, ${data.seats}, ${total}, ${data.source}, ${executiveId}
        )`;
      return ref;
    });

    return {
      id,
      bookingRef,
      total,
      hallName: hall.name,
      city: hall.city,
      showTime: hall.show_time ?? "",
      category: category.name,
    };
  });
