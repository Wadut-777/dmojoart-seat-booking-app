import { createFileRoute } from "@tanstack/react-router";

/** XML sitemap: every published CMS page plus the booking-related public pages. */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { siteOriginFor, xmlEscape } = await import("@/server/seo.server");
        const origin = siteOriginFor(request.headers);

        const { loadPageNodes, pathOf } = await import("@/server/pages.server");
        const nodes = await loadPageNodes();
        const urls = [
          ...nodes
            .filter((n) => n.isPublished)
            .map((n) => ({ loc: pathOf(nodes, n.slug) ?? `/${n.slug}`, lastmod: n.updatedAt.slice(0, 10) })),
          { loc: "/events", lastmod: undefined },
          { loc: "/productions", lastmod: undefined },
        ];
        const body = urls
          .map(
            (u) =>
              `  <url><loc>${xmlEscape(origin + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
          )
          .join("\n");
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
          { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } },
        );
      },
    },
  },
});
