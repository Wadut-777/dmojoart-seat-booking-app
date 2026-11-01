import { createServerFn } from "@tanstack/react-start";

import type { CategoryRow } from "@/server/halls.server";

/** Public (no sign-in) reads used by the pre-booking and events pages. */

export type PublicHall = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  screen: string | null;
  show_time: string | null;
  hall_categories: { id: string; name: string; price: number; capacity: number }[];
};

export const listPublicHalls = createServerFn({ method: "GET" }).handler(async (): Promise<PublicHall[]> => {
  const { sql } = await import("@/server/db.server");
  const { hallsWithCategories } = await import("@/server/halls.server");
  const halls = await sql<Omit<PublicHall, "hall_categories">[]>`
    SELECT id, name, city, address, screen, show_time FROM halls
    WHERE is_active = 1 ORDER BY city, name`;
  const cats = await sql<CategoryRow[]>`
    SELECT c.id, c.hall_id, c.name, c.price, c.capacity
    FROM hall_categories c JOIN halls h ON h.id = c.hall_id
    WHERE h.is_active = 1 ORDER BY c.created_at, c.price DESC, c.name`;
  return hallsWithCategories(halls, cats);
});

export type BookableEvent = { id: string; title: string; release_date: string | null };

export const listBookableEvents = createServerFn({ method: "GET" }).handler(async (): Promise<BookableEvent[]> => {
  const { sql } = await import("@/server/db.server");
  return await sql<BookableEvent[]>`
    SELECT id, title, release_date FROM events
    WHERE is_active = 1 AND booking_open = 1
    ORDER BY release_date IS NULL, release_date, title`;
});

export type PublicExecutive = { id: string; name: string; city: string | null };

/** Name and city only — bank and ID details never leave the admin functions. */
export const listPublicExecutives = createServerFn({ method: "GET" }).handler(async (): Promise<PublicExecutive[]> => {
  const { sql } = await import("@/server/db.server");
  return await sql<PublicExecutive[]>`SELECT id, name, city FROM executives WHERE is_active = 1 ORDER BY name`;
});
