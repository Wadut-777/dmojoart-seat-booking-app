import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { toPng } from "html-to-image";

import {
  adminListBookings,
  adminListEvents,
  adminListExecutives,
  adminListHalls,
  deleteRecord,
  saveEvent,
  saveExecutive,
  saveHall,
  setEventFlag,
} from "@/lib/admin.functions";
import { signOut as signOutFn } from "@/lib/auth.functions";
import { uploadMedia } from "@/lib/media";
import { SESSION_KEY, useSession } from "@/hooks/use-roles";
import { StaffManager, ROLE_LABELS } from "@/components/staff-manager";
import { CmsAdmin } from "@/components/cms-admin";
import { TaxAdmin } from "@/components/tax-admin";
import { PaymentDialog } from "@/components/payment-dialog";
import { ShowsAdmin } from "@/components/shows-admin";
import { hasExtras, type PriceBreakup } from "@/lib/pricing";
import type { AdminBooking } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — D Mojo Art" },
      { name: "description", content: "Manage cinema halls, pricing and pre-booking records." },
      { property: "og:title", content: "Admin Dashboard — D Mojo Art" },
      { property: "og:description", content: "Internal dashboard for D Mojo Art staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

type CategoryDraft = { id?: string; name: string; price: string; capacity: string };

type BookingRow = {
  id: string;
  booking_ref: string;
  customer_name: string;
  email: string | null;
  phone: string;
  city: string;
  seat_category: string;
  num_seats: number;
  unit_price: number;
  total_price: number;
  breakup: PriceBreakup | null;
  created_at: string;
  booking_source: string;
  payment_status: string;
  payment_ref: string | null;
  merchant_transaction_id: string | null;
  paid_at: string | null;
  ticket_code: string | null;
  show_label: string | null;
  halls: { name: string } | null;
  events: { title: string } | null;
  executives: { name: string } | null;
};

const EVENT_TYPES = [
  { value: "movie", label: "Movie" },
  { value: "concert", label: "Concert" },
  { value: "live_show", label: "Live show" },
  { value: "theatre", label: "Theatre" },
  { value: "festival", label: "Festival" },
  { value: "other", label: "Other" },
] as const;

function Admin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const user = session.data?.user ?? null;
  const roles = session.data?.roles ?? [];
  const checking = session.isLoading;
  const isAdmin = roles.includes("admin");
  const canEvents = isAdmin || roles.includes("editor") || roles.includes("event_manager");
  const canBookings = isAdmin || roles.includes("booking_manager") || roles.includes("executive");
  const isStaff = roles.length > 0;
  const [tab, setTab] = useState<"bookings" | "events" | "halls" | "executives" | "users" | "website" | "pricing">("bookings");
  const tabs = [
    ...(canBookings ? [{ id: "bookings" as const, label: "Bookings" }] : []),
    ...(canEvents ? [{ id: "events" as const, label: "Movies & events" }] : []),
    ...(canEvents ? [{ id: "website" as const, label: "Website content" }] : []),
    ...(isAdmin ? [{ id: "pricing" as const, label: "Pricing & GST" }] : []),
    ...(isAdmin ? [{ id: "halls" as const, label: "Cinema halls" }] : []),
    ...(isAdmin ? [{ id: "executives" as const, label: "Executives" }] : []),
    ...(isAdmin ? [{ id: "users" as const, label: "Users & roles" }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? tab);
  const [ticketBooking, setTicketBooking] = useState<BookingRow | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const [reconcile, setReconcile] = useState<AdminBooking | null>(null);
  // Which hall or event has its show-times panel open: "hall:<id>" or "event:<id>".
  const [showsFor, setShowsFor] = useState<string | null>(null);
  const canReconcile = isAdmin || roles.includes("booking_manager");

  async function downloadTicket() {
    if (!ticketRef.current || !ticketBooking) return;
    try {
      const dataUrl = await toPng(ticketRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${ticketBooking.booking_ref}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error("Could not prepare the ticket image.");
    }
  }

  useEffect(() => {
    if (!session.isLoading && !user) navigate({ to: "/auth" });
  }, [session.isLoading, user, navigate]);

  const halls = useQuery({
    queryKey: ["admin-halls"],
    enabled: isAdmin,
    queryFn: () => adminListHalls(),
  });

  const bookings = useQuery({
    queryKey: ["admin-bookings"],
    enabled: canBookings,
    queryFn: () => adminListBookings(),
  });

  const executives = useQuery({
    queryKey: ["admin-executives"],
    enabled: isAdmin,
    queryFn: () => adminListExecutives(),
  });

  const emptyExec = {
    name: "",
    phone: "",
    email: "",
    city: "",
    account_holder: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
    aadhar_number: "",
    notes: "",
  };
  const [execForm, setExecForm] = useState(emptyExec);
  const [savingExec, setSavingExec] = useState(false);
  const [editingExec, setEditingExec] = useState<string | null>(null);

  async function addExecutive(e: React.FormEvent) {
    e.preventDefault();
    if (!execForm.name.trim() || !execForm.phone.trim()) {
      toast.error("Executive name and phone number are required.");
      return;
    }
    setSavingExec(true);
    try {
      await saveExecutive({ data: { ...execForm, id: editingExec ?? undefined } });
    } catch {
      setSavingExec(false);
      toast.error("Could not save the executive.");
      return;
    }
    setSavingExec(false);
    toast.success(editingExec ? "Executive updated." : "Executive registered.");
    setExecForm(emptyExec);
    setEditingExec(null);
    qc.invalidateQueries({ queryKey: ["admin-executives"] });
    qc.invalidateQueries({ queryKey: ["executives-public"] });
  }

  const events = useQuery({
    queryKey: ["admin-events"],
    enabled: canEvents,
    queryFn: () => adminListEvents(),
  });

  const emptyEvent = {
    title: "",
    tagline: "",
    synopsis: "",
    event_type: "movie",
    release_date: "",
    venue: "",
    city: "",
    trailer_url: "",
    poster_url: "",
  };
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadPoster(file: File) {
    setUploading(true);
    try {
      const path = await uploadMedia(file, "posters");
      setEventForm((f) => ({ ...f, poster_url: path }));
      toast.success("Photo uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the photo.");
    } finally {
      setUploading(false);
    }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventForm.title.trim()) {
      toast.error("Event title is required.");
      return;
    }
    setSavingEvent(true);
    try {
      await saveEvent({
        data: {
          id: editingEvent ?? undefined,
          title: eventForm.title.trim(),
          tagline: eventForm.tagline,
          synopsis: eventForm.synopsis,
          event_type: eventForm.event_type as (typeof EVENT_TYPES)[number]["value"],
          release_date: eventForm.release_date,
          venue: eventForm.venue,
          city: eventForm.city,
          trailer_url: eventForm.trailer_url,
          poster_url: eventForm.poster_url,
        },
      });
    } catch {
      setSavingEvent(false);
      toast.error("Could not save the event.");
      return;
    }
    setSavingEvent(false);
    toast.success(editingEvent ? "Event updated." : "Event added.");
    setEventForm(emptyEvent);
    setEditingEvent(null);
    qc.invalidateQueries({ queryKey: ["admin-events"] });
    qc.invalidateQueries({ queryKey: ["public-events"] });
  }

  function editEvent(ev: {
    id: string;
    title: string;
    tagline: string | null;
    synopsis: string | null;
    event_type: string;
    release_date: string | null;
    venue: string | null;
    city: string | null;
    trailer_url: string | null;
    poster_url: string | null;
  }) {
    setEditingEvent(ev.id);
    setEventForm({
      title: ev.title,
      tagline: ev.tagline ?? "",
      synopsis: ev.synopsis ?? "",
      event_type: ev.event_type,
      release_date: ev.release_date ?? "",
      venue: ev.venue ?? "",
      city: ev.city ?? "",
      trailer_url: ev.trailer_url ?? "",
      poster_url: ev.poster_url ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRow(table: "events" | "halls" | "executives" | "bookings", id: string, label: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      await deleteRecord({ data: { table, id } });
    } catch {
      toast.error("Could not delete.");
      return;
    }
    toast.success("Deleted.");
    ["admin-events", "admin-halls", "admin-executives", "admin-bookings", "public-events", "halls-public", "executives-public"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  }

  async function toggleEvent(id: string, field: "booking_open" | "is_active", value: boolean) {
    try {
      await setEventFlag({ data: { id, field, value } });
    } catch {
      toast.error("Could not update the event.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-events"] });
  }

  const [search, setSearch] = useState("");
  const [hallForm, setHallForm] = useState({
    name: "",
    city: "",
    address: "",
    screen: "",
    show_time: "",
    contact: "",
  });
  const [cats, setCats] = useState<CategoryDraft[]>([{ name: "", price: "", capacity: "" }]);
  const [savingHall, setSavingHall] = useState(false);
  const [editingHall, setEditingHall] = useState<string | null>(null);

  function resetHallForm() {
    setEditingHall(null);
    setHallForm({ name: "", city: "", address: "", screen: "", show_time: "", contact: "" });
    setCats([{ name: "", price: "", capacity: "" }]);
  }

  function editHall(h: {
    id: string;
    name: string;
    city: string;
    address: string | null;
    screen: string | null;
    show_time: string | null;
    contact: string | null;
    hall_categories: { id: string; name: string; price: number; capacity: number }[];
  }) {
    setEditingHall(h.id);
    setHallForm({
      name: h.name,
      city: h.city,
      address: h.address ?? "",
      screen: h.screen ?? "",
      show_time: h.show_time ?? "",
      contact: h.contact ?? "",
    });
    setCats(
      h.hall_categories.length
        ? h.hall_categories.map((c) => ({
            id: c.id,
            name: c.name,
            price: String(c.price),
            capacity: String(c.capacity ?? 0),
          }))
        : [{ name: "", price: "", capacity: "" }],
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addHall(e: React.FormEvent) {
    e.preventDefault();
    if (!hallForm.name.trim() || !hallForm.city.trim()) {
      toast.error("Hall name and city are required.");
      return;
    }
    const valid = cats.filter((c) => c.name.trim() && c.price !== "");
    if (valid.some((c) => !Number.isFinite(Number(c.price)) || Number(c.price) < 0)) {
      toast.error("Seat category prices must be valid numbers.");
      return;
    }
    setSavingHall(true);
    try {
      await saveHall({
        data: {
          id: editingHall ?? undefined,
          hall: hallForm,
          categories: valid.map((c) => ({
            id: c.id,
            name: c.name.trim(),
            price: Number(c.price),
            capacity: Number(c.capacity || 0),
          })),
        },
      });
    } catch {
      setSavingHall(false);
      toast.error(editingHall ? "Could not update the hall." : "Could not add the hall.");
      return;
    }
    setSavingHall(false);
    toast.success(editingHall ? "Cinema hall updated." : "Cinema hall added.");
    resetHallForm();
    qc.invalidateQueries({ queryKey: ["admin-halls"] });
    qc.invalidateQueries({ queryKey: ["halls-public"] });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await signOutFn();
    await qc.invalidateQueries({ queryKey: SESSION_KEY });
    navigate({ to: "/auth", replace: true });
  }

  if (checking || !user) {
    return <p className="mx-auto max-w-6xl px-5 py-20 text-muted-foreground">Loading dashboard…</p>;
  }

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <h1 className="text-3xl">No admin access</h1>
        <p className="mt-3 text-muted-foreground">
          The account {user.email} is signed in but has not been granted administrator rights. Ask
          an existing D Mojo Art admin to add you.
        </p>
        <button onClick={signOut} className="gold-surface mt-6 rounded-full px-6 py-3 font-bold">
          Sign out
        </button>
      </div>
    );
  }

  const filtered = (bookings.data ?? []).filter((b) => {
    const q = search.toLowerCase();
    return (
      !q ||
      b.booking_ref.toLowerCase().includes(q) ||
      b.customer_name.toLowerCase().includes(q) ||
      (b.phone ?? "").includes(q) ||
      (b.city ?? "").toLowerCase().includes(q) ||
      (b.merchant_transaction_id ?? "").toLowerCase().includes(q)
    );
  });

  const totals = filtered.reduce(
    (acc, b) => ({ seats: acc.seats + b.num_seats, revenue: acc.revenue + b.total_price }),
    { seats: 0, revenue: 0 },
  );

  async function exportBookings() {
    if (!filtered.length) {
      toast.error("There are no bookings to export.");
      return;
    }
    const XLSX = await import("xlsx");
    const rows = filtered.map((b) => ({
      "Booking ID": b.booking_ref,
      Date: new Date(b.created_at).toLocaleString("en-IN"),
      Customer: b.customer_name,
      Phone: b.phone,
      Email: b.email ?? "",
      City: b.city,
      Event: b.events?.title ?? "",
      Hall: b.halls?.name ?? "",
      "Show time": b.show_label ?? "",
      Category: b.seat_category,
      Seats: b.num_seats,
      "Unit Price": b.unit_price,
      "Ticket value (before GST)": b.breakup ? b.breakup.taxableTicket : b.total_price,
      "GST on tickets": b.breakup?.ticketGst ?? 0,
      "Service charge": b.breakup?.serviceCharge ?? 0,
      "GST on service charge": b.breakup?.serviceChargeGst ?? 0,
      "Round off": b.breakup?.roundOff ?? 0,
      "Total Paid": b.total_price,
      "Booked By": b.booking_source === "executive" ? (b.executives?.name ?? "Executive") : "Self",
      "Payment Status": b.payment_status,
      "Payment Ref": b.payment_ref ?? "",
      "Merchant Transaction ID": b.merchant_transaction_id ?? "",
      "Paid At": b.paid_at ? new Date(b.paid_at).toLocaleString("en-IN") : "",
      "Ticket Code": b.ticket_code ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Bookings");
    XLSX.writeFile(book, `dmojoart-bookings-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }


  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-primary">{isAdmin ? "ADMIN DASHBOARD" : roles.map((r) => ROLE_LABELS[r]?.split(" —")[0] ?? r).join(", ").toUpperCase()}</p>
          <h1 className="mt-2 text-4xl">D Mojo Art control room</h1>
        </div>
        <button
          onClick={signOut}
          className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted"
        >
          Sign out
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-5 py-2 text-sm font-bold transition ${
              activeTab === t.id
                ? "gold-surface"
                : "border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Bookings" value={String(filtered.length)} />
        <Stat label="Tickets" value={String(totals.seats)} />
        <Stat label="Collected" value={`₹${totals.revenue}`} />
      </div>

      {activeTab === "website" && canEvents && <CmsAdmin roles={roles} />}

      {activeTab === "pricing" && isAdmin && <TaxAdmin />}

      {activeTab === "users" && isAdmin && <StaffManager executives={(executives.data ?? []).map((x) => ({ id: x.id, name: x.name }))} />}

      {activeTab === "events" && canEvents && (
      <section className="panel p-6 md:p-8">
        <h2 className="text-2xl">Movies &amp; events</h2>
        <form onSubmit={addEvent} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              placeholder="Title"
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              className="rounded-lg border border-input bg-background px-4 py-3"
            />
            <select
              value={eventForm.event_type}
              onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })}
              className="rounded-lg border border-input bg-background px-4 py-3"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={eventForm.release_date}
              onChange={(e) => setEventForm({ ...eventForm, release_date: e.target.value })}
              className="rounded-lg border border-input bg-background px-4 py-3"
            />
            <input
              placeholder="Tagline"
              value={eventForm.tagline}
              onChange={(e) => setEventForm({ ...eventForm, tagline: e.target.value })}
              className="rounded-lg border border-input bg-background px-4 py-3"
            />
            <input
              placeholder="Venue"
              value={eventForm.venue}
              onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
              className="rounded-lg border border-input bg-background px-4 py-3"
            />
            <input
              placeholder="City"
              value={eventForm.city}
              onChange={(e) => setEventForm({ ...eventForm, city: e.target.value })}
              className="rounded-lg border border-input bg-background px-4 py-3"
            />
            <input
              placeholder="Trailer link (YouTube)"
              value={eventForm.trailer_url}
              onChange={(e) => setEventForm({ ...eventForm, trailer_url: e.target.value })}
              className="rounded-lg border border-input bg-background px-4 py-3"
            />
            <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">Poster photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPoster(f);
                }}
                className="min-w-0 flex-1 text-xs"
              />
            </label>
          </div>
          <textarea
            placeholder="Synopsis / description"
            value={eventForm.synopsis}
            onChange={(e) => setEventForm({ ...eventForm, synopsis: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-4 py-3"
          />
          {eventForm.poster_url && (
            <p className="text-xs text-primary">Photo attached{uploading ? "" : " ✓"}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingEvent || uploading}
              className="gold-surface rounded-full px-6 py-3 font-bold disabled:opacity-60"
            >
              {savingEvent
                ? "Saving…"
                : uploading
                  ? "Uploading photo…"
                  : editingEvent
                    ? "Save changes"
                    : "Add Movie / Event"}
            </button>
            {editingEvent && (
              <button
                type="button"
                onClick={() => {
                  setEditingEvent(null);
                  setEventForm(emptyEvent);
                }}
                className="rounded-full border border-border px-6 py-3 font-bold"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {events.data?.map((ev) => (
            <div key={ev.id} className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold tracking-widest text-primary">
                {(EVENT_TYPES.find((t) => t.value === ev.event_type)?.label ?? ev.event_type).toUpperCase()}
                {ev.release_date ? ` · ${ev.release_date}` : ""}
              </p>
              <p className="font-semibold">{ev.title}</p>
              <p className="text-xs text-muted-foreground">
                {[ev.venue, ev.city].filter(Boolean).join(", ") || "Venue to be confirmed"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => toggleEvent(ev.id, "booking_open", !ev.booking_open)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-bold ${
                    ev.booking_open ? "border-primary text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {ev.booking_open ? "Booking open" : "Booking closed"}
                </button>
                <button
                  onClick={() => toggleEvent(ev.id, "is_active", !ev.is_active)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-bold ${
                    ev.is_active ? "border-primary text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {ev.is_active ? "Listed" : "Hidden"}
                </button>
                <button
                  onClick={() => setShowsFor(showsFor === `event:${ev.id}` ? null : `event:${ev.id}`)}
                  className="rounded-full border border-primary px-4 py-1.5 text-xs font-bold text-primary"
                >
                  Halls &amp; show times
                </button>
                <button
                  onClick={() => editEvent(ev)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs font-bold"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteRow("events", ev.id, ev.title)}
                  className="rounded-full border border-destructive px-4 py-1.5 text-xs font-bold text-destructive"
                >
                  Delete
                </button>
              </div>
              {showsFor === `event:${ev.id}` && (
                <ShowsAdmin scope={{ kind: "event", eventId: ev.id, name: ev.title }} onClose={() => setShowsFor(null)} />
              )}
            </div>
          ))}
          {!events.data?.length && (
            <p className="text-sm text-muted-foreground">No movies or events yet.</p>
          )}
        </div>
      </section>
      )}

      {activeTab === "halls" && isAdmin && (
      <section className="panel p-6 md:p-8">
        <h2 className="text-2xl">Add cinema hall</h2>
        <form onSubmit={addHall} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["name", "Hall / theatre name"],
                ["city", "City"],
                ["address", "Address"],
                ["screen", "Screen"],
                ["show_time", "Default show time text (used when no shows are scheduled)"],
                ["contact", "Contact"],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                placeholder={label}
                value={hallForm[key]}
                onChange={(e) => setHallForm({ ...hallForm, [key]: e.target.value })}
                className="rounded-lg border border-input bg-background px-4 py-3"
              />
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-bold tracking-widest text-muted-foreground">
              SEAT CATEGORIES &amp; PRICING
            </p>
            <div className="space-y-2">
              {cats.map((c, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <input
                    placeholder="Category (VIP, Premium…)"
                    value={c.name}
                    onChange={(e) =>
                      setCats(cats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    className="rounded-lg border border-input bg-background px-4 py-2"
                  />
                  <input
                    placeholder="Price ₹"
                    inputMode="numeric"
                    value={c.price}
                    onChange={(e) =>
                      setCats(
                        cats.map((x, j) =>
                          j === i ? { ...x, price: e.target.value.replace(/\D/g, "") } : x,
                        ),
                      )
                    }
                    className="rounded-lg border border-input bg-background px-4 py-2"
                  />
                  <input
                    placeholder="Seats"
                    inputMode="numeric"
                    value={c.capacity}
                    onChange={(e) =>
                      setCats(
                        cats.map((x, j) =>
                          j === i ? { ...x, capacity: e.target.value.replace(/\D/g, "") } : x,
                        ),
                      )
                    }
                    className="rounded-lg border border-input bg-background px-4 py-2"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCats([...cats, { name: "", price: "", capacity: "" }])}
              className="mt-2 text-sm text-primary hover:underline"
            >
              + Add another category
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingHall}
              className="gold-surface rounded-full px-6 py-3 font-bold disabled:opacity-60"
            >
              {savingHall ? "Saving…" : editingHall ? "Save changes" : "Add Cinema Hall"}
            </button>
            {editingHall && (
              <button
                type="button"
                onClick={resetHallForm}
                className="rounded-full border border-border px-6 py-3 font-bold"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {halls.data?.map((h) => (
            <div key={h.id} className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold tracking-widest text-primary">
                {h.city.toUpperCase()}
              </p>
              <p className="font-semibold">{h.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {h.hall_categories.map((c) => `${c.name} ₹${c.price}`).join(" · ")}
              </p>
              <button
                onClick={() => setShowsFor(showsFor === `hall:${h.id}` ? null : `hall:${h.id}`)}
                className="mr-2 mt-3 rounded-full border border-primary px-4 py-1.5 text-xs font-bold text-primary"
              >
                Show times
              </button>
              <button
                onClick={() => editHall(h)}
                className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-bold"
              >
                Edit
              </button>
              <button
                  onClick={() => deleteRow("halls", h.id, h.name)}
                  className="ml-2 mt-3 rounded-full border border-destructive px-4 py-1.5 text-xs font-bold text-destructive"
                >
                  Delete
                </button>
              {showsFor === `hall:${h.id}` && (
                <ShowsAdmin scope={{ kind: "hall", hallId: h.id, name: h.name }} onClose={() => setShowsFor(null)} />
              )}
            </div>
          ))}
        </div>
      </section>
      )}

      {activeTab === "executives" && isAdmin && (
      <section className="panel p-6 md:p-8">
        <h2 className="text-2xl">Register executive</h2>
        <form onSubmit={addExecutive} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["name", "Executive name"],
                ["phone", "Phone number"],
                ["email", "Email"],
                ["city", "City"],
                ["account_holder", "Account holder name"],
                ["bank_name", "Bank name"],
                ["account_number", "Account number"],
                ["ifsc_code", "IFSC code"],
                ["aadhar_number", "Aadhaar number"],
                ["notes", "Notes"],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                placeholder={label}
                value={execForm[key]}
                onChange={(e) => setExecForm({ ...execForm, [key]: e.target.value })}
                className="rounded-lg border border-input bg-background px-4 py-3"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingExec}
              className="gold-surface rounded-full px-6 py-3 font-bold disabled:opacity-60"
            >
              {savingExec ? "Saving…" : editingExec ? "Save changes" : "Add Executive"}
            </button>
            {editingExec && (
              <button
                type="button"
                onClick={() => {
                  setEditingExec(null);
                  setExecForm(emptyExec);
                }}
                className="rounded-full border border-border px-6 py-3 font-bold"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {executives.data?.map((ex) => {
            const own = (bookings.data ?? []).filter((b) => b.executive_id === ex.id);
            const revenue = own.reduce((s, b) => s + b.total_price, 0);
            return (
              <div key={ex.id} className="rounded-xl border border-border p-4">
                <p className="font-semibold">{ex.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ex.phone}
                  {ex.city ? ` · ${ex.city}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ex.bank_name || "—"} · A/C {ex.account_number || "—"} · IFSC {ex.ifsc_code || "—"}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-bold text-primary">{own.length}</span> bookings · ₹{revenue}
                </p>
                <button
                  onClick={() => {
                    setEditingExec(ex.id);
                    setExecForm({
                      name: ex.name,
                      phone: ex.phone,
                      email: ex.email ?? "",
                      city: ex.city ?? "",
                      account_holder: ex.account_holder ?? "",
                      bank_name: ex.bank_name ?? "",
                      account_number: ex.account_number ?? "",
                      ifsc_code: ex.ifsc_code ?? "",
                      aadhar_number: ex.aadhar_number ?? "",
                      notes: ex.notes ?? "",
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-bold"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteRow("executives", ex.id, ex.name)}
                  className="ml-2 mt-3 rounded-full border border-destructive px-4 py-1.5 text-xs font-bold text-destructive"
                >
                  Delete
                </button>
              </div>
            );
          })}
          {!executives.data?.length && (
            <p className="text-sm text-muted-foreground">No executives registered yet.</p>
          )}
        </div>
      </section>
      )}



      {activeTab === "bookings" && canBookings && (
      <section className="panel p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl">Booking records</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              placeholder="Search booking / transaction ID, name, phone, city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm"
            />
            <button
              onClick={exportBookings}
              className="gold-surface rounded-full px-5 py-2 text-sm font-bold"
            >
              Export to Excel
            </button>
          </div>
        </div>
        <div className="mt-5 overflow-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                {["Booking ID", "Merchant Transaction ID", "Customer", "Contact", "Event", "Hall", "Booked by", "Seats", "Total", "Payment", ""].map((h) => (
                  <th key={h} className="border-b border-border py-3 pr-4">
                    {h}
                  </th>
                ))}

              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-border/60">
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => setTicketBooking(b)}
                      title="View and download ticket"
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {b.booking_ref}
                    </button>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{b.merchant_transaction_id ?? "—"}</td>
                  <td className="py-3 pr-4">{b.customer_name}</td>
                  <td className="py-3 pr-4">
                    {b.phone}
                    <br />
                    <span className="text-xs text-muted-foreground">{b.email}</span>
                  </td>
                  <td className="py-3 pr-4">{b.events?.title ?? "—"}</td>
                  <td className="py-3 pr-4">
                    {b.halls?.name ?? "—"}
                    <br />
                    <span className="text-xs text-muted-foreground">{b.city}</span>
                    {b.show_label && (
                      <>
                        <br />
                        <span className="text-xs text-primary">{b.show_label}</span>
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {b.booking_source === "executive" ? (b.executives?.name ?? "Executive") : "Self"}
                  </td>


                  <td className="py-3 pr-4">
                    {b.num_seats} × {b.seat_category}
                  </td>
                  <td className="py-3 pr-4 font-bold">
                    ₹{b.total_price}
                    {b.breakup && hasExtras(b.breakup) && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        incl. GST ₹{(b.breakup.ticketGst + b.breakup.serviceChargeGst).toFixed(2)}
                        {b.breakup.serviceCharge > 0 && ` · fee ₹${b.breakup.serviceCharge.toFixed(2)}`}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        b.payment_status === "paid" ? "font-bold text-primary" : "text-muted-foreground"
                      }
                    >
                      {b.payment_status.charAt(0).toUpperCase() + b.payment_status.slice(1)}
                    </span>
                    {b.ticket_code && (
                      <>
                        <br />
                        <span className="text-xs text-muted-foreground">{b.ticket_code}</span>
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-2">
                      {b.payment_status === "paid" && (
                        <a
                          href={`/api/invoice/${b.id}`}
                          download
                          title="Download tax invoice (PDF)"
                          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                        >
                          <FileText className="size-3.5" /> Invoice
                        </a>
                      )}
                      {canReconcile && b.payment_status !== "refunded" && (
                        <button
                          type="button"
                          onClick={() => setReconcile(b)}
                          className="rounded-full border border-primary px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
                        >
                          {b.payment_status === "paid" ? "Payment…" : "Reconcile"}
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => deleteRow("bookings", b.id, `booking ${b.booking_ref}`)}
                          className="rounded-full border border-destructive px-4 py-1.5 text-xs font-bold text-destructive"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="py-6 text-muted-foreground">No bookings yet.</p>}
        </div>
      </section>
      )}

      {reconcile && <PaymentDialog booking={reconcile} onClose={() => setReconcile(null)} />}

      {ticketBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/85 p-5 backdrop-blur">
          <div className="w-full max-w-md">
            <div
              ref={ticketRef}
              className="overflow-hidden rounded-2xl border border-primary/50 bg-card"
            >
              <div className="gold-surface flex items-center justify-between px-6 py-4">
                <p className="font-display text-2xl tracking-wide">D MOJO ART</p>
                <p className="text-xs font-bold tracking-[0.25em]">E-TICKET</p>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <p className="text-xs tracking-[0.2em] text-muted-foreground">SHOW</p>
                  <p className="font-display text-2xl">{ticketBooking.events?.title ?? "Event"}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <TicketCell label="NAME" value={ticketBooking.customer_name} />
                  <TicketCell label="BOOKING ID" value={ticketBooking.booking_ref} />
                  <TicketCell
                    label="MERCHANT TRANSACTION ID"
                    value={ticketBooking.merchant_transaction_id ?? "Not available"}
                  />
                  <TicketCell
                    label="CINEMA"
                    value={`${ticketBooking.halls?.name ?? "—"}, ${ticketBooking.city}`}
                  />
                  {ticketBooking.show_label && <TicketCell label="SHOW TIME" value={ticketBooking.show_label} />}
                  <TicketCell
                    label="BOOKED BY"
                    value={
                      ticketBooking.booking_source === "executive"
                        ? (ticketBooking.executives?.name ?? "Executive")
                        : "Self"
                    }
                  />
                  <TicketCell label="CATEGORY" value={ticketBooking.seat_category} />
                  <TicketCell label="SEATS" value={String(ticketBooking.num_seats)} />
                  <TicketCell label="AMOUNT PAID" value={`₹${ticketBooking.total_price}`} />
                  <TicketCell
                    label="STATUS"
                    value={ticketBooking.payment_status.toUpperCase()}
                  />
                </div>
                <div className="rounded-xl border border-dashed border-primary/60 p-4 text-center">
                  <p className="text-xs tracking-[0.2em] text-muted-foreground">TICKET CODE</p>
                  <p className="gold-text font-display text-2xl tracking-widest">
                    {ticketBooking.ticket_code ?? "Not issued yet"}
                  </p>
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
              {ticketBooking.payment_status === "paid" && (
                <a
                  href={`/api/invoice/${ticketBooking.id}`}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-primary px-6 py-3 font-bold text-primary hover:bg-primary/10"
                >
                  <FileText className="size-4" /> Download tax invoice
                </a>
              )}
              <button
                onClick={() => setTicketBooking(null)}
                className="rounded-full border border-border px-6 py-3 font-semibold sm:col-span-2"
              >
                Close
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-6">
      <p className="text-xs font-bold tracking-[0.3em] text-muted-foreground">{label}</p>
      <p className="gold-text font-display text-4xl">{value}</p>
    </div>
  );
}
