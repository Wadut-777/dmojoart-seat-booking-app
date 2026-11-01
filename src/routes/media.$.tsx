import { createFileRoute } from "@tanstack/react-router";

/** Serves locally stored uploads (posters, page-builder images) from STORAGE_DIR. */
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { readUpload } = await import("@/server/media.server");
        const file = await readUpload(params["_splat"] ?? "");
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(new Uint8Array(file.body), {
          headers: {
            "content-type": file.type,
            "cache-control": "public, max-age=3600",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
