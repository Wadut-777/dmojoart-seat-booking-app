import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { adminSetPaymentStatus, adminSyncPayment, type AdminBooking } from "@/lib/admin.functions";

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

function message(e: unknown): string {
  const raw = e instanceof Error ? e.message : "Something went wrong.";
  try {
    const parsed = JSON.parse(raw) as { message?: string }[];
    if (Array.isArray(parsed) && parsed[0]?.message) return parsed[0].message;
  } catch {
    /* plain message */
  }
  return raw;
}

/** Reconciliation: check with the gateway, or set the payment status by hand with a reference and reason. */
export function PaymentDialog({ booking, onClose }: { booking: AdminBooking; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"paid" | "failed" | "refunded">(booking.payment_status === "paid" ? "refunded" : "paid");
  const [reference, setReference] = useState(booking.merchant_transaction_id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const options: { value: "paid" | "failed" | "refunded"; label: string }[] =
    booking.payment_status === "paid"
      ? [{ value: "refunded", label: "Refunded (cancels the booking and frees the seats)" }]
      : booking.payment_status === "pending"
        ? [
            { value: "paid", label: "Paid (issues the ticket)" },
            { value: "failed", label: "Failed" },
          ]
        : [{ value: "paid", label: "Paid (issues the ticket)" }];

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-bookings"] });

  async function check() {
    setBusy(true);
    try {
      const r = await adminSyncPayment({ data: { bookingId: booking.id } });
      await refresh();
      toast[r.status === "paid" ? "success" : "info"](r.message);
      if (r.status === "paid") onClose();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminSetPaymentStatus({ data: { bookingId: booking.id, status, reference: reference.trim(), note: note.trim() } });
      await refresh();
      toast.success(`Payment status changed to ${status}. The change is recorded in the activity log.`);
      onClose();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Reconcile payment" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/85 p-5 backdrop-blur">
      <form onSubmit={submit} className="panel w-full max-w-lg space-y-4 p-6">
        <div>
          <h3 className="text-xl">Reconcile payment</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {booking.booking_ref} · {booking.customer_name} · ₹{booking.total_price} · currently <strong>{booking.payment_status}</strong>
          </p>
          {booking.merchant_transaction_id && <p className="mt-1 font-mono text-xs text-muted-foreground">Merchant Transaction ID: {booking.merchant_transaction_id}</p>}
        </div>

        {booking.payment_status !== "paid" && (
          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm">
            <p>Not sure? Ask the payment gateway first. If it confirms the payment, the booking is updated automatically.</p>
            <button type="button" disabled={busy} onClick={check} className="mt-3 rounded-full border border-border px-5 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
              Check with gateway
            </button>
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Change status to</span>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {status === "paid" && (
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Payment reference *</span>
            <input className={input} required minLength={4} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Gateway transaction ID, UTR or receipt number" />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Reason / note {status === "paid" ? "(optional)" : "*"}</span>
          <textarea className={input} rows={2} required={status !== "paid"} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">Only mark a booking as paid after you have confirmed the money in the gateway dashboard or bank statement. Your name, the reference and the reason are recorded.</p>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="gold-surface rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-60">
            {busy ? "Saving…" : "Save change"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
