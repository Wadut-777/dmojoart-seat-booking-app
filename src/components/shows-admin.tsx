import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { adminListEvents, adminListHalls } from "@/lib/admin.functions";
import { adminAddShows, adminDeleteShow, adminListShows, adminUpdateShow } from "@/lib/shows.functions";
import { nowIst, time12 } from "@/lib/shows";

const input = "rounded-lg border border-input bg-background px-3 py-2 text-sm";
const chip = "rounded-full border border-border px-3 py-1 text-xs font-bold hover:bg-muted";

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

/** Dates from `from` to `to` inclusive (just `from` when `to` is empty). At most 120 days. */
function dateRange(from: string, to: string): string[] {
  if (!from) return [];
  const out: string[] = [];
  const end = to && to >= from ? to : from;
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= end && out.length < 120; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

type Scope = { kind: "hall"; hallId: string; name: string } | { kind: "event"; eventId: string; name: string };

/**
 * Show times for one cinema hall (pick the movie/event) or one movie/event (pick the cinema halls).
 * Both views edit the same list, so a show added from either side appears on both.
 */
export function ShowsAdmin({ scope, onClose }: { scope: Scope; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ["admin-shows", scope.kind, scope.kind === "hall" ? scope.hallId : scope.eventId];
  const shows = useQuery({
    queryKey: key,
    queryFn: () => adminListShows({ data: scope.kind === "hall" ? { hallId: scope.hallId } : { eventId: scope.eventId } }),
  });
  const halls = useQuery({ queryKey: ["admin-halls"], queryFn: () => adminListHalls(), enabled: scope.kind === "event" });
  const events = useQuery({ queryKey: ["admin-events"], queryFn: () => adminListEvents(), enabled: scope.kind === "hall" });

  const today = nowIst().date;
  const [eventId, setEventId] = useState("");
  const [hallIds, setHallIds] = useState<string[]>([]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState("");
  const [times, setTimes] = useState<string[]>(["19:00"]);
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-shows"] });
  const dates = useMemo(() => dateRange(from, to), [from, to]);
  const cities = useMemo(() => Array.from(new Set((halls.data ?? []).map((h) => h.city))).sort(), [halls.data]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const targetEvent = scope.kind === "event" ? scope.eventId : eventId;
    const targetHalls = scope.kind === "hall" ? [scope.hallId] : hallIds;
    const cleanTimes = times.filter(Boolean);
    if (!targetEvent) return toast.error("Choose a movie or event.");
    if (!targetHalls.length) return toast.error("Choose at least one cinema hall.");
    if (!dates.length) return toast.error("Choose a date.");
    if (!cleanTimes.length) return toast.error("Add at least one show time.");
    setBusy(true);
    try {
      const r = await adminAddShows({ data: { eventId: targetEvent, hallIds: targetHalls, dates, times: cleanTimes } });
      await refresh();
      toast.success(`${r.added} show${r.added === 1 ? "" : "s"} added${r.skipped ? ` (${r.skipped} already existed)` : ""}.`);
    } catch (err) {
      toast.error(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
    } catch (err) {
      toast.error(message(err));
    }
  }

  const list = (shows.data ?? []).filter((s) => showPast || !s.past);
  const pastCount = (shows.data ?? []).filter((s) => s.past).length;

  return (
    <div className="mt-4 space-y-5 rounded-2xl border border-primary/40 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg">Show times: {scope.name}</h3>
        <button type="button" className={chip} onClick={onClose}>
          Close
        </button>
      </div>

      <form onSubmit={add} className="space-y-4">
        {scope.kind === "hall" ? (
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Movie / event shown here</span>
            <select className={input + " w-full"} value={eventId} onChange={(e) => setEventId(e.target.value)} required>
              <option value="">Select…</option>
              {(events.data ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Cinema halls showing it</p>
            <div className="mt-2 space-y-3">
              {cities.map((c) => (
                <div key={c}>
                  <p className="text-xs font-semibold text-primary">{c}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(halls.data ?? [])
                      .filter((h) => h.city === c)
                      .map((h) => (
                        <label key={h.id} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
                          <input
                            type="checkbox"
                            checked={hallIds.includes(h.id)}
                            onChange={(e) => setHallIds((p) => (e.target.checked ? [...p, h.id] : p.filter((x) => x !== h.id)))}
                          />
                          {h.name}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
              {halls.data && halls.data.length === 0 && <p className="text-sm text-muted-foreground">Add a cinema hall first.</p>}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">From date</span>
            <input type="date" min={today} className={input + " w-full"} value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">To date (optional, for a run of days)</span>
            <input type="date" min={from || today} className={input + " w-full"} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Show times each day</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {times.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <input type="time" className={input} value={t} onChange={(e) => setTimes((p) => p.map((x, j) => (j === i ? e.target.value : x)))} required />
                {times.length > 1 && (
                  <button type="button" aria-label="Remove time" className={chip} onClick={() => setTimes((p) => p.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {times.length < 12 && (
              <button type="button" className={chip} onClick={() => setTimes((p) => [...p, "21:30"])}>
                + Add time
              </button>
            )}
          </div>
        </div>

        <button type="submit" disabled={busy} className="gold-surface rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-60">
          {busy ? "Adding…" : `Add ${dates.length * times.filter(Boolean).length * (scope.kind === "hall" ? 1 : Math.max(1, hallIds.length))} show(s)`}
        </button>
      </form>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Scheduled shows</p>
          {pastCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show {pastCount} past
            </label>
          )}
        </div>
        {shows.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No upcoming shows yet. Until you add some, this {scope.kind === "hall" ? "hall uses its default show time text" : "movie / event can be booked at any hall"}.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className={s.isActive && !s.past ? "" : "opacity-60"}>
                  <p className="font-semibold">
                    {s.label.split(" · ")[0]} · {time12(s.time)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scope.kind === "hall" ? s.eventTitle : `${s.hallName}, ${s.city}`}
                    {s.bookings > 0 && ` · ${s.bookings} booking${s.bookings === 1 ? "" : "s"}`}
                    {s.past && " · past"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={chip} onClick={() => void run(() => adminUpdateShow({ data: { id: s.id, isActive: !s.isActive } }))}>
                    {s.isActive ? "Listed" : "Hidden"}
                  </button>
                  <button
                    type="button"
                    className={chip + " border-destructive text-destructive"}
                    onClick={() => {
                      if (window.confirm(`Delete the ${s.label} show?`)) void run(() => adminDeleteShow({ data: { id: s.id } }));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
