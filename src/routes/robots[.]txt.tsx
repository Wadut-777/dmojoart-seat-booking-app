import { createFileRoute } from "@tanstack/react-router";

/** robots.txt with an absolute sitemap link. Admin, sign-in and API paths are kept out of search results. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { siteOriginFor } = await import("@/server/seo.server");
        const origin = siteOriginFor(request.headers);
        const text = ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /auth", "Disallow: /api/", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
        return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
