import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Image upload for admins and editors. multipart/form-data: `file` + `folder` (posters | blocks). */
export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Cross-site request guard (the session cookie is also SameSite=Lax).
        const origin = request.headers.get("origin");
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
        if (origin && new URL(origin).host !== host) return json({ error: "Cross-site request blocked." }, 403);

        const { requireUser } = await import("@/server/auth.server");
        const { saveUpload, UPLOAD_FOLDERS } = await import("@/server/media.server");
        try {
          await requireUser(["admin", "editor", "event_manager"]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unauthorized";
          return json({ error: msg }, msg.startsWith("Forbidden") ? 403 : 401);
        }

        const form = await request.formData();
        const file = form.get("file");
        const folder = form.get("folder");
        if (!(file instanceof File)) return json({ error: "No file received." }, 400);
        if (typeof folder !== "string" || !(UPLOAD_FOLDERS as readonly string[]).includes(folder)) {
          return json({ error: "Invalid folder." }, 400);
        }
        try {
          const path = await saveUpload(folder as (typeof UPLOAD_FOLDERS)[number], file);
          return json({ path });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Upload failed." }, 400);
        }
      },
    },
  },
});
