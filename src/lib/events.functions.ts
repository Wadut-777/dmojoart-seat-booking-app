import { createServerFn } from "@tanstack/react-start";

import { mediaUrl } from "@/lib/media";

export type PublicEvent = {
  id: string;
  title: string;
  tagline: string | null;
  eventType: string;
  releaseDate: string | null;
  venue: string | null;
  city: string | null;
  synopsis: string | null;
  trailerUrl: string | null;
  posterUrl: string | null;
  bookingOpen: boolean;
};

export const listPublicEvents = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicEvent[]> => {
    const { sql } = await import("@/server/db.server");

    const rows = await sql<
      {
        id: string;
        title: string;
        tagline: string | null;
        event_type: string;
        release_date: string | null;
        venue: string | null;
        city: string | null;
        synopsis: string | null;
        trailer_url: string | null;
        poster_url: string | null;
        booking_open: boolean;
      }[]
    >`
      SELECT id, title, tagline, event_type, release_date, venue, city, synopsis,
             trailer_url, poster_url, booking_open
      FROM events
      WHERE is_active = 1
      ORDER BY release_date IS NULL, release_date, title`;

    return rows.map((e) => ({
      id: e.id,
      title: e.title,
      tagline: e.tagline,
      eventType: e.event_type,
      releaseDate: e.release_date,
      venue: e.venue,
      city: e.city,
      synopsis: e.synopsis,
      trailerUrl: e.trailer_url,
      posterUrl: mediaUrl(e.poster_url),
      bookingOpen: e.booking_open,
    }));
  },
);
