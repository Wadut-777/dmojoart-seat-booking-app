import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Laugh,
  Mail,
  MapPin,
  Mic,
  Music,
  Phone,
  Play,
  Star,
  Users,
  X,
  Film as FilmIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { EnquiryForm } from "@/components/cms/forms";
import { Cta, Img, Pic, SmartLink, T, useBlock, useEditor } from "@/components/cms/context";
import { absoluteMedia, useCollection, useOrigin, usePublicEvents, useSiteSettings } from "@/components/cms/data";
import { list, num, str } from "@/lib/cms-blocks";
import type { CmsItem } from "@/lib/cms.functions";
import { cn } from "@/lib/utils";

/* ───────────── shared building blocks ───────────── */

/** Fades content in as it scrolls into view. Content stays visible without JavaScript or for reduced motion. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen
    el.classList.add("reveal-hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.remove("reveal-hidden");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("reveal", className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

/** Section container. tone="panel" wraps the content in a big rounded charcoal panel, as in the reference design. */
function Wrap({ children, className, tone = "plain" }: { children: ReactNode; className?: string; tone?: "plain" | "panel" }) {
  return (
    <section className="mx-auto max-w-7xl px-3 py-8 sm:px-5 md:py-12">
      <div className={cn(tone === "panel" ? "rounded-[2rem] border border-border/50 bg-card/50 px-5 py-10 md:px-12 md:py-14" : "px-2 md:px-0", className)}>
        {children}
      </div>
    </section>
  );
}

function Heading({ center = false }: { center?: boolean }) {
  return (
    <div className={cn("mb-8 max-w-3xl md:mb-10", center && "mx-auto text-center")}>
      <T k="eyebrow" as="p" className="text-sm font-medium text-primary" />
      <T k="title" as="h2" className="mt-2 text-3xl leading-[1.1] md:text-5xl" />
    </div>
  );
}

function ManageHint({ where }: { where: string }) {
  const ed = useEditor();
  if (!ed.editing) return null;
  return (
    <p className="mb-6 rounded-2xl border border-dashed border-primary/50 px-4 py-2.5 text-xs text-muted-foreground">
      The items below come from the content module: <strong className="text-foreground">{where}</strong> in the admin.
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-3xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Small circular arrow, like the orange chevrons in the reference design. */
function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <SmartLink href={href} className="group inline-flex items-center gap-3 text-sm font-medium uppercase tracking-wide text-primary">
      {children}
      <span className="grid size-8 place-items-center rounded-full border border-border text-highlight transition-colors group-hover:border-primary">
        <ArrowRight className="size-4" />
      </span>
    </SmartLink>
  );
}

const d = (it: CmsItem, key: string) => str(it.data, key);

function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-card p-3 text-foreground hover:text-primary">
        <X className="size-6" />
      </button>
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Turns a YouTube or Vimeo link into an embeddable URL; null for anything else. */
export function embedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=1`;
    if (host.endsWith("youtube.com")) {
      const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null);
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const embed = embedUrl(url);
  return (
    <Modal onClose={onClose} label="Video player">
      {embed ? (
        <div className="aspect-video w-full">
          <iframe
            src={embed}
            title="Video"
            className="size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <video src={url} controls autoPlay className="max-h-[80vh] w-full" />
      )}
    </Modal>
  );
}

const ICONS: Record<string, typeof Music> = {
  music: Music,
  film: FilmIcon,
  mic: Mic,
  calendar: CalendarDays,
  laugh: Laugh,
  users: Users,
  star: Star,
};

/** Round blue play button (as on "Watch trailer"). */
function PlayDisc({ size = "size-16" }: { size?: string }) {
  return (
    <span className={cn("gold-surface glow grid place-items-center rounded-full transition-transform group-hover:scale-110", size)}>
      <Play className="size-1/3 fill-current" />
    </span>
  );
}

/** Date shown like the date pills in the reference design: month, day, weekday. */
function DateBadge({ date, className }: { date: string | null; className?: string }) {
  if (!date) return null;
  const dt = new Date(`${date}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return (
    <span className={cn("gold-surface flex flex-col items-center rounded-3xl px-4 py-2 leading-tight shadow-xl", className)}>
      <span className="text-[0.7rem] font-medium">{dt.toLocaleDateString("en-IN", { month: "short" })}</span>
      <span className="font-display text-2xl font-bold">{String(dt.getDate()).padStart(2, "0")}</span>
      <span className="text-[0.7rem] font-medium">{dt.toLocaleDateString("en-IN", { weekday: "short" })}</span>
    </span>
  );
}

