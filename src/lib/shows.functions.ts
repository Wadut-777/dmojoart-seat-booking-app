import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isUpcoming, nowIst, showLabel, type PublicShow } from "@/lib/shows";

/** Roles that may manage show times (same people who manage movies and events). */
const SHOW_ROLES = ["admin", "editor", "event_manager"] as const;

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/* ───────────── public ───────────── */

/**
 * Upcoming shows people can book. `configured` is true when the event has been listed on specific halls and
 * show times; the booking page then offers only those. For events without any shows it is false and booking
 * works as it always did (any hall, hall's default show time).
 */
export const listPublicShows = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ eventId: uuid.optional().or(z.literal("")) }).parse(d))
  .handler(async ({ data }): Promise<{ configured: boolean; shows: PublicShow[] }> => {
    const { sql } = await import("@/server/db.server");
    const eventId = data.eventId || null;
    const rows = await sql<{ id: string; hall_id: string; event_id: string; title: string; show_date: string; show_time: string }[]>`
      SELECT s.id, s.hall_id, s.event_id, e.title, s.show_date, s.show_time
      FROM hall_shows s
      JOIN halls h ON h.id = s.hall_id AND h.is_active = 1
      JOIN events e ON e.id = s.event_id AND e.is_active = 1 AND e.booking_open = 1
      WHERE s.is_active = 1 AND s.show_date >= ${nowIst().date} AND (${eventId} IS NULL OR s.event_id = ${eventId})
      ORDER BY s.show_date, s.show_time`;
    const shows = rows
      .filter((r) => isUpcoming(r.show_date, r.show_time))
      .map((r) => ({
        id: r.id,
        hallId: r.hall_id,
        eventId: r.event_id,
        eventTitle: r.title,
        date: r.show_date,
        time: r.show_time,
        label: showLabel(r.show_date, r.show_time),
      }));
    let configured = false;
    if (eventId) {
      const [c] = await sql<{ n: number }[]>`SELECT COUNT(*) AS n FROM hall_shows WHERE event_id = ${eventId} AND is_active = 1`;
      configured = Number(c?.n ?? 0) > 0;
    }
    return { configured, shows };
  });

/* ───────────── admin ───────────── */

export type AdminShow = {
  id: string;
  hallId: string;
  hallName: string;
  city: string;
  eventId: string;
  eventTitle: string;
  date: string;
  time: string;
  label: string;
  isActive: boolean;
  past: boolean;
  bookings: number;
};

export const adminListShows = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ hallId: uuid.optional(), eventId: uuid.optional() }).parse(d))
  .handler(async ({ data }): Promise<AdminShow[]> => {
    const { requireUser } = await import("@/server/auth.server");
    const { sql } = await import("@/server/db.server");
    await requireUser([...SHOW_ROLES]);
    const hallId = data.hallId ?? null;
    const eventId = data.eventId ?? null;
    const rows = await sql<
      { id: string; hall_id: string; hall_name: string; city: string; event_id: string; title: string; show_date: string; show_time: string; is_active: boolean; bookings: number }[]
    >`
      SELECT s.id, s.hall_id, h.name AS hall_name, h.city, s.event_id, e.title, s.show_date, s.show_time, s.is_active,
             (SELECT COUNT(*) FROM bookings b WHERE b.show_id = s.id) AS bookings
      FROM hall_shows s
      JOIN halls h ON h.id = s.hall_id
      JOIN events e ON e.id = s.event_id
      WHERE (${hallId} IS NULL OR s.hall_id = ${hallId}) AND (${eventId} IS NULL OR s.event_id = ${eventId})
      ORDER BY s.show_date, s.show_time, h.city, h.name
      LIMIT 1000`;
    return rows.map((r) => ({
      id: r.id,
      hallId: r.hall_id,
      hallName: r.hall_name,
      city: r.city,
      eventId: r.event_id,
      eventTitle: r.title,
      date: r.show_date,
      time: r.show_time,
      label: showLabel(r.show_date, r.show_time),
      isActive: !!r.is_active,
      past: !isUpcoming(r.show_date, r.show_time),
      bookings: Number(r.bookings),
    }));
  });

