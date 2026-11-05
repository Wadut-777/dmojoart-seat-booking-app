import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PriceBreakup } from "@/lib/pricing";

/**
 * Dashboard data and mutations. Access rules (previously Supabase row-level-security policies):
 *   halls, hall categories, executives .... admin
 *   events, site content, page blocks ..... admin, editor
 *   bookings (read) ....................... admin, booking_manager, executive (own bookings only)
 *   bookings (delete) ..................... admin
 */

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const text = (max: number) => z.string().trim().max(max);

/* ───────────── halls ───────────── */

export type AdminHall = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  screen: string | null;
  show_time: string | null;
  contact: string | null;
  hall_categories: { id: string; name: string; price: number; capacity: number }[];
};

export const adminListHalls = createServerFn({ method: "GET" }).handler(async (): Promise<AdminHall[]> => {
  const { requireUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  const { hallsWithCategories } = await import("@/server/halls.server");
  await requireUser(["admin"]);
  const halls = await sql<Omit<AdminHall, "hall_categories">[]>`
    SELECT id, name, city, address, screen, show_time, contact FROM halls ORDER BY city, name`;
  const cats = await sql<{ id: string; hall_id: string; name: string; price: number; capacity: number }[]>`
    SELECT id, hall_id, name, price, capacity FROM hall_categories ORDER BY created_at, price DESC, name`;
  return hallsWithCategories(halls, cats);
});

const hallInput = z.object({
  id: z.string().uuid().optional(),
  hall: z.object({
    name: text(200).min(1),
    city: text(100).min(1),
    address: text(500),
    screen: text(100),
    show_time: text(100),
    contact: text(200),
  }),
  categories: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: text(100).min(1),
        price: z.number().int().min(0).max(1_000_000),
        capacity: z.number().int().min(0).max(100_000),
      }),
    )
    .max(50),
});

export const saveHall = createServerFn({ method: "POST" })
  .validator((d: unknown) => hallInput.parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction, uuid } = await import("@/server/db.server");
    await requireUser(["admin"]);
    const h = data.hall;

    return await transaction(async (tx) => {
      let hallId = data.id;
      if (hallId) {
        const r = await tx.exec`
          UPDATE halls SET name = ${h.name}, city = ${h.city}, address = ${blank(h.address)},
            screen = ${blank(h.screen)}, show_time = ${blank(h.show_time)}, contact = ${blank(h.contact)}
          WHERE id = ${hallId}`;
        if (!r.affectedRows) throw new Error("Hall not found");
      } else {
        hallId = uuid();
        await tx.exec`
          INSERT INTO halls (id, name, city, address, screen, show_time, contact)
          VALUES (${hallId}, ${h.name}, ${h.city}, ${blank(h.address)}, ${blank(h.screen)}, ${blank(h.show_time)}, ${blank(h.contact)})`;
      }
      for (const c of data.categories) {
        if (c.id) {
          await tx.exec`UPDATE hall_categories SET name = ${c.name}, price = ${c.price}, capacity = ${c.capacity}
                        WHERE id = ${c.id} AND hall_id = ${hallId}`;
        } else {
          await tx.exec`INSERT INTO hall_categories (id, hall_id, name, price, capacity)
                        VALUES (${uuid()}, ${hallId}, ${c.name}, ${c.price}, ${c.capacity})`;
        }
      }
      return { id: hallId };
    });
  });

/* ───────────── executives ───────────── */

export type AdminExecutive = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  account_holder: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  aadhar_number: string | null;
  notes: string | null;
};

