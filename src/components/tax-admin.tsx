import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { computeBreakup, DEFAULT_TAX, rupees, type TaxSettings } from "@/lib/pricing";
import { adminSaveTaxSettings, getTaxSettings } from "@/lib/tax.functions";

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const label = "block space-y-1";
const cap = "text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground";

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={label}>
      <span className={cap}>{title}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const num = (v: string) => (v === "" ? 0 : Number(v));

/** Admin: GST, service charge and the seller details that appear on tax invoices. */
export function TaxAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tax-settings"], queryFn: () => getTaxSettings() });
  const [t, setT] = useState<TaxSettings>(DEFAULT_TAX);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setT(q.data);
  }, [q.data]);

  const set = <K extends keyof TaxSettings>(k: K, v: TaxSettings[K]) => setT((p) => ({ ...p, [k]: v }));
  const setSeller = <K extends keyof TaxSettings["seller"]>(k: K, v: string) => setT((p) => ({ ...p, seller: { ...p.seller, [k]: v } }));

  const sample = computeBreakup(300, 2, t);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminSaveTaxSettings({ data: t });
      await qc.invalidateQueries({ queryKey: ["tax-settings"] });
      toast.success("Saved. New bookings use these settings; existing bookings and invoices are not changed.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Could not save.";
      let msg = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string }[];
        if (Array.isArray(parsed) && parsed[0]?.message) msg = parsed[0].message;
      } catch {
        /* plain message */
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="panel max-w-3xl space-y-8 p-6 md:p-8">
      <div>
        <h2 className="text-2xl">Pricing, GST and invoices</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Applies to new bookings only. With GST off and no service charge, customers pay exactly the seat price, as before.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-lg">GST</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={t.gstEnabled} onChange={(e) => set("gstEnabled", e.target.checked)} /> Charge GST on bookings
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field title="GST on tickets (%)" hint="Set this as applicable to your ticket price. Check the rate with your tax advisor.">
            <input type="number" min={0} max={40} step="0.01" className={input} value={t.ticketGstRate} onChange={(e) => set("ticketGstRate", num(e.target.value))} />
          </Field>
          <Field title="How are ticket prices set?">
            <select className={input} value={t.pricesIncludeGst ? "incl" : "excl"} onChange={(e) => set("pricesIncludeGst", e.target.value === "incl")}>
              <option value="excl">Prices exclude GST (GST is added on top)</option>
              <option value="incl">Prices include GST (GST is shown inside the price)</option>
            </select>
          </Field>
          <Field title="Tax shown on invoice as">
            <select className={input} value={t.gstSplit} onChange={(e) => set("gstSplit", e.target.value as TaxSettings["gstSplit"])}>
              <option value="cgst_sgst">CGST + SGST (event is in the seller's state)</option>
              <option value="igst">IGST (event is in another state)</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg">Service charge</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field title="Type">
            <select className={input} value={t.serviceChargeType} onChange={(e) => set("serviceChargeType", e.target.value as TaxSettings["serviceChargeType"])}>
              <option value="none">No service charge</option>
              <option value="percent">Percent of ticket price</option>
              <option value="flat">Flat amount per ticket</option>
            </select>
          </Field>
          <Field title={t.serviceChargeType === "flat" ? "Amount per ticket (₹)" : "Percent (%)"}>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={t.serviceChargeType === "none"}
              className={input}
              value={t.serviceChargeValue}
              onChange={(e) => set("serviceChargeValue", num(e.target.value))}
            />
          </Field>
          <Field title="GST on service charge (%)" hint="Used only when GST is switched on.">
            <input type="number" min={0} max={40} step="0.01" className={input} value={t.serviceChargeGstRate} onChange={(e) => set("serviceChargeGstRate", num(e.target.value))} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-muted/30 p-4 text-sm">
        <p className={cap}>Example: 2 tickets at ₹300</p>
        <dl className="mt-3 space-y-1 tabular-nums">
          <Row k="Ticket value (before GST)" v={sample.taxableTicket} />
          {sample.ticketGst > 0 && <Row k={`GST @ ${sample.ticketGstRate}%`} v={sample.ticketGst} />}
          {sample.serviceCharge > 0 && <Row k="Service charge" v={sample.serviceCharge} />}
          {sample.serviceChargeGst > 0 && <Row k={`GST @ ${sample.serviceChargeGstRate}% on service charge`} v={sample.serviceChargeGst} />}
          {Math.abs(sample.roundOff) > 0.004 && <Row k="Round off" v={sample.roundOff} />}
          <Row k="Customer pays" v={sample.total} strong />
        </dl>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg">Seller details on the invoice</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field title="Legal name">
            <input className={input} value={t.seller.legalName} onChange={(e) => setSeller("legalName", e.target.value)} />
          </Field>
          <Field title="GSTIN" hint="15 characters. Required before GST can be switched on.">
            <input className={input} maxLength={15} value={t.seller.gstin} onChange={(e) => setSeller("gstin", e.target.value.toUpperCase())} />
          </Field>
          <Field title="Address">
            <textarea rows={3} className={input} value={t.seller.address} onChange={(e) => setSeller("address", e.target.value)} />
          </Field>
          <div className="grid gap-4">
            <Field title="State">
              <input className={input} value={t.seller.state} onChange={(e) => setSeller("state", e.target.value)} />
            </Field>
            <Field title="State code (GST)">
              <input className={input} maxLength={2} value={t.seller.stateCode} onChange={(e) => setSeller("stateCode", e.target.value)} />
            </Field>
          </div>
          <Field title="Email on invoice">
            <input className={input} value={t.seller.email} onChange={(e) => setSeller("email", e.target.value)} />
          </Field>
          <Field title="Phone on invoice">
            <input className={input} value={t.seller.phone} onChange={(e) => setSeller("phone", e.target.value)} />
          </Field>
          <Field title="SAC code" hint="Service accounting code for the ticket sale.">
            <input className={input} maxLength={10} value={t.seller.sacCode} onChange={(e) => setSeller("sacCode", e.target.value)} />
          </Field>
          <Field title="Invoice number prefix" hint={`Invoices are numbered like ${t.seller.invoicePrefix || "INV"}/2026-27/000001 and restart each financial year.`}>
            <input className={input} maxLength={10} value={t.seller.invoicePrefix} onChange={(e) => setSeller("invoicePrefix", e.target.value)} />
          </Field>
        </div>
        <Field title="Footer note">
          <textarea rows={2} className={input} value={t.seller.footerNote} onChange={(e) => setSeller("footerNote", e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">
          Seller details are saved on each invoice when it is first downloaded, so changing them later does not alter invoices already issued.
        </p>
      </section>

      <button type="submit" disabled={busy || q.isLoading} className="gold-surface rounded-full px-8 py-3 text-sm font-bold uppercase tracking-wide disabled:opacity-60">
        {busy ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

function Row({ k, v, strong = false }: { k: string; v: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-border pt-2 font-bold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{k}</dt>
      <dd>
        {v < 0 ? "-" : ""}₹{rupees(Math.abs(v))}
      </dd>
    </div>
  );
}
