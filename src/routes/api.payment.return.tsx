import { createFileRoute } from "@tanstack/react-router";

const redirect = (to: string) => new Response(null, { status: 303, headers: { location: to } });

/**
 * Atom POSTs the (encrypted) payment result here via the customer's browser.
 * Never trust the browser: we decrypt, verify the HMAC signature, check the amount against our
 * own record, and fall back to the Transaction Status API if the signature doesn't verify.
 * No cookie/CSRF check here on purpose — this request comes from the gateway's page.
 */
export const Route = createFileRoute("/api/payment/return")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const atom = await import("@/server/atom.server");
        const { sql } = await import("@/server/db.server");
        try {
          const form = await request.formData();
          const encData = form.get("encData");
          if (typeof encData !== "string" || !encData) return redirect("/prebook?payment=error");

          const { outcome, signatureValid } = atom.parseReturn(encData);
          let bookingId: string | null = null;
          if (signatureValid) {
            bookingId = await atom.settleOutcome(outcome);
          } else {
            console.error(`[atom] signature mismatch on return for ${outcome.merchTxnId}; checking status API`);
            await atom.syncAttempt(outcome.merchTxnId);
            const [a] = await sql<{ booking_id: string }[]>`
              SELECT booking_id FROM payment_attempts WHERE merch_txn_id = ${outcome.merchTxnId}`;
            bookingId = a?.booking_id ?? null;
          }
          return redirect(bookingId ? `/prebook?booking=${bookingId}` : "/prebook?payment=error");
        } catch (e) {
          console.error("[atom] return handler failed:", e instanceof Error ? e.message : e);
          return redirect("/prebook?payment=error");
        }
      },
    },
  },
});