/* ───────────── banners ───────────── */

function Hero() {
  const { data } = useBlock();
  const ed = useEditor();
  const video = str(data, "videoUrl");
  return (
    <section className="px-3 pt-24 sm:px-5 sm:pt-28">
      <div className="relative isolate mx-auto flex min-h-[80vh] max-w-7xl items-end overflow-hidden rounded-[2rem] border border-border/50">
        <div className="absolute inset-0 -z-10">
          <Pic k="image" alt="" label="Hero image" />
          {video && !ed.editing && (
            <video src={video} autoPlay muted loop playsInline preload="none" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/5" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/20 to-transparent" />
        </div>
        <div className="w-full p-6 pb-10 sm:p-10 md:p-14 md:pb-16">
          <T k="eyebrow" as="p" className="chip bg-background/60 text-primary backdrop-blur" />
          <T k="title" as="h1" className="mt-5 max-w-4xl text-4xl leading-[1.02] sm:text-6xl md:text-7xl" />
          <T k="subtitle" as="p" multiline className="mt-5 max-w-2xl text-base text-foreground/75 md:text-lg" />
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Cta k="cta1" />
            <Cta k="cta2" variant="ghost" />
          </div>
        </div>
        <div className="absolute bottom-8 right-8 hidden flex-col items-center gap-2 text-xs text-foreground/60 md:flex" aria-hidden="true">
          Scroll
          <span className="scroll-cue block h-10 w-px bg-highlight" />
        </div>
      </div>
    </section>
  );
}

function PageHero() {
  return (
    <section className="px-3 pt-24 sm:px-5 sm:pt-28">
      <div className="relative isolate mx-auto flex min-h-[44vh] max-w-7xl items-end overflow-hidden rounded-[2rem] border border-border/50">
        <div className="absolute inset-0 -z-10">
          <Pic k="image" alt="" label="Banner image" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        </div>
        <div className="w-full p-6 sm:p-10 md:p-14">
          <T k="eyebrow" as="p" className="chip bg-background/60 text-primary backdrop-blur" />
          <T k="title" as="h1" className="mt-4 max-w-4xl text-4xl leading-[1.05] md:text-6xl" />
          <T k="subtitle" as="p" multiline className="mt-4 max-w-2xl text-base text-foreground/75 md:text-lg" />
        </div>
      </div>
    </section>
  );
}

/* ───────────── text + image ───────────── */

function About() {
  const { data } = useBlock();
  const ed = useEditor();
  const href = str(data, "linkHref");
  return (
    <Wrap>
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal>
          <T k="eyebrow" as="p" className="text-sm font-medium text-primary" />
          <T k="title" as="h2" className="mt-2 text-3xl leading-[1.1] md:text-5xl" />
          <T k="body" as="p" multiline className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg" />
          {(str(data, "linkText") || ed.editing) && (
            <div className="mt-8">
              <MoreLink href={href}>
                <T k="linkText" />
              </MoreLink>
            </div>
          )}
        </Reveal>
        <Reveal delay={120}>
          <div className="aspect-[4/5] overflow-hidden rounded-[2rem] border border-border/50">
            <Pic k="image" alt="D Mojo Art" label="About image" className="img-zoom" />
          </div>
        </Reveal>
      </div>
    </Wrap>
  );
}

function RichText() {
  const { data } = useBlock();
  const left = str(data, "imageSide") === "left";
  return (
    <Wrap>
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal className={cn(left && "md:order-2")}>
          <T k="eyebrow" as="p" className="text-sm font-medium text-primary" />
          <T k="title" as="h2" className="mt-2 text-3xl leading-[1.1] md:text-5xl" />
          <T k="body" as="p" multiline className="mt-6 whitespace-pre-line text-base leading-relaxed text-muted-foreground md:text-lg" />
        </Reveal>
        <Reveal delay={120} className={cn(left && "md:order-1")}>
          <div className="aspect-[4/3] overflow-hidden rounded-[2rem] border border-border/50">
            <Pic k="image" alt="" label="Image" className="img-zoom" />
          </div>
        </Reveal>
      </div>
    </Wrap>
  );
}

/* ───────────── collection-driven sections ───────────── */

function Services() {
  const items = useCollection("services");
  return (
    <Wrap>
      <Heading />
      <T k="intro" as="p" className="-mt-5 mb-10 max-w-2xl text-base text-muted-foreground md:text-lg" />
      <ManageHint where="Services" />
      {items.length === 0 ? (
        <Empty>No services published yet.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => {
            const Icon = ICONS[d(it, "icon")] ?? Star;
            const link = d(it, "link");
            return (
              <Reveal key={it.id} delay={i * 60}>
                <SmartLink
                  href={link}
                  className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 transition-all hover:-translate-y-1 hover:border-primary/60 md:p-8"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-xl md:text-2xl">{d(it, "title")}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{d(it, "description")}</p>
                  {link && (
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary">
                      Explore <ArrowRight className="size-4 text-highlight transition-transform group-hover:translate-x-1" />
                    </span>
                  )}
                </SmartLink>
              </Reveal>
            );
          })}
        </div>
      )}
    </Wrap>
  );
}

