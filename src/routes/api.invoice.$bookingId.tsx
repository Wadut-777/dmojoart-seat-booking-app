import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/invoice/<booking id>: downloads the tax invoice PDF for a paid booking.
 * Like the e-ticket page, access is by the booking's unguessable id, which only the customer and staff hold.
 */
export const Route = createFileRoute("/api/invoice/$bookingId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params["bookingId"] ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
        try {
          const { invoicePdfFor } = await import("@/server/invoice.server");
          const { pdf, invoiceNo } = await invoicePdfFor(id);
          return new Response(new Uint8Array(pdf), {
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `attachment; filename="Invoice-${invoiceNo.replace(/[^\w-]+/g, "_")}.pdf"`,
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not create the invoice.";
          const status = /not found/i.test(message) ? 404 : /payment is complete/i.test(message) ? 409 : 500;
          if (status === 500) console.error("[invoice]", e);
          return new Response(status === 500 ? "Could not create the invoice." : message, { status, headers: { "content-type": "text/plain" } });
        }
      },
    },
  },
});
