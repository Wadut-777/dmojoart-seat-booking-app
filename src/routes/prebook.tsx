import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { CheckCircle2, CreditCard, Download, Ticket } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";

import { getAvailability, listBookableEvents, listPublicExecutives, listPublicHalls } from "@/lib/catalog.functions";
import { getPaymentStatus, payForBooking, startPayment } from "@/lib/payments.functions";
import { createBooking } from "@/lib/bookings.functions";
import titleAsset from "@/assets/premxl-title.asset.json";

export const Route = createFileRoute("/prebook")({
  head: () => ({
    meta: [
      { title: "Pre-book PremXL Tickets — D Mojo Art" },
      {
        name: "description",
        content:
          "Choose your city, cinema hall and seat category to pre-book PremXL tickets for 2 October 2026.",
      },
      { property: "og:title", content: "Pre-book PremXL Tickets" },
      {
        property: "og:description",
        content: "Official D Mojo Art pre-booking for PremXL, in cinemas 2 October 2026.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Prebook,
});

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Enter a valid 10-digit mobile number"),
});

declare global {
  interface Window {
    AtomPaynetz?: new (options: Record<string, string>, env: string) => unknown;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AtomPaynetz) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment page."));
    document.body.appendChild(s);
  });
}

function Prebook() {
  const [eventId, setEventId] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [hallId, setHallId] = useState<string>("");
  const [category, setCategory] = useState<{ id: string; name: string; price: number } | null>(null);
  const [seats, setSeats] = useState(2);
  const [source, setSource] = useState<"self" | "executive">("self");
  const [executiveId, setExecutiveId] = useState<string>("");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{
    id: string;
    ref: string;
    total: number;
    hallName: string;
    city: string;
    showTime: string;
    category: string;
    seats: number;
    customer: string;
    eventTitle: string;
  } | null>(null);
  const [ticket, setTicket] = useState<{ code: string; paidAt: string; merchantTransactionId: string | null } | null>(null);

  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const data = await listBookableEvents();
      if (data[0] && !eventId) setEventId(data[0].id);
      return data;
    },
  });

  const { data: halls } = useQuery({
    queryKey: ["halls"],
    queryFn: () => listPublicHalls(),
  });

  // Seats left per category for the chosen hall and event (null = no limit set).
  const { data: availability, refetch: refetchAvailability } = useQuery({
    queryKey: ["availability", hallId, eventId],
    queryFn: () => getAvailability({ data: { hallId, eventId: eventId || "" } }),
    enabled: !!hallId,
    refetchInterval: 30_000,
  });
  const seatsAvailable = category ? (availability?.[category.id] ?? null) : null;

  const { data: executives } = useQuery({
    queryKey: ["executives-public"],
    queryFn: () => listPublicExecutives(),
  });

  const cities = useMemo(
    () => Array.from(new Set((halls ?? []).map((h) => h.city))).sort(),
    [halls],
  );
  const cityHalls = useMemo(
    () => (halls ?? []).filter((h) => !city || h.city === city),
    [halls, city],
  );

  const hall = halls?.find((h) => h.id === hallId) ?? null;
  const total = useMemo(() => (category ? category.price * seats : 0), [category, seats]);

  async function confirm() {
    const parsed = formSchema.safeParse(form);
    if (!hall || !category) {
      toast.error("Select a cinema hall and a seat category first.");
      return;
    }
    if (source === "executive" && !executiveId) {
      toast.error("Select the executive who is making this booking.");
      return;
    }
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details.");
      return;
    }
    setSaving(true);
    let data: Awaited<ReturnType<typeof createBooking>>;
    try {
      data = await createBooking({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          hallId: hall.id,
          eventId: eventId || "",
          categoryId: category.id,
          seats,
          source,
          executiveId: source === "executive" ? executiveId : "",
        },
      });
    } catch (e) {
      setSaving(false);
      const reason = e instanceof Error ? e.message : "";
      // Capacity messages come from the server and are safe to show as they are.
      toast.error(/^(Sold out|Only \d+)/.test(reason) ? reason : "We couldn't save your booking. Please try again.");
      void refetchAvailability();
      return;
    }
    void refetchAvailability();
    setSaving(false);
    setPending({
      id: data.id,
      ref: data.bookingRef,
      total: data.total,
      hallName: data.hallName,
      city: data.city,
      showTime: data.showTime || "To be confirmed",
      category: data.category,
      seats,
      customer: parsed.data.name,
      eventTitle: events?.find((e) => e.id === eventId)?.title ?? "PremXL",
    });
  }

  // Back from the payment gateway: /prebook?booking=<id> (Atom redirects here after payment).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get("booking");
    if (params.get("payment") === "error") {
      toast.error("We couldn't read the payment result. If money was deducted, contact D Mojo Art with your booking ID.");
    }
    if (!bookingId) return;
    window.history.replaceState(null, "", "/prebook");
    getPaymentStatus({ data: { bookingId } })
      .then((s) => {
        setPending({
          id: s.id,
          ref: s.ref,
          total: s.total,
          hallName: s.hallName,
          city: s.city,
          showTime: s.showTime,
          category: s.category,
          seats: s.seats,
          customer: s.customer,
          eventTitle: s.eventTitle,
        });
        if (s.paymentStatus === "paid" && s.ticketCode) {
          setTicket({ code: s.ticketCode, paidAt: s.paidAt ?? new Date().toISOString(), merchantTransactionId: s.merchantTransactionId });
          toast.success("Payment successful — your ticket is ready.");
        } else {
          setPayError(s.failureReason ?? "Payment was not completed.");
          toast.error("Payment was not completed. You can try again.");
        }
      })
      .catch(() => toast.error("Could not load your booking."));
  }, []);

  async function pay() {
    if (!pending) return;
    setPaying(true);
    setPayError(null);
    try {
      const start = await startPayment({ data: { bookingId: pending.id } });
      if (start.provider === "simulated") {
        const result = await payForBooking({ data: { bookingId: pending.id } });
        setTicket({ code: result.ticketCode, paidAt: result.paidAt, merchantTransactionId: null });
        toast.success("Payment successful — your ticket is ready.");
        return;
      }
      await loadScript(start.scriptUrl);
      if (!window.AtomPaynetz) throw new Error("Payment page unavailable.");
      // Opens the NTT DATA checkout; on completion Atom redirects the browser to returnUrl.
      new window.AtomPaynetz(
        {
          atomTokenId: start.atomTokenId,
          merchId: start.merchId,
          custEmail: start.custEmail,
          custMobile: start.custMobile,
          returnUrl: start.returnUrl,
        },
        start.env,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function downloadTicket() {
    if (!ticketRef.current) return;
    try {
      const dataUrl = await toPng(ticketRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${pending?.ref ?? "ticket"}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error("Could not prepare the ticket image.");
    }
  }



  return (
    <div className="hero-surface min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <img src={titleAsset.url} alt="PremXL" className="h-16 w-auto" />
        <h1 className="mt-4 text-4xl md:text-5xl">Official Pre-booking</h1>
        <p className="mt-2 text-muted-foreground">
          A paid pre-booking voucher. Final screen, show time and seat allocation confirmed by 30
          September 2026.
        </p>

        <div className="panel mt-8 space-y-8 p-6 md:p-8">
          <Field label="1. Select movie or event">
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full rounded-2xl border border-input bg-card px-4 py-3"
            >
              {events?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {e.release_date}
                </option>
              ))}
            </select>
          </Field>

          <Field label="2. Select city">
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setHallId("");
                setCategory(null);
              }}
              className="w-full rounded-2xl border border-input bg-card px-4 py-3"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {cityHalls.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    setHallId(h.id);
                    setCategory(null);
                  }}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    hallId === h.id
                      ? "border-primary bg-accent/30"
                      : "border-border hover:bg-muted/60"
                  }`}
                >
                  <p className="text-xs font-bold tracking-[0.2em] text-primary">
                    {h.city.toUpperCase()}
                  </p>
                  <p className="mt-1 font-semibold">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Show time {h.show_time || "to be confirmed"}
                  </p>
                </button>
              ))}
              {!cityHalls.length && (
                <p className="text-sm text-muted-foreground">No cinema halls listed for this city yet.</p>
              )}
            </div>
          </Field>

          <Field label="Booking made by">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["self", "By myself"],
                  ["executive", "Through an executive"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSource(key);
                    if (key === "self") setExecutiveId("");
                  }}
                  className={`rounded-2xl border p-4 text-left font-semibold transition-colors ${
                    source === key
                      ? "border-primary bg-accent/30"
                      : "border-border hover:bg-muted/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {source === "executive" && (
              <select
                value={executiveId}
                onChange={(e) => setExecutiveId(e.target.value)}
                className="mt-3 w-full rounded-2xl border border-input bg-card px-4 py-3"
              >
                <option value="">Select executive</option>
                {executives?.map((ex) => (
                  <option key={ex.id ?? ""} value={ex.id ?? ""}>
                    {ex.name}
                    {ex.city ? ` — ${ex.city}` : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>


          <Field label="3. Choose seat category">
            {hall ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {hall.hall_categories.map((c) => {
                  const left = availability?.[c.id] ?? null;
                  const soldOut = left !== null && left <= 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={soldOut}
                      onClick={() => {
                        setCategory({ id: c.id, name: c.name, price: c.price });
                        if (left !== null) setSeats((n) => Math.max(1, Math.min(n, left)));
                      }}
                      className={`rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        category?.name === c.name
                          ? "border-primary bg-accent/30"
                          : "border-border hover:bg-muted/60"
                      }`}
                    >
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-lg font-bold text-primary">₹{c.price}</p>
                      {soldOut && <p className="mt-1 text-xs font-bold text-destructive">Sold out</p>}
                      {left !== null && !soldOut && left <= 20 && (
                        <p className="mt-1 text-xs font-bold text-muted-foreground">Only {left} left</p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a cinema hall first.</p>
            )}
          </Field>

          <Field label="4. Your details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <Input
                placeholder="Email address"
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
              />
              <Input
                placeholder="10-digit mobile number"
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v.replace(/\D/g, "").slice(0, 10) })}
              />
              <div className="rounded-2xl border border-input bg-card px-4 py-3 text-sm text-muted-foreground">
                City: <span className="text-foreground">{hall?.city ?? "—"}</span>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold tracking-widest text-muted-foreground">
                  NUMBER OF TICKETS
                </label>
                <select
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="w-full rounded-2xl border border-input bg-card px-4 py-3"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10].filter((n) => seatsAvailable === null || n <= seatsAvailable).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Field>

          <div className="rounded-3xl bg-primary p-6 text-primary-foreground text-center">
            <p className="text-sm font-medium opacity-70">Total payable</p>
            <p className="mt-1 font-display text-5xl font-bold">₹{total}</p>
            <p className="text-xs opacity-70">
              {category ? `${seats} × ${category.name} @ ₹${category.price}` : "Select a category"}
            </p>
          </div>

          <button
            onClick={confirm}
            disabled={saving}
            className="gold-surface glow inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-medium uppercase tracking-wide disabled:opacity-60"
          >
            <Ticket className="size-5" /> {saving ? "Reserving…" : "Proceed to Payment"}
          </button>
        </div>
      </div>

      {pending && !ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-5 backdrop-blur">
          <div className="panel w-full max-w-md p-8 text-center">
            <CreditCard className="mx-auto size-12 text-primary" />
            <h2 className="mt-4 text-3xl">Complete payment</h2>
            <p className="mt-2 text-sm text-muted-foreground">Booking {pending.ref}</p>
            <p className="gold-text font-display text-5xl">₹{pending.total}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {pending.seats} × {pending.category} · {pending.hallName}, {pending.city}
            </p>
            {payError && (
              <p className="mt-4 rounded-2xl border border-destructive/60 bg-destructive/10 p-3 text-xs text-destructive">
                Last payment attempt did not go through: {payError}
              </p>
            )}
            <p className="mt-4 rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              You will pay securely on the NTT DATA payment page — UPI, cards, net banking and
              wallets are accepted. Your ticket is issued as soon as the payment succeeds.
            </p>
            <button
              onClick={pay}
              disabled={paying}
              className="gold-surface glow mt-6 w-full rounded-full px-6 py-3 font-bold disabled:opacity-60"
            >
              {paying ? "Opening payment page…" : payError ? `Try again — pay ₹${pending.total}` : `Pay ₹${pending.total}`}
            </button>
            <button
              onClick={() => {
                setPending(null);
                setPayError(null);
              }}
              className="mt-3 w-full rounded-full border border-border px-6 py-3 text-sm"
            >
              Pay later
            </button>
          </div>
        </div>
      )}

      {pending && ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/85 p-5 backdrop-blur">
          <div className="w-full max-w-md">
            <div className="mb-4 flex items-center justify-center gap-2 text-primary">
              <CheckCircle2 className="size-6" />
              <p className="font-bold">Payment successful — booking confirmed</p>
            </div>

            <div
              ref={ticketRef}
              className="overflow-hidden rounded-3xl border border-primary/50 bg-card"
            >
              <div className="gold-surface flex items-center justify-between px-6 py-4">
                <p className="font-display text-2xl tracking-wide">D MOJO ART</p>
                <p className="text-xs font-bold tracking-[0.25em]">E-TICKET</p>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <p className="text-xs tracking-[0.2em] text-muted-foreground">SHOW</p>
                  <p className="font-display text-2xl">{pending.eventTitle}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <TicketCell label="NAME" value={pending.customer} />
                  <TicketCell label="BOOKING ID" value={pending.ref} />
                  <TicketCell label="MERCHANT TRANSACTION ID" value={ticket.merchantTransactionId ?? "Not available"} />
                  <TicketCell label="CINEMA" value={`${pending.hallName}, ${pending.city}`} />
                  <TicketCell label="SHOW TIME" value={pending.showTime} />
                  <TicketCell label="CATEGORY" value={pending.category} />
                  <TicketCell label="SEATS" value={String(pending.seats)} />
                  <TicketCell label="AMOUNT PAID" value={`₹${pending.total}`} />
                  <TicketCell label="STATUS" value="PAID" />
                </div>
                <div className="rounded-xl border border-dashed border-primary/60 p-4 text-center">
                  <p className="text-xs tracking-[0.2em] text-muted-foreground">TICKET CODE</p>
                  <p className="gold-text font-display text-2xl tracking-widest">{ticket.code}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Show this ticket code at the cinema counter. Seat numbers are allocated on
                    arrival.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={downloadTicket}
                className="gold-surface inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-bold"
              >
                <Download className="size-4" /> Download ticket
              </button>
              <button
                onClick={() => {
                  setTicket(null);
                  setPending(null);
                }}
                className="rounded-full border border-border px-6 py-3 font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-xl">{label}</h2>
      {children}
    </div>
  );
}

function Input({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-input bg-card px-4 py-3 outline-none focus:border-primary"
    />
  );
}
