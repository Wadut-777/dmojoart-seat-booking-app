import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play, Ticket, MapPin, CalendarDays } from "lucide-react";
import { listPublicEvents } from "@/lib/events.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "D Mojo Art — PremXL in cinemas 2 October 2026" },
      {
        name: "description",
        content:
          "D Mojo Art presents PremXL. Watch the trailer, explore our productions and pre-book your tickets across Assam.",
      },
      { property: "og:title", content: "D Mojo Art — PremXL in cinemas 2 October 2026" },
      {
        property: "og:description",
        content: "Cinematic stories from Assam. Pre-book PremXL tickets now.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const TYPE_LABELS: Record<string, string> = {
  movie: "Feature Film",
  concert: "Concert",
  live_show: "Live Show",
  theatre: "Theatre",
  festival: "Festival",
  other: "Event",
};

function formatDate(d: string | null) {
  if (!d) return "Date to be announced";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Home() {
  const { data: releases = [], isLoading, isError } = useQuery({
    queryKey: ["public-events"],
    queryFn: () => listPublicEvents(),
  });

  // The first active event is the featured item. All copy and imagery come
  // from the events table; no production-specific fallback assets are used.
  const featured = releases[0];

  return (
    <main>
      {isLoading && (
        <section className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-muted-foreground">Loading productions…</p>
        </section>
      )}

      {isError && (
        <section className="mx-auto max-w-6xl px-5 py-20">
          <p role="alert" className="text-muted-foreground">
            Home page content could not be loaded. Please try again later.
          </p>
        </section>
      )}

      {!isLoading && !isError && featured && (
        <section className="hero-surface relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
            <div>
              <p className="text-xs font-bold tracking-[0.3em] text-primary">
                {featured.eventType ? TYPE_LABELS[featured.eventType] ?? "Featured production" : "Featured production"}
              </p>
              <h1 className="mt-5 text-4xl font-bold md:text-6xl">{featured.title}</h1>
              {featured.tagline && (
                <p className="mt-4 max-w-xl text-lg text-muted-foreground">{featured.tagline}</p>
              )}
              {featured.synopsis && (
                <p className="mt-4 max-w-xl text-muted-foreground">{featured.synopsis}</p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {featured.releaseDate && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1">
                    <CalendarDays className="size-4 text-primary" /> {formatDate(featured.releaseDate)}
                  </span>
                )}
                {(featured.city || featured.venue) && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1">
                    <MapPin className="size-4 text-primary" /> {[featured.venue, featured.city].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                {featured.bookingOpen && (
                  <Link
                    to="/prebook"
                    className="gold-surface glow inline-flex items-center gap-2 rounded-full px-7 py-3 font-bold transition-transform hover:scale-105"
                  >
                    <Ticket className="size-5" /> Pre-book Now
                  </Link>
                )}
                {featured.trailerUrl && (
                  <a
                    href={featured.trailerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-border px-7 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <Play className="size-5 text-primary" /> Watch Trailer
                  </a>
                )}
              </div>
            </div>
            {featured.posterUrl && (
              <div className="relative mx-auto w-full max-w-md">
                <img
                  src={featured.posterUrl}
                  alt={`${featured.title} poster`}
                  className="panel max-h-[620px] w-full object-contain"
                  fetchPriority="high"
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl md:text-4xl">Productions</h2>
          <Link to="/productions" className="text-sm text-primary hover:underline">
            View all productions
          </Link>
        </div>

        {isLoading && <p className="mt-8 text-muted-foreground">Loading productions…</p>}
        {isError && <p className="mt-8 text-muted-foreground">Productions are temporarily unavailable.</p>}

        {!isLoading && !isError && releases.length > 0 && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {releases.map((release) => (
              <article key={release.id} className="panel group overflow-hidden">
                {release.posterUrl && (
                  <div className="aspect-[3/4] overflow-hidden bg-muted">
                    <img
                      src={release.posterUrl}
                      alt={`${release.title} poster`}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="space-y-2 p-5">
                  <p className="text-xs font-bold tracking-[0.25em] text-primary">
                    {TYPE_LABELS[release.eventType] ?? "Event"}
                  </p>
                  <h3 className="text-2xl">{release.title}</h3>
                  {(release.tagline || release.releaseDate) && (
                    <p className="text-sm text-muted-foreground">
                      {[release.tagline, release.releaseDate ? formatDate(release.releaseDate) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {release.synopsis && (
                    <p className="text-sm text-muted-foreground">{release.synopsis}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {release.trailerUrl && (
                      <a
                        href={release.trailerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
                      >
                        <Play className="size-4 text-primary" /> Trailer
                      </a>
                    )}
                    {release.bookingOpen && (
                      <Link
                        to="/prebook"
                        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
                      >
                        <Ticket className="size-4 text-primary" /> Book
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && !isError && releases.length === 0 && (
          <p className="mt-8 text-muted-foreground">
            No productions have been published yet. Published productions will appear here automatically.
          </p>
        )}
      </section>
    </main>
  );
}
