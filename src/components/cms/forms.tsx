import { useState } from "react";
import { toast } from "sonner";

import { submitEnquiry } from "@/lib/cms.functions";
import type { EnquiryKind } from "@/lib/cms-schema";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-2xl border border-input bg-card px-5 py-3.5 text-base outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary";

type Extra = { key: string; label: string; placeholder?: string };

const EXTRA_FIELDS: Record<string, Extra[]> = {
  business: [{ key: "company", label: "Company (optional)" }],
  event_booking: [
    { key: "eventDate", label: "Preferred date", placeholder: "e.g. 12 Dec 2026" },
    { key: "location", label: "City / venue" },
    { key: "audience", label: "Expected audience" },
  ],
  production_collab: [
    { key: "projectType", label: "Type of project", placeholder: "Film, music video, series…" },
    { key: "timeline", label: "Timeline" },
  ],
  music_production: [
    { key: "projectType", label: "What do you need?", placeholder: "Recording, composition, mixing…" },
    { key: "genre", label: "Genre" },
  ],
  event_management: [
    { key: "eventType", label: "Type of event", placeholder: "Corporate, festival, concert…" },
    { key: "eventDate", label: "Preferred date" },
    { key: "audience", label: "Expected audience" },
  ],
};

const CONTACT_CHOICES: { value: EnquiryKind; label: string }[] = [
  { value: "business", label: "Business enquiry" },
  { value: "event_booking", label: "Event booking enquiry" },
  { value: "production_collab", label: "Production collaboration" },
];

/** Turns a server error (often a JSON list of validation issues) into one readable sentence. */
export function readableError(e: unknown): string {
  const raw = e instanceof Error ? e.message : "Something went wrong. Please try again.";
  try {
    const parsed = JSON.parse(raw) as { message?: string }[];
    const first = Array.isArray(parsed) ? parsed[0]?.message : undefined;
    if (first) return first;
  } catch {
    /* not JSON */
  }
  return raw;
}

export function EnquiryForm({ kind, submitText = "Send enquiry" }: { kind: string; submitText?: string }) {
  const chooser = kind === "contact";
  const [selected, setSelected] = useState<EnquiryKind>(chooser ? "business" : (kind as EnquiryKind));
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const extras = EXTRA_FIELDS[selected] ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const extra: Record<string, string> = {};
      for (const x of extras) {
        const v = (values[x.key] ?? "").trim();
        if (v) extra[x.key] = v.slice(0, 500);
      }
      await submitEnquiry({
        data: {
          kind: selected,
          name: values["name"] ?? "",
          email: values["email"] ?? "",
          phone: values["phone"] ?? "",
          message: values["message"] ?? "",
          extra,
          website: values["website"] ?? "",
        },
      });
      setDone(true);
      setValues({});
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-3xl border border-primary/50 bg-card p-8">
        <p className="font-display text-2xl">Thank you</p>
        <p className="mt-2 text-muted-foreground">We have received your enquiry and will get back to you soon.</p>
        <button type="button" onClick={() => setDone(false)} className="mt-5 text-sm font-semibold text-primary">
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {chooser && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">What is this about?</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value as EnquiryKind)} className={field}>
            {CONTACT_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Name *</span>
          <input required autoComplete="name" value={values["name"] ?? ""} onChange={(e) => set("name", e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Email *</span>
          <input required type="email" autoComplete="email" value={values["email"] ?? ""} onChange={(e) => set("email", e.target.value)} className={field} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Phone (optional)</span>
        <input type="tel" autoComplete="tel" value={values["phone"] ?? ""} onChange={(e) => set("phone", e.target.value)} className={field} />
      </label>
      {extras.length > 0 && (
        <div className={cn("grid gap-4", extras.length > 1 && "sm:grid-cols-2")}>
          {extras.map((x) => (
            <label key={x.key} className="block">
              <span className="mb-1 block text-sm font-semibold">{x.label}</span>
              <input value={values[x.key] ?? ""} placeholder={x.placeholder ?? ""} onChange={(e) => set(x.key, e.target.value)} className={field} />
            </label>
          ))}
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Message *</span>
        <textarea required rows={5} value={values["message"] ?? ""} onChange={(e) => set("message", e.target.value)} className={field} />
      </label>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={values["website"] ?? ""} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>
      <button type="submit" disabled={busy} className="gold-surface rounded-full px-9 py-4 text-sm font-medium uppercase tracking-wide disabled:opacity-60">
        {busy ? "Sending…" : submitText}
      </button>
    </form>
  );
}

export function NewsletterForm({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitEnquiry({ data: { kind: "newsletter", email, name: "", phone: "", message: "", extra: {}, website: "" } });
      toast.success("You are subscribed.");
      setEmail("");
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={cn("flex max-w-md", className)} noValidate>
      <label className="sr-only" htmlFor="newsletter-email">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        className="min-w-0 flex-1 rounded-l-full border border-input bg-background px-5 py-3 outline-none focus:border-primary"
      />
      <button type="submit" disabled={busy} className="gold-surface rounded-r-full px-6 text-sm font-medium uppercase tracking-wide disabled:opacity-60">
        {busy ? "…" : "Join"}
      </button>
    </form>
  );
}
