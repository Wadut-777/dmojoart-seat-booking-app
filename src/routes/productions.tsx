import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";

import { listPublicEvents } from "@/lib/events.functions";

export const Route = createFileRoute("/productions")({
  head: () => ({
    meta: [
      { title: "Productions — D Mojo Art" },
      {
        name: "description",
        content: "Productions published by D Mojo Art.",
      },
      { property: "og:title", content: "Productions — D Mojo Art" },
      {
        property: "og:description",
        content: "Explore productions published by D Mojo Art.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Productions,
});

function Productions() {
  const { data: productions = [], isLoading, isError } = useQuery({
    queryKey: ["public-productions"],
    queryFn: () => listPublicEvents(),
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-20">
      {isLoading && <p className="text-muted-foreground">Loading productions…</p>}

      {isError && (
        <p role="alert" className="text-muted-foreground">
          Productions could not be loaded. Please try again later.
        </p>
      )}

      {!isLoading && !isError && productions.length === 0 && (
        <p className="text-muted-foreground">No productions have been published yet.</p>
      )}

      {productions.length > 0 && (
        <div className="space-y-8">
          {productions.map((production) => (
            <article
              key={production.id}
              className="panel grid gap-6 p-6 md:grid-cols-[220px_1fr]"
            >
              {production.posterUrl && (
                <img
                  src={production.posterUrl}
                  alt={production.title}
                  className="w-full rounded-lg object-cover"
                  loading="lazy"
                />
              )}
              <div>
                <h2 className="text-3xl">{production.title}</h2>
                {(production.releaseDate || production.eventType) && (
                  <p className="mt-1 text-sm font-semibold text-primary">
                    {[
                      production.releaseDate
                        ? new Date(production.releaseDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : null,
                      production.eventType.replaceAll("_", " "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {(production.tagline || production.venue || production.city) && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {[production.tagline, production.venue, production.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {production.synopsis && (
                  <p className="mt-3 text-muted-foreground">{production.synopsis}</p>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  {production.trailerUrl && (
                    <a
                      href={production.trailerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted"
                    >
                      <Play className="size-4 text-primary" /> Trailer
                    </a>
                  )}
                  {production.bookingOpen && (
                    <Link
                      to="/prebook"
                      className="gold-surface rounded-full px-5 py-2 text-sm font-bold hover:scale-105"
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
    </main>
  );
}