export const adminListExecutives = createServerFn({ method: "GET" }).handler(async (): Promise<AdminExecutive[]> => {
  const { requireUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  await requireUser(["admin"]);
  return await sql<AdminExecutive[]>`
    SELECT id, name, phone, email, city, account_holder, bank_name, account_number, ifsc_code, aadhar_number, notes
    FROM executives ORDER BY name`;
});

const executiveInput = z.object({
  id: z.string().uuid().optional(),
  name: text(120).min(1),
  phone: text(30).min(1),
  email: text(200),
  city: text(100),
  account_holder: text(120),
  bank_name: text(120),
  account_number: text(40),
  ifsc_code: text(20),
  aadhar_number: text(20),
  notes: text(2000),
});

export const saveExecutive = createServerFn({ method: "POST" })
  .validator((d: unknown) => executiveInput.parse(d))
  .handler(async ({ data: e }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec, uuid } = await import("@/server/db.server");
    await requireUser(["admin"]);
    if (e.id) {
      const r = await exec`
        UPDATE executives SET name = ${e.name}, phone = ${e.phone}, email = ${blank(e.email)}, city = ${blank(e.city)},
          account_holder = ${blank(e.account_holder)}, bank_name = ${blank(e.bank_name)},
          account_number = ${blank(e.account_number)}, ifsc_code = ${blank(e.ifsc_code)},
          aadhar_number = ${blank(e.aadhar_number)}, notes = ${blank(e.notes)}
        WHERE id = ${e.id}`;
      if (!r.affectedRows) throw new Error("Executive not found");
    } else {
      await exec`
        INSERT INTO executives (id, name, phone, email, city, account_holder, bank_name, account_number, ifsc_code, aadhar_number, notes)
        VALUES (${uuid()}, ${e.name}, ${e.phone}, ${blank(e.email)}, ${blank(e.city)}, ${blank(e.account_holder)}, ${blank(e.bank_name)},
                ${blank(e.account_number)}, ${blank(e.ifsc_code)}, ${blank(e.aadhar_number)}, ${blank(e.notes)})`;
    }
    return { ok: true };
  });

/* ───────────── events ───────────── */

export type AdminEvent = {
  id: string;
  title: string;
  tagline: string | null;
  synopsis: string | null;
  event_type: string;
  release_date: string | null;
  venue: string | null;
  city: string | null;
  poster_url: string | null;
  trailer_url: string | null;
  booking_open: boolean;
  is_active: boolean;
};

export const adminListEvents = createServerFn({ method: "GET" }).handler(async (): Promise<AdminEvent[]> => {
  const { requireUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  await requireUser(["admin", "editor", "event_manager"]);
  return await sql<AdminEvent[]>`
    SELECT id, title, tagline, synopsis, event_type, release_date, venue, city, poster_url, trailer_url,
           booking_open, is_active
    FROM events ORDER BY release_date IS NULL, release_date, title`;
});

const eventInput = z.object({
  id: z.string().uuid().optional(),
  title: text(200).min(1),
  tagline: text(300),
  synopsis: text(5000),
  event_type: z.enum(["movie", "concert", "live_show", "theatre", "festival", "other"]),
  release_date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  venue: text(200),
  city: text(100),
  trailer_url: text(500),
  poster_url: text(500),
});

export const saveEvent = createServerFn({ method: "POST" })
  .validator((d: unknown) => eventInput.parse(d))
  .handler(async ({ data: e }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec, uuid } = await import("@/server/db.server");
    await requireUser(["admin", "editor", "event_manager"]);
    if (e.id) {
      const r = await exec`
        UPDATE events SET title = ${e.title}, tagline = ${blank(e.tagline)}, synopsis = ${blank(e.synopsis)},
          event_type = ${e.event_type}, release_date = ${blank(e.release_date)}, venue = ${blank(e.venue)},
          city = ${blank(e.city)}, trailer_url = ${blank(e.trailer_url)}, poster_url = ${blank(e.poster_url)}
        WHERE id = ${e.id}`;
      if (!r.affectedRows) throw new Error("Event not found");
    } else {
      await exec`
        INSERT INTO events (id, title, tagline, synopsis, event_type, release_date, venue, city, trailer_url, poster_url)
        VALUES (${uuid()}, ${e.title}, ${blank(e.tagline)}, ${blank(e.synopsis)}, ${e.event_type}, ${blank(e.release_date)},
                ${blank(e.venue)}, ${blank(e.city)}, ${blank(e.trailer_url)}, ${blank(e.poster_url)})`;
    }
    return { ok: true };
  });

export const setEventFlag = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), field: z.enum(["booking_open", "is_active"]), value: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    await requireUser(["admin", "editor", "event_manager"]);
    if (data.field === "booking_open") await exec`UPDATE events SET booking_open = ${data.value ? 1 : 0} WHERE id = ${data.id}`;
    else await exec`UPDATE events SET is_active = ${data.value ? 1 : 0} WHERE id = ${data.id}`;
    return { ok: true };
  });