function TrailerButton({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="gold-surface inline-flex items-center gap-3 rounded-full py-1.5 pl-5 pr-1.5 text-sm font-medium uppercase tracking-wide hover:brightness-110"
      >
        Watch trailer
        <span className="grid size-9 place-items-center rounded-full bg-black/15">
          <Play className="size-4 fill-current" />
        </span>
      </button>
      {open && <VideoModal url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/70 py-3">
      <div>
        <dt className="text-sm text-primary">{label}</dt>
        <dd className="mt-0.5 text-sm text-muted-foreground">{value}</dd>
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-highlight" aria-hidden="true" />
    </div>
  );
}

function Productions() {
  const { data } = useBlock();
  const all = useCollection("movies");
  const limit = num(data, "limit", 3);
  const items = limit > 0 ? all.slice(0, limit) : all;
  const href = str(data, "linkHref");
  return (
    <Wrap>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Heading />
        {str(data, "linkText") && href && limit > 0 && (
          <div className="mb-10">
            <MoreLink href={href}>
              <T k="linkText" />
            </MoreLink>
          </div>
        )}
      </div>
      <ManageHint where="Movies" />
      {items.length === 0 ? (
        <Empty>No productions published yet.</Empty>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.id} delay={i * 80}>
              <article className="group flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <Img src={d(it, "image")} alt={`${d(it, "title")} poster`} label="Poster" className="img-zoom size-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex flex-wrap gap-2">
                    {d(it, "category") && <span className="chip">{d(it, "category")}</span>}
                    {d(it, "year") && <span className="chip">{d(it, "year")}</span>}
                  </div>
                  <h3 className="mt-4 text-2xl md:text-3xl">{d(it, "title")}</h3>
                  <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{d(it, "description")}</p>
                  {(d(it, "cast") || d(it, "crew")) && (
                    <dl className="mt-4">
                      {d(it, "cast") && <CreditRow label="Stars" value={d(it, "cast")} />}
                      {d(it, "crew") && <CreditRow label="Crew" value={d(it, "crew")} />}
                    </dl>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                    {d(it, "trailer") && <TrailerButton url={d(it, "trailer")} />}
                    {d(it, "link") && (
                      <SmartLink href={d(it, "link")} className="rounded-full border border-border px-6 py-3 text-sm font-medium uppercase tracking-wide text-primary hover:border-primary">
                        Details
                      </SmartLink>
                    )}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      )}
    </Wrap>
  );
}

function formatDate(date: string | null) {
  if (!date) return "Date to be announced";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const TYPE_LABEL: Record<string, string> = {
  movie: "Film",
  concert: "Concert",
  live_show: "Live show",
  theatre: "Theatre",
  festival: "Festival",
  other: "Event",
};

function Events() {
  const { data } = useBlock();
  const events = usePublicEvents();
  const types = str(data, "types", "all");
  const limit = num(data, "limit", 4);
  const today = new Date().toISOString().slice(0, 10);
  const allowed = types === "all" ? null : types.split(",").map((t) => t.trim());
  const filtered = events.filter(
    (e) => (!allowed || allowed.includes(e.eventType)) && (!e.releaseDate || e.releaseDate >= today),
  );
  const items = limit > 0 ? filtered.slice(0, limit) : filtered;
  const href = str(data, "linkHref");
  const origin = useOrigin();
  // Event structured data for search engines (only events that have a date).
  const jsonLd = items
    .filter((e) => e.releaseDate)
    .map((e) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      startDate: e.releaseDate,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: e.venue || e.city || "Venue to be announced", address: e.city || undefined },
      image: absoluteMedia(origin, e.posterUrl?.replace(/^\/media\//, "")) ?? undefined,
      description: e.synopsis || e.tagline || undefined,
      offers: e.bookingOpen
        ? { "@type": "Offer", url: `${origin}/prebook`, availability: "https://schema.org/InStock", priceCurrency: "INR" }
        : undefined,
    }));
  return (
    <Wrap tone="panel">
      {jsonLd.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Heading />
        {str(data, "linkText") && href && (
          <div className="mb-10">
            <MoreLink href={href}>
              <T k="linkText" />
            </MoreLink>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <Empty>No upcoming events in this category right now. Check back soon.</Empty>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((e, i) => (
            <Reveal key={e.id} delay={i * 70}>
              <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/60">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <Img src={e.posterUrl} alt={`${e.title} poster`} label="Event poster" className="img-zoom size-full object-cover" />
                  <DateBadge date={e.releaseDate} className="absolute left-3 top-3" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <span className="chip self-start">{TYPE_LABEL[e.eventType] ?? "Event"}</span>
                  <h3 className="mt-3 text-xl leading-tight">{e.title}</h3>
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4 text-highlight" /> {formatDate(e.releaseDate)}
                  </p>
                  {(e.venue || e.city) && (
                    <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="size-4 text-highlight" /> {[e.venue, e.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {e.bookingOpen && (
                    <a
                      href={`/prebook?event=${e.id}`}
                      className="gold-surface mt-auto inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium uppercase tracking-wide hover:brightness-110"
                      style={{ marginTop: "1.25rem" }}
                    >
                      <T k="ctaText" />
                    </a>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      )}
    </Wrap>
  );
}

function SocialLinks({ item }: { item: CmsItem }) {
  const links = [
    ["Instagram", d(item, "instagram")],
    ["YouTube", d(item, "youtube")],
    ["Website", d(item, "website")],
  ].filter(([, url]) => url);
  if (!links.length) return null;
  return (
    <p className="mt-3 flex flex-wrap gap-2 text-sm">
      {links.map(([label, url]) => (
        <a key={label} href={url} target="_blank" rel="noreferrer noopener" className="chip hover:text-primary">
          {label}
        </a>
      ))}
    </p>
  );
}

function Artists() {
  const { data } = useBlock();
  const category = str(data, "category", "all");
  const items = useCollection("artists").filter((a) => category === "all" || d(a, "category") === category);
  return (
    <Wrap>
      <Heading />
      <ManageHint where="Artists" />
      {items.length === 0 ? (
        <Empty>No artists published yet.</Empty>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((a, i) => (
            <Reveal key={a.id} delay={i * 70}>
              <article>
                <div className="aspect-[3/4] overflow-hidden rounded-3xl border border-border/50 bg-card">
                  <Img src={d(a, "image")} alt={d(a, "title")} label="Artist photo" className="img-zoom size-full object-cover" />
                </div>
                <h3 className="mt-4 text-xl md:text-2xl">{d(a, "title")}</h3>
                <p className="mt-1 text-sm font-medium text-primary">{d(a, "subtitle")}</p>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{d(a, "description")}</p>
                <SocialLinks item={a} />
              </article>
            </Reveal>
          ))}
        </div>
      )}
    </Wrap>
  );
}

function Videos() {
  const items = useCollection("gallery_videos");
  const [playing, setPlaying] = useState<string | null>(null);
  return (
    <Wrap tone="panel">
      <Heading />
      <ManageHint where="Video gallery" />
      {items.length === 0 ? (
        <Empty>No videos published yet.</Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          {items.map((v, i) => {
            const url = d(v, "video");
            return (
              <Reveal key={v.id} delay={i * 70}>
                <button
                  type="button"
                  disabled={!url}
                  onClick={() => setPlaying(url)}
                  className="group relative block aspect-video w-full overflow-hidden rounded-3xl border border-border/50 bg-card text-left disabled:cursor-default"
                  aria-label={`Play ${d(v, "title")}`}
                >
                  <Img src={d(v, "image")} alt="" label="Video thumbnail" className="img-zoom size-full object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <PlayDisc />
                  </span>
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-5">
                    <span className="text-lg font-semibold">{d(v, "title")}</span>
                    {d(v, "category") && <span className="chip bg-background/70 backdrop-blur">{d(v, "category")}</span>}
                  </span>
                </button>
              </Reveal>
            );
          })}
        </div>
      )}
      {playing && <VideoModal url={playing} onClose={() => setPlaying(null)} />}
    </Wrap>
  );
}

function Portfolio() {
  const { data } = useBlock();
  const all = useCollection("portfolio");
  const limit = num(data, "limit", 6);
  const items = limit > 0 ? all.slice(0, limit) : all;
  const href = str(data, "linkHref");
  return (
    <Wrap>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Heading />
        {str(data, "linkText") && href && (
          <div className="mb-10">
            <MoreLink href={href}>
              <T k="linkText" />
            </MoreLink>
          </div>
        )}
      </div>
      <ManageHint where="Portfolio" />
      {items.length === 0 ? (
        <Empty>No projects published yet.</Empty>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p, i) => (
            <Reveal key={p.id} delay={i * 60}>
              <SmartLink href={d(p, "link")} className="group relative block aspect-[4/3] overflow-hidden rounded-3xl border border-border/50 bg-card">
                <Img src={d(p, "image")} alt={d(p, "title")} label="Project image" className="img-zoom size-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-5">
                  <span className="flex flex-wrap gap-2">
                    {d(p, "category") && <span className="chip bg-background/70 backdrop-blur">{d(p, "category")}</span>}
                    {d(p, "year") && <span className="chip bg-background/70 backdrop-blur">{d(p, "year")}</span>}
                  </span>
                  <span className="mt-2 block text-xl font-semibold">{d(p, "title")}</span>
                </span>
              </SmartLink>
            </Reveal>
          ))}
        </div>
      )}
    </Wrap>
  );
}

function Gallery() {
  const { data } = useBlock();
  const items = useCollection("gallery_photos");
  const [filter, setFilter] = useState(str(data, "category", "all"));
  const [open, setOpen] = useState<number | null>(null);
  const categories = ["all", ...Array.from(new Set(items.map((i) => d(i, "category")).filter(Boolean)))];
  const shown = items.filter((i) => filter === "all" || d(i, "category") === filter);
  const current = open === null ? null : shown[open];

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setOpen((o) => (o === null ? o : (o + 1) % shown.length));
      if (e.key === "ArrowLeft") setOpen((o) => (o === null ? o : (o - 1 + shown.length) % shown.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, shown.length]);

  return (
    <Wrap>
      <Heading />
      <ManageHint where="Photo gallery" />
      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Gallery categories">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={filter === c}
            onClick={() => setFilter(c)}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              filter === c ? "gold-surface" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty>No photos in this category yet.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {shown.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setOpen(i)} className="group relative aspect-square overflow-hidden rounded-2xl border border-border/50 bg-card" aria-label={`Open ${d(p, "title") || "photo"}`}>
              <Img src={d(p, "image")} alt={d(p, "title")} label="Photo" className="img-zoom size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {current && open !== null && (
        <Modal onClose={() => setOpen(null)} label="Photo viewer">
          <div className="relative bg-card">
            <div className="flex max-h-[80vh] min-h-[50vh] items-center justify-center">
              <Img src={d(current, "image")} alt={d(current, "title")} label="Photo" className="max-h-[80vh] w-full object-contain" />
            </div>
            <p className="py-3 text-center text-sm text-muted-foreground">{d(current, "title")}</p>
            {shown.length > 1 && (
              <>
                <button type="button" aria-label="Previous photo" onClick={() => setOpen((open - 1 + shown.length) % shown.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 hover:text-primary">
                  <ChevronLeft className="size-6" />
                </button>
                <button type="button" aria-label="Next photo" onClick={() => setOpen((open + 1) % shown.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 hover:text-primary">
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </Wrap>
  );
}

function Team() {
  const items = useCollection("team");
  return (
    <Wrap>
      <Heading />
      <ManageHint where="Team" />
      {items.length === 0 ? (
        <Empty>No team members published yet.</Empty>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((m, i) => (
            <Reveal key={m.id} delay={i * 70}>
              <div className="aspect-square overflow-hidden rounded-3xl border border-border/50 bg-card">
                <Img src={d(m, "image")} alt={d(m, "title")} label="Team photo" className="img-zoom size-full object-cover" />
              </div>
              <h3 className="mt-4 text-xl">{d(m, "title")}</h3>
              <p className="text-sm font-medium text-primary">{d(m, "subtitle")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{d(m, "description")}</p>
            </Reveal>
          ))}
        </div>
      )}
    </Wrap>
  );
}

function Partners() {
  const sponsors = useCollection("sponsors");
  const quotes = useCollection("testimonials");
  return (
    <Wrap tone="panel">
      <Heading />
      <ManageHint where="Sponsors & partners, Testimonials" />
      {sponsors.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {sponsors.map((s) => (
            <SmartLink key={s.id} href={d(s, "link")} className="flex aspect-[3/2] items-center justify-center rounded-2xl border border-border/60 bg-background/60 p-6">
              {d(s, "image") ? (
                <Img src={d(s, "image")} alt={d(s, "title")} className="max-h-full max-w-full object-contain opacity-70 transition-opacity hover:opacity-100" />
              ) : (
                <span className="text-center text-sm font-semibold text-muted-foreground">{d(s, "title")}</span>
              )}
            </SmartLink>
          ))}
        </div>
      )}
      {quotes.length > 0 && (
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {quotes.map((q, i) => (
            <Reveal key={q.id} delay={i * 80}>
              <figure className="h-full rounded-3xl border border-border/60 bg-background/60 p-7">
                <span className="font-display text-5xl leading-none text-highlight" aria-hidden="true">
                  “
                </span>
                <blockquote className="mt-2 text-base leading-relaxed text-foreground/90">{d(q, "description")}</blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-semibold">{d(q, "title")}</span>
                  <span className="block text-muted-foreground">{d(q, "subtitle")}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      )}
    </Wrap>
  );
}

function Releases() {
  const items = useCollection("music_releases");
  return (
    <Wrap>
      <Heading />
      <ManageHint where="Music releases" />
      {items.length === 0 ? (
        <Empty>No releases published yet.</Empty>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r, i) => (
            <Reveal key={r.id} delay={i * 70}>
              <SmartLink href={d(r, "link")} className="group flex gap-5 rounded-3xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/60">
                <div className="size-28 shrink-0 overflow-hidden rounded-2xl bg-muted">
                  <Img src={d(r, "image")} alt={d(r, "title")} label="Cover" className="size-full object-cover" />
                </div>
                <div className="flex flex-col justify-center">
                  <span className="chip self-start">{d(r, "year")}</span>
                  <h3 className="mt-2 text-xl">{d(r, "title")}</h3>
                  <p className="text-sm text-muted-foreground">{d(r, "subtitle")}</p>
                </div>
              </SmartLink>
            </Reveal>
          ))}
        </div>
      )}
    </Wrap>
  );
}

/* ───────────── lists inside the section itself ───────────── */

function Why() {
  const { data } = useBlock();
  const items = list(data, "items");
  return (
    <Wrap>
      <Heading />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((_, i) => (
          <Reveal key={i} delay={i * 60}>
            <div className="h-full rounded-3xl border border-border/60 bg-card p-7 md:p-8">
              <span className="font-display text-4xl font-bold text-primary/50">{String(i + 1).padStart(2, "0")}</span>
              <T k={`items.${i}.title`} as="h3" className="mt-4 block text-xl md:text-2xl" />
              <T k={`items.${i}.description`} as="p" multiline className="mt-3 block text-sm leading-relaxed text-muted-foreground" />
            </div>
          </Reveal>
        ))}
      </div>
    </Wrap>
  );
}

function Timeline() {
  const { data } = useBlock();
  const items = list(data, "items");
  return (
    <Wrap tone="panel">
      <Heading />
      <ol className="relative ml-3 space-y-10 border-l border-border pl-8 md:pl-12">
        {items.map((_, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[2.55rem] top-2 size-3.5 rounded-full bg-highlight ring-4 ring-card md:-left-[3.55rem]" aria-hidden="true" />
            <T k={`items.${i}.year`} as="p" className="chip block self-start" />
            <T k={`items.${i}.title`} as="h3" className="mt-2 block text-xl md:text-2xl" />
            <T k={`items.${i}.description`} as="p" multiline className="mt-2 block max-w-2xl text-sm leading-relaxed text-muted-foreground" />
          </li>
        ))}
      </ol>
    </Wrap>
  );
}

/* ───────────── calls to action and forms ───────────── */

/** The blue summary-style card with a black pill button, like the "Total price" card in the reference. */
function CtaBanner() {
  return (
    <section className="mx-auto max-w-7xl px-3 py-8 sm:px-5 md:py-12">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-primary text-primary-foreground">
        <div className="absolute inset-0 -z-10 opacity-20 mix-blend-multiply">
          <Pic k="image" alt="" label="" />
        </div>
        <div className="mx-auto max-w-3xl px-6 py-14 text-center md:py-20">
          <T k="title" as="h2" className="text-3xl leading-[1.1] md:text-5xl" />
          <T k="text" as="p" multiline className="mx-auto mt-4 max-w-xl text-base opacity-80 md:text-lg" />
          <div className="mt-8 flex justify-center">
            <Cta k="button" variant="dark" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Enquiry() {
  const { data } = useBlock();
  return (
    <Wrap tone="panel">
      <div className="grid gap-10 md:grid-cols-5 md:gap-14">
        <div className="md:col-span-2">
          <T k="eyebrow" as="p" className="text-sm font-medium text-primary" />
          <T k="title" as="h2" className="mt-2 text-3xl leading-[1.1] md:text-4xl" />
          <T k="intro" as="p" multiline className="mt-5 text-base text-muted-foreground" />
        </div>
        <div className="md:col-span-3">
          <EnquiryForm kind={str(data, "kind", "business")} submitText={str(data, "submitText", "Send enquiry")} />
        </div>
      </div>
    </Wrap>
  );
}

function ContactRow({ icon: Icon, children }: { icon: typeof Mail; children: ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="pt-2 text-base">{children}</span>
    </li>
  );
}

function Contact() {
  const s = useSiteSettings();
  const { contact, social } = s;
  const links = social.filter((x) => x.url);
  return (
    <Wrap>
      <Heading />
      <div className="grid gap-10 md:grid-cols-2">
        <ul className="space-y-5">
          {contact.email && (
            <ContactRow icon={Mail}>
              <a href={`mailto:${contact.email}`} className="hover:text-primary">
                {contact.email}
              </a>
            </ContactRow>
          )}
          {contact.phone && (
            <ContactRow icon={Phone}>
              <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:text-primary">
                {contact.phone}
              </a>
            </ContactRow>
          )}
          {contact.address && (
            <ContactRow icon={MapPin}>
              <span className="whitespace-pre-line">{contact.address}</span>
            </ContactRow>
          )}
          {contact.hours && <ContactRow icon={Clock}>{contact.hours}</ContactRow>}
          {links.length > 0 && (
            <li className="flex flex-wrap gap-2 pt-2 text-sm">
              {links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" className="chip hover:text-primary">
                  {l.label}
                </a>
              ))}
            </li>
          )}
        </ul>
        <div className="aspect-[4/3] overflow-hidden rounded-3xl border border-border/60 bg-card">
          {contact.mapEmbedUrl.startsWith("https://www.google.com/maps/embed") ? (
            <iframe src={contact.mapEmbedUrl} title="Map" className="size-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          ) : (
            <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Add a Google Maps embed link in the site settings to show the map here.
            </div>
          )}
        </div>
      </div>
    </Wrap>
  );
}

/* ───────────── registry ───────────── */

export const SECTION_COMPONENTS: Record<string, () => ReactNode> = {
  hero: Hero,
  pagehero: PageHero,
  about: About,
  richtext: RichText,
  services: Services,
  productions: Productions,
  events: Events,
  artists: Artists,
  videos: Videos,
  portfolio: Portfolio,
  gallery: Gallery,
  why: Why,
  timeline: Timeline,
  team: Team,
  partners: Partners,
  releases: Releases,
  cta: CtaBanner,
  enquiry: Enquiry,
  contact: Contact,
};
