import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Play } from "lucide-react";

import { listPublicHalls } from "@/lib/catalog.functions";
import { listPublicEvents } from "@/lib/events.functions";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Upcoming Events — D Mojo Art" },
      {
        name: "description",
        content: "Cinema halls and cities where PremXL and D Mojo Art events are happening next.",
      },
      { property: "og:title", content: "Upcoming Events — D Mojo Art" },
      {
        property: "og:description",
        content: "See every city and cinema hall screening PremXL from 2 October 2026.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Events,
});

function Events() {
  const { data: shows } = useQuery({
    queryKey: ["public-events"],
    queryFn: () => listPublicEvents(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["halls-public"],
    queryFn: () => listPublicHalls(),
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-20">
      <p className="text-xs font-bold tracking-[0.45em] text-primary">UPCOMING EVENTS</p>
      <h1 className="mt-4 text-4xl md:text-6xl">PremXL across Assam</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Pre-booking is open for every hall below. Final screen, show time and seat allocation will
        be confirmed by 30 September 2026.
      </p>

      {!!shows?.length && (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shows.map((s) => (
            <article key={s.id} className="panel overflow-hidden">
              {s.posterUrl && (
                <img src={s.posterUrl} alt={s.title} className="aspect-[3/4] w-full object-cover" />
              )}
              <div className="space-y-2 p-5">
                <p className="text-xs font-bold tracking-[0.25em] text-primary">
                  {s.releaseDate
                    ? new Date(s.releaseDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "Date to be announced"}
                </p>
                <h2 className="text-2xl">{s.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {[s.tagline, s.venue, s.city].filter(Boolean).join(" · ") || "Venue to be confirmed"}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {s.trailerUrl && (
                    <a
                      href={s.trailerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                    >
                      <Play className="size-4 text-primary" /> Trailer
                    </a>
                  )}
                  {s.bookingOpen && (
                    <Link
                      to="/prebook"
                      className="gold-surface rounded-full px-4 py-2 text-sm font-bold hover:scale-105"
                    >
                      Pre-book
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-16 text-3xl">Cinema halls</h2>
      {isLoading && <p className="mt-10 text-muted-foreground">Loading halls…</p>}

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {data?.map((h) => (
          <div key={h.id} className="panel p-6">
            <p className="inline-flex items-center gap-2 text-sm font-bold text-primary">
              <MapPin className="size-4" /> {h.city}
            </p>
            <h2 className="mt-2 text-2xl">{h.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {h.address || "Address to be confirmed"} · Show time {h.show_time || "to be confirmed"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {h.hall_categories.map((c) => (
                <span
                  key={c.name}
                  className="rounded-full border border-border px-3 py-1 text-xs font-semibold"
                >
                  {c.name} · ₹{c.price}
                </span>
              ))}
            </div>
            <Link
              to="/prebook"
              className="gold-surface mt-5 inline-block rounded-full px-5 py-2 text-sm font-bold hover:scale-105"
            >
              Pre-book here
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