/* ───────────── bookings ───────────── */

export type AdminBooking = {
  id: string;
  booking_ref: string;
  customer_name: string;
  email: string | null;
  phone: string;
  city: string;
  seat_category: string;
  num_seats: number;
  unit_price: number;
  total_price: number;
  /** GST / service charge build-up; null for bookings made before GST was itemised. */
  breakup: PriceBreakup | null;
  created_at: string;
  booking_source: string;
  executive_id: string | null;
  payment_status: string;
  payment_ref: string | null;
  merchant_transaction_id: string | null;
  paid_at: string | null;
  ticket_code: string | null;
  halls: { name: string } | null;
  events: { title: string } | null;
  executives: { name: string } | null;
};

export const adminListBookings = createServerFn({ method: "GET" }).handler(async (): Promise<AdminBooking[]> => {
  const { requireUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  const user = await requireUser(["admin", "booking_manager", "executive"]);

  const seesAll = user.roles.includes("admin") || user.roles.includes("booking_manager");
  let myExecutiveId: string | null = null;
  if (!seesAll) {
    // Executives only see bookings they made themselves.
    const [me] = await sql<{ id: string }[]>`SELECT id FROM executives WHERE user_id = ${user.id}`;
    if (!me) return [];
    myExecutiveId = me.id;
  }

  type Flat = Omit<AdminBooking, "halls" | "events" | "executives" | "breakup"> & {
    price_breakup: string | null;
    hall_name: string | null;
    event_title: string | null;
    exec_name: string | null;
  };
  const rows = await sql<Flat[]>`
    SELECT b.id, b.booking_ref, b.customer_name, b.email, b.phone, b.city, b.seat_category, b.num_seats,
           b.unit_price, b.total_price, b.price_breakup, b.created_at, b.booking_source, b.executive_id, b.payment_status,
           b.payment_ref,
           (SELECT pa.merch_txn_id FROM payment_attempts pa WHERE pa.booking_id = b.id ORDER BY pa.created_at DESC LIMIT 1) AS merchant_transaction_id,
           b.paid_at, b.ticket_code,
           h.name AS hall_name, e.title AS event_title, x.name AS exec_name
    FROM bookings b
    LEFT JOIN halls h ON h.id = b.hall_id
    LEFT JOIN events e ON e.id = b.event_id
    LEFT JOIN executives x ON x.id = b.executive_id
    WHERE (${myExecutiveId} IS NULL OR b.executive_id = ${myExecutiveId})
    ORDER BY b.created_at DESC`;

  const parse = (json: string | null): PriceBreakup | null => {
    try {
      return json ? (JSON.parse(json) as PriceBreakup) : null;
    } catch {
      return null;
    }
  };
  return rows.map(({ hall_name, event_title, exec_name, price_breakup, ...b }) => ({
    ...b,
    breakup: parse(price_breakup),
    halls: hall_name === null ? null : { name: hall_name },
    events: event_title === null ? null : { title: event_title },
    executives: exec_name === null ? null : { name: exec_name },
  }));
});

/* ───────────── payment reconciliation ───────────── */

const PAYMENT_ADMINS = ["admin", "booking_manager"] as const;

/**
 * Reconciliation: change a booking's payment status by hand (e.g. the customer paid but the gateway callback never
 * arrived, or money was received offline). Allowed moves: pending/failed -> paid, pending -> failed, paid -> refunded.
 * Every change is written to the activity log with who, what and why.
 */
export const adminSetPaymentStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        bookingId: z.string().uuid(),
        status: z.enum(["paid", "failed", "refunded"]),
        /** Gateway/bank/UTR reference that proves the payment. Required when marking paid. */
        reference: text(100),
        note: text(300),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction, dbTime } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const { randomBytes } = await import("node:crypto");
    const user = await requireUser([...PAYMENT_ADMINS]);

    if (data.status === "paid" && data.reference.length < 4) {
      throw new Error("Enter the payment reference (gateway transaction ID, UTR or receipt number) so this can be reconciled later.");
    }
    if (data.status !== "paid" && data.note.length < 3) throw new Error("Please add a short reason.");

    const result = await transaction(
      async (tx) => {
        const [b] = await tx.sql<{ id: string; booking_ref: string; payment_status: string }[]>`
          SELECT id, booking_ref, payment_status FROM bookings WHERE id = ${data.bookingId} FOR UPDATE`;
        if (!b) throw new Error("Booking not found.");
        const from = b.payment_status;
        const allowed =
          (data.status === "paid" && (from === "pending" || from === "failed")) ||
          (data.status === "failed" && from === "pending") ||
          (data.status === "refunded" && from === "paid");
        if (!allowed) throw new Error(`A booking that is "${from}" cannot be changed to "${data.status}".`);

        if (data.status === "paid") {
          const ticketCode = `TKT-${b.booking_ref}-${randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`;
          await tx.exec`
            UPDATE bookings
            SET payment_status = 'paid', payment_provider = 'manual', payment_ref = ${data.reference},
                paid_at = ${dbTime()}, ticket_code = COALESCE(ticket_code, ${ticketCode}), status = 'confirmed'
            WHERE id = ${b.id}`;
          // Keep the booking tied to its gateway attempt: mark the latest unpaid attempt as reconciled.
          await tx.exec`
            UPDATE payment_attempts
            SET status = 'paid', atom_txn_id = COALESCE(atom_txn_id, ${data.reference}),
                description = ${`Manually reconciled by ${user.email}${data.note ? `: ${data.note}` : ""}`.slice(0, 500)},
                completed_at = UTC_TIMESTAMP(3)
            WHERE booking_id = ${b.id} AND status <> 'paid' ORDER BY created_at DESC LIMIT 1`;
        } else if (data.status === "failed") {
          await tx.exec`UPDATE bookings SET payment_status = 'failed' WHERE id = ${b.id}`;
        } else {
          await tx.exec`UPDATE bookings SET payment_status = 'refunded', status = 'cancelled' WHERE id = ${b.id}`;
        }
        return { from, ref: b.booking_ref };
      },
      { lock: `dmojo_pay_${data.bookingId}` },
    );
    await audit(user, "payment_status", "booking", data.bookingId, {
      booking: result.ref,
      from: result.from,
      to: data.status,
      reference: data.reference || undefined,
      note: data.note || undefined,
    });
    return { ok: true };
  });

