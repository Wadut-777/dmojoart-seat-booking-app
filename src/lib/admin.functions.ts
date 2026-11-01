import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  await requireUser(["admin", "editor"]);
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
    await requireUser(["admin", "editor"]);
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
    await requireUser(["admin", "editor"]);
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

  type Flat = Omit<AdminBooking, "halls" | "events" | "executives"> & {
    hall_name: string | null;
    event_title: string | null;
    exec_name: string | null;
  };
  const rows = await sql<Flat[]>`
    SELECT b.id, b.booking_ref, b.customer_name, b.email, b.phone, b.city, b.seat_category, b.num_seats,
           b.unit_price, b.total_price, b.created_at, b.booking_source, b.executive_id, b.payment_status,
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

  return rows.map(({ hall_name, event_title, exec_name, ...b }) => ({
    ...b,
    halls: hall_name === null ? null : { name: hall_name },
    events: event_title === null ? null : { title: event_title },
    executives: exec_name === null ? null : { name: exec_name },
  }));
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