/**
 * Lists an event on the chosen halls at the chosen dates and times (every hall × date × time combination).
 * Shows that already exist are skipped.
 */
export const adminAddShows = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        eventId: uuid,
        hallIds: z.array(uuid).min(1).max(60),
        dates: z.array(date).min(1).max(120),
        times: z.array(time).min(1).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ added: number; skipped: number }> => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction, uuid: newId } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser([...SHOW_ROLES]);

    const dates = [...new Set(data.dates)];
    const times = [...new Set(data.times)];
    const hallIds = [...new Set(data.hallIds)];
    if (hallIds.length * dates.length * times.length > 1000) throw new Error("That is too many shows at once. Please add them in smaller batches.");
    const today = nowIst().date;
    if (dates.some((d: string) => d < today)) throw new Error("Show dates cannot be in the past.");

    let added = 0;
    await transaction(async (tx) => {
      const [ev] = await tx.sql<{ id: string }[]>`SELECT id FROM events WHERE id = ${data.eventId}`;
      if (!ev) throw new Error("Movie / event not found.");
      for (const hallId of hallIds) {
        const [hall] = await tx.sql<{ id: string }[]>`SELECT id FROM halls WHERE id = ${hallId}`;
        if (!hall) throw new Error("A selected cinema hall was not found.");
        for (const d of dates) {
          for (const t of times) {
            const res = await tx.exec`
              INSERT IGNORE INTO hall_shows (id, hall_id, event_id, show_date, show_time)
              VALUES (${newId()}, ${hallId}, ${data.eventId}, ${d}, ${t})`;
            added += res.affectedRows;
          }
        }
      }
    });
    const total = hallIds.length * dates.length * times.length;
    await audit(user, "create", "shows", data.eventId, { halls: hallIds.length, dates: dates.length, times: times.length, added });
    return { added, skipped: total - added };
  });

/** Show or hide a show. Date and time can only be changed while nobody has booked it. */
export const adminUpdateShow = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid, isActive: z.boolean().optional(), date: date.optional(), time: time.optional() }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { sql, exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser([...SHOW_ROLES]);
    const [s] = await sql<{ n: number }[]>`SELECT (SELECT COUNT(*) FROM bookings WHERE show_id = ${data.id}) AS n FROM hall_shows WHERE id = ${data.id}`;
    if (!s) throw new Error("Show not found.");
    if ((data.date || data.time) && Number(s.n) > 0) throw new Error("This show already has bookings, so its date and time can't be changed. Hide it and add a new one instead.");
    try {
      await exec`
        UPDATE hall_shows SET
          is_active = COALESCE(${data.isActive === undefined ? null : data.isActive ? 1 : 0}, is_active),
          show_date = COALESCE(${data.date ?? null}, show_date),
          show_time = COALESCE(${data.time ?? null}, show_time)
        WHERE id = ${data.id}`;
    } catch (e) {
      if ((e as { errno?: number }).errno === 1062) throw new Error("That hall already has this show at that date and time.");
      throw e;
    }
    await audit(user, "update", "show", data.id, data);
    return { ok: true };
  });

export const adminDeleteShow = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { sql, exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser([...SHOW_ROLES]);
    const [s] = await sql<{ n: number }[]>`SELECT (SELECT COUNT(*) FROM bookings WHERE show_id = ${data.id}) AS n FROM hall_shows WHERE id = ${data.id}`;
    if (!s) return { ok: true };
    if (Number(s.n) > 0) throw new Error("This show has bookings, so it can't be deleted. Hide it instead.");
    await exec`DELETE FROM hall_shows WHERE id = ${data.id}`;
    await audit(user, "delete", "show", data.id);
    return { ok: true };
  });