/** Asks the payment gateway about a booking's open attempts and updates the booking if it was actually paid. */
export const adminSyncPayment = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ status: string; message: string }> => {
    const { requireUser } = await import("@/server/auth.server");
    const { sql } = await import("@/server/db.server");
    const atom = await import("@/server/atom.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser([...PAYMENT_ADMINS]);
    if (atom.paymentProvider() !== "atom") throw new Error("The payment gateway is not enabled on this server, so there is nothing to check.");

    const attempts = await sql<{ merch_txn_id: string }[]>`
      SELECT merch_txn_id FROM payment_attempts WHERE booking_id = ${data.bookingId} AND status <> 'paid'
      ORDER BY created_at DESC LIMIT 5`;
    if (!attempts.length) throw new Error("This booking has no gateway payment attempt to check. Use “Mark as paid” if you received the money another way.");
    for (const a of attempts) await atom.syncAttempt(a.merch_txn_id);
    const [b] = await sql<{ payment_status: string }[]>`SELECT payment_status FROM bookings WHERE id = ${data.bookingId}`;
    await audit(user, "payment_sync", "booking", data.bookingId, { result: b?.payment_status });
    return {
      status: b?.payment_status ?? "unknown",
      message:
        b?.payment_status === "paid"
          ? "The gateway confirms this payment. The booking is now paid and the ticket is issued."
          : "The gateway has no successful payment for this booking.",
    };
  });

/* ───────────── deletes ───────────── */

export const deleteRecord = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ table: z.enum(["events", "halls", "executives", "bookings"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    switch (data.table) {
      case "events":
        await requireUser(["admin", "editor"]);
        await exec`DELETE FROM events WHERE id = ${data.id}`;
        break;
      case "halls":
        await requireUser(["admin"]);
        await exec`DELETE FROM halls WHERE id = ${data.id}`;
        break;
      case "executives":
        await requireUser(["admin"]);
        await exec`DELETE FROM executives WHERE id = ${data.id}`;
        break;
      case "bookings":
        await requireUser(["admin"]);
        await exec`DELETE FROM bookings WHERE id = ${data.id}`;
        break;
    }
    return { ok: true };
  });
