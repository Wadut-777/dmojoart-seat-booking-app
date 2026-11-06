/** Show date/time helpers shared by server and browser. Show times are India time (IST). */

/** "2026-10-02" + "19:00" -> "Fri, 2 Oct 2026 · 7:00 PM". */
export function showLabel(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${day} · ${time12(time)}`;
}

/** "19:05" -> "7:05 PM". */
export function time12(time: string): string {
  const [h, min] = time.split(":").map(Number);
  const hour = h ?? 0;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(min ?? 0).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

/** Current India date and time as "YYYY-MM-DD" and "HH:MM". */
export function nowIst(now = Date.now()): { date: string; time: string } {
  const iso = new Date(now + 5.5 * 3600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** True while the show has not started yet. */
export function isUpcoming(date: string, time: string, now = Date.now()): boolean {
  const n = nowIst(now);
  return `${date}T${time}` > `${n.date}T${n.time}`;
}

export type PublicShow = {
  id: string;
  hallId: string;
  eventId: string;
  eventTitle: string;
  date: string;
  time: string;
  label: string;
};
