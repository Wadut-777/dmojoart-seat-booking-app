import { Link } from "@tanstack/react-router";
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

function Wrap({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("mx-auto max-w-7xl px-5 py-20 md:py-28", className)}>{children}</section>;
}

function Heading({ center = false }: { center?: boolean }) {
  return (
    <div className={cn("mb-12 max-w-3xl", center && "mx-auto text-center")}>
      <T k="eyebrow" as="p" className="text-xs font-bold uppercase tracking-[0.35em] text-primary" />
      <T k="title" as="h2" className="mt-3 text-4xl uppercase leading-[1.05] md:text-6xl" />
    </div>
  );
}

function ManageHint({ where }: { where: string }) {
  const ed = useEditor();
  if (!ed.editing) return null;
  return (
    <p className="mb-6 border border-dashed border-primary/50 px-3 py-2 text-xs text-muted-foreground">
      The items below come from the content module: <strong className="text-foreground">{where}</strong> in the admin.
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
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
      <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 p-2 text-foreground hover:text-primary">
        <X className="size-7" />
      </button>
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
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

/* ───────────── banners ───────────── */

function Hero() {
  const { data } = useBlock();
  const ed = useEditor();
  const video = str(data, "videoUrl");
  return (
    <section className="relative isolate flex min-h-[92vh] items-end overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <Pic k="image" alt="" label="Hero image" />
        {video && !ed.editing && (
          <video src={video} autoPlay muted loop playsInline preload="none" className="absolute inset-0 size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
      </div>
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-40">
        <T k="eyebrow" as="p" className="text-xs font-bold uppercase tracking-[0.4em] text-primary" />
        <T k="title" as="h1" className="mt-5 max-w-5xl text-5xl uppercase leading-[0.98] sm:text-6xl md:text-8xl" />
        <T k="subtitle" as="p" multiline className="mt-6 max-w-2xl text-lg text-foreground/80 md:text-xl" />
        <div className="mt-10 flex flex-wrap gap-4">
          <Cta k="cta1" />
          <Cta k="cta2" variant="ghost" />
        </div>
      </div>
      <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[0.65rem] uppercase tracking-[0.35em] text-foreground/60 md:flex" aria-hidden="true">
        Scroll
        <span className="scroll-cue block h-10 w-px bg-primary" />
      </div>
    </section>
  );
}

function PageHero() {
  return (
    <section className="relative isolate flex min-h-[52vh] items-end overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <Pic k="image" alt="" label="Banner image" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      </div>
      <div className="mx-auto w-full max-w-7xl px-5 pb-14 pt-36">
        <T k="eyebrow" as="p" className="text-xs font-bold uppercase tracking-[0.4em] text-primary" />
        <T k="title" as="h1" className="mt-4 max-w-4xl text-5xl uppercase leading-none md:text-7xl" />
        <T k="subtitle" as="p" multiline className="mt-5 max-w-2xl text-lg text-foreground/75" />
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
      <div className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
        <Reveal>
          <T k="eyebrow" as="p" className="text-xs font-bold uppercase tracking-[0.35em] text-primary" />
          <T k="title" as="h2" className="mt-3 text-4xl uppercase leading-[1.05] md:text-5xl" />
          <T k="body" as="p" multiline className="mt-6 text-lg leading-relaxed text-muted-foreground" />
          {(str(data, "linkText") || ed.editing) && (
            <SmartLink href={href} className="mt-8 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary hover:gap-4">
              <T k="linkText" /> <ArrowRight className="size-4" />
            </SmartLink>
          )}
        </Reveal>
        <Reveal delay={120}>
          <div className="aspect-[4/5] overflow-hidden">
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
      <div className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
        <Reveal className={cn(left && "md:order-2")}>
          <T k="eyebrow" as="p" className="text-xs font-bold uppercase tracking-[0.35em] text-primary" />
          <T k="title" as="h2" className="mt-3 text-4xl uppercase leading-[1.05] md:text-5xl" />
          <T k="body" as="p" multiline className="mt-6 whitespace-pre-line text-lg leading-relaxed text-muted-foreground" />
        </Reveal>
        <Reveal delay={120} className={cn(left && "md:order-1")}>
          <div className="aspect-[4/3] overflow-hidden">
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
      <T k="intro" as="p" className="-mt-8 mb-12 max-w-2xl text-lg text-muted-foreground" />
      <ManageHint where="Services" />
      {items.length === 0 ? (
        <Empty>No services published yet.</Empty>
      ) : (
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => {
            const Icon = ICONS[d(it, "icon")] ?? Star;
            const link = d(it, "link");
            return (
              <Reveal key={it.id} delay={i * 60} className="bg-background">
                <SmartLink href={link} className="group block h-full p-8 transition-colors hover:bg-card md:p-10">
                  <Icon className="size-8 text-primary" aria-hidden="true" />
                  <h3 className="mt-6 text-2xl uppercase">{d(it, "title")}</h3>
                  <p className="mt-3 text-muted-foreground">{d(it, "description")}</p>
                  {link && (
                    <span className="mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Explore <ArrowRight className="size-4" />
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
          <SmartLink href={href} className="mb-12 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary">
            <T k="linkText" /> <ArrowRight className="size-4" />
          </SmartLink>
        )}
      </div>
      <ManageHint where="Movies" />
      {items.length === 0 ? (
        <Empty>No productions published yet.</Empty>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.id} delay={i * 80}>
              <article className="group">
                <div className="relative aspect-[2/3] overflow-hidden bg-card">
                  <Img src={d(it, "image")} alt={`${d(it, "title")} poster`} label="Poster" className="img-zoom size-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
                      {[d(it, "category"), d(it, "year")].filter(Boolean).join(" · ")}
                    </p>
                    <h3 className="mt-2 text-3xl uppercase">{d(it, "title")}</h3>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-muted-foreground">{d(it, "description")}</p>
                {(d(it, "cast") || d(it, "crew")) && (
                  <dl className="mt-3 space-y-1 text-sm">
                    {d(it, "cast") && (
                      <div className="flex gap-2">
                        <dt className="font-semibold text-foreground">Cast</dt>
                        <dd className="text-muted-foreground">{d(it, "cast")}</dd>
                      </div>
                    )}
                    {d(it, "crew") && (
                      <div className="flex gap-2">
                        <dt className="font-semibold text-foreground">Crew</dt>
                        <dd className="text-muted-foreground">{d(it, "crew")}</dd>
                      </div>
                    )}
                  </dl>
                )}
                <div className="mt-4 flex gap-5 text-xs font-bold uppercase tracking-[0.2em]">
                  {d(it, "trailer") && <TrailerButton url={d(it, "trailer")} />}
                  {d(it, "link") && (
                    <SmartLink href={d(it, "link")} className="inline-flex items-center gap-2 text-primary">
                      View production <ArrowRight className="size-4" />
                    </SmartLink>
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

function TrailerButton({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 hover:text-primary">
        <Play className="size-4 text-primary" /> Trailer
      </button>
      {open && <VideoModal url={url} onClose={() => setOpen(false)} />}
    </>
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
    <Wrap className="bg-card/30">
      {jsonLd.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Heading />
        {str(data, "linkText") && href && (
          <SmartLink href={href} className="mb-12 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary">
            <T k="linkText" /> <ArrowRight className="size-4" />
          </SmartLink>
        )}
      </div>
      {items.length === 0 ? (
        <Empty>No upcoming events in this category right now. Check back soon.</Empty>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((e, i) => (
            <Reveal key={e.id} delay={i * 70}>
              <article className="group flex h-full flex-col border border-border bg-background">
                <div className="aspect-[3/4] overflow-hidden bg-card">
                  <Img src={e.posterUrl} alt={`${e.title} poster`} label="Event poster" className="img-zoom size-full object-cover" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">{TYPE_LABEL[e.eventType] ?? "Event"}</p>
                  <h3 className="mt-2 text-2xl uppercase leading-tight">{e.title}</h3>
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4 text-primary" /> {formatDate(e.releaseDate)}
                  </p>
                  {(e.venue || e.city) && (
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="size-4 text-primary" /> {[e.venue, e.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {e.bookingOpen && (
                    <Link to="/prebook" className="gold-surface mt-5 inline-flex items-center justify-center px-5 py-3 text-xs font-bold uppercase tracking-[0.15em]">
                      <T k="ctaText" />
                    </Link>
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
    <p className="mt-3 flex flex-wrap gap-4 text-xs font-bold uppercase tracking-[0.2em]">
      {links.map(([label, url]) => (
        <a key={label} href={url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
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
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((a, i) => (
            <Reveal key={a.id} delay={i * 70}>
              <article>
                <div className="aspect-[3/4] overflow-hidden bg-card">
                  <Img src={d(a, "image")} alt={d(a, "title")} label="Artist photo" className="img-zoom size-full object-cover" />
                </div>
                <h3 className="mt-4 text-2xl uppercase">{d(a, "title")}</h3>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">{d(a, "subtitle")}</p>
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
    <Wrap className="bg-card/30">
      <Heading />
      <ManageHint where="Video gallery" />
      {items.length === 0 ? (
        <Empty>No videos published yet.</Empty>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((v, i) => {
            const url = d(v, "video");
            return (
              <Reveal key={v.id} delay={i * 70}>
                <button
                  type="button"
                  disabled={!url}
                  onClick={() => setPlaying(url)}
                  className="group relative block aspect-video w-full overflow-hidden bg-card text-left disabled:cursor-default"
                  aria-label={`Play ${d(v, "title")}`}
                >
                  <Img src={d(v, "image")} alt="" label="Video thumbnail" className="img-zoom size-full object-cover" />
                  <span className="absolute inset-0 bg-black/40 transition-colors group-hover:bg-black/20" />
                  <span className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary text-primary transition-transform group-hover:scale-110">
                    <Play className="size-6" />
                  </span>
                  <span className="absolute inset-x-0 bottom-0 p-4">
                    <span className="block text-xs font-bold uppercase tracking-[0.3em] text-primary">{d(v, "category")}</span>
                    <span className="block text-xl uppercase">{d(v, "title")}</span>
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
          <SmartLink href={href} className="mb-12 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary">
            <T k="linkText" /> <ArrowRight className="size-4" />
          </SmartLink>
        )}
      </div>
      <ManageHint where="Portfolio" />
      {items.length === 0 ? (
        <Empty>No projects published yet.</Empty>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p, i) => (
            <Reveal key={p.id} delay={i * 60}>
              <SmartLink href={d(p, "link")} className="group relative block aspect-[4/3] overflow-hidden bg-card">
                <Img src={d(p, "image")} alt={d(p, "title")} label="Project image" className="img-zoom size-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-6">
                  <span className="block text-xs font-bold uppercase tracking-[0.3em] text-primary">
                    {[d(p, "category"), d(p, "year")].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-1 block text-2xl uppercase">{d(p, "title")}</span>
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
              "border px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] transition-colors",
              filter === c ? "gold-surface border-transparent" : "border-border text-muted-foreground hover:text-foreground",
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
            <button key={p.id} type="button" onClick={() => setOpen(i)} className="group relative aspect-square overflow-hidden bg-card" aria-label={`Open ${d(p, "title") || "photo"}`}>
              <Img src={d(p, "image")} alt={d(p, "title")} label="Photo" className="img-zoom size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {current && open !== null && (
        <Modal onClose={() => setOpen(null)} label="Photo viewer">
          <div className="relative">
            <div className="flex max-h-[80vh] min-h-[50vh] items-center justify-center">
              <Img src={d(current, "image")} alt={d(current, "title")} label="Photo" className="max-h-[80vh] w-full object-contain" />
            </div>
            <p className="mt-3 text-center text-sm text-muted-foreground">{d(current, "title")}</p>
            {shown.length > 1 && (
              <>
                <button type="button" aria-label="Previous photo" onClick={() => setOpen((open - 1 + shown.length) % shown.length)} className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/60 p-3 hover:text-primary">
                  <ChevronLeft className="size-6" />
                </button>
                <button type="button" aria-label="Next photo" onClick={() => setOpen((open + 1) % shown.length)} className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/60 p-3 hover:text-primary">
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
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((m, i) => (
            <Reveal key={m.id} delay={i * 70}>
              <div className="aspect-square overflow-hidden bg-card">
                <Img src={d(m, "image")} alt={d(m, "title")} label="Team photo" className="img-zoom size-full object-cover" />
              </div>
              <h3 className="mt-4 text-xl uppercase">{d(m, "title")}</h3>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">{d(m, "subtitle")}</p>
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
    <Wrap className="bg-card/30">
      <Heading />
      <ManageHint where="Sponsors & partners, Testimonials" />
      {sponsors.length > 0 && (
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {sponsors.map((s) => (
            <SmartLink key={s.id} href={d(s, "link")} className="flex aspect-[3/2] items-center justify-center bg-background p-6">
              {d(s, "image") ? (
                <Img src={d(s, "image")} alt={d(s, "title")} className="max-h-full max-w-full object-contain opacity-70 transition-opacity hover:opacity-100" />
              ) : (
                <span className="text-center text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">{d(s, "title")}</span>
              )}
            </SmartLink>
          ))}
        </div>
      )}
      {quotes.length > 0 && (
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {quotes.map((q, i) => (
            <Reveal key={q.id} delay={i * 80}>
              <figure className="h-full border-l-2 border-primary pl-6">
                <blockquote className="text-lg leading-relaxed text-foreground/90">“{d(q, "description")}”</blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-bold uppercase tracking-[0.15em]">{d(q, "title")}</span>
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r, i) => (
            <Reveal key={r.id} delay={i * 70}>
              <SmartLink href={d(r, "link")} className="group flex gap-5 border border-border bg-card/40 p-4 transition-colors hover:border-primary">
                <div className="size-28 shrink-0 overflow-hidden bg-card">
                  <Img src={d(r, "image")} alt={d(r, "title")} label="Cover" className="size-full object-cover" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">{d(r, "year")}</p>
                  <h3 className="mt-1 text-xl uppercase">{d(r, "title")}</h3>
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
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <Reveal key={i} delay={i * 60} className="bg-background">
            <div className="h-full p-8 md:p-10">
              <span className="font-display text-5xl text-primary/40">{String(i + 1).padStart(2, "0")}</span>
              <T k={`items.${i}.title`} as="h3" className="mt-4 block text-2xl uppercase" />
              <T k={`items.${i}.description`} as="p" multiline className="mt-3 block text-muted-foreground" />
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
    <Wrap className="bg-card/30">
      <Heading />
      <ol className="relative ml-3 space-y-10 border-l border-border pl-8 md:ml-0 md:pl-12">
        {items.map((it, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[2.45rem] top-2 size-3 rounded-full bg-primary md:-left-[3.45rem]" aria-hidden="true" />
            <T k={`items.${i}.year`} as="p" className="block text-xs font-bold uppercase tracking-[0.35em] text-primary" />
            <T k={`items.${i}.title`} as="h3" className="mt-1 block text-2xl uppercase" />
            <T k={`items.${i}.description`} as="p" multiline className="mt-2 block max-w-2xl text-muted-foreground" />
          </li>
        ))}
      </ol>
    </Wrap>
  );
}

/* ───────────── calls to action and forms ───────────── */

function CtaBanner() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <Pic k="image" alt="" label="Banner" />
        <div className="absolute inset-0 bg-background/80" />
      </div>
      <div className="mx-auto max-w-4xl px-5 py-24 text-center md:py-32">
        <T k="title" as="h2" className="text-4xl uppercase leading-[1.05] md:text-6xl" />
        <T k="text" as="p" multiline className="mx-auto mt-5 max-w-2xl text-lg text-foreground/75" />
        <div className="mt-9 flex justify-center">
          <Cta k="button" />
        </div>
      </div>
    </section>
  );
}

function Enquiry() {
  const { data } = useBlock();
  return (
    <Wrap>
      <div className="grid gap-12 md:grid-cols-5 md:gap-16">
        <div className="md:col-span-2">
          <T k="eyebrow" as="p" className="text-xs font-bold uppercase tracking-[0.35em] text-primary" />
          <T k="title" as="h2" className="mt-3 text-4xl uppercase leading-[1.05] md:text-5xl" />
          <T k="intro" as="p" multiline className="mt-5 text-lg text-muted-foreground" />
        </div>
        <div className="md:col-span-3">
          <EnquiryForm kind={str(data, "kind", "business")} submitText={str(data, "submitText", "Send enquiry")} />
        </div>
      </div>
    </Wrap>
  );
}

function Contact() {
  const s = useSiteSettings();
  const { contact, social } = s;
  const links = social.filter((x) => x.url);
  return (
    <Wrap>
      <Heading />
      <div className="grid gap-12 md:grid-cols-2">
        <ul className="space-y-6 text-lg">
          {contact.email && (
            <li className="flex gap-4">
              <Mail className="mt-1 size-5 shrink-0 text-primary" />
              <a href={`mailto:${contact.email}`} className="hover:text-primary">
                {contact.email}
              </a>
            </li>
          )}
          {contact.phone && (
            <li className="flex gap-4">
              <Phone className="mt-1 size-5 shrink-0 text-primary" />
              <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:text-primary">
                {contact.phone}
              </a>
            </li>
          )}
          {contact.address && (
            <li className="flex gap-4">
              <MapPin className="mt-1 size-5 shrink-0 text-primary" />
              <span className="whitespace-pre-line">{contact.address}</span>
            </li>
          )}
          {contact.hours && (
            <li className="flex gap-4">
              <Clock className="mt-1 size-5 shrink-0 text-primary" />
              <span>{contact.hours}</span>
            </li>
          )}
          {links.length > 0 && (
            <li className="flex flex-wrap gap-5 pt-2 text-xs font-bold uppercase tracking-[0.25em]">
              {links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                  {l.label}
                </a>
              ))}
            </li>
          )}
        </ul>
        <div className="aspect-[4/3] overflow-hidden border border-border bg-card">
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
