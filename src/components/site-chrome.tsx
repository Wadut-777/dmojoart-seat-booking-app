import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { NewsletterForm } from "@/components/cms/forms";
import { useSiteSettings } from "@/components/cms/data";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

function Brand({ className }: { className?: string }) {
  const { brand } = useSiteSettings();
  const logo = mediaUrl(brand.logo);
  return (
    <Link to="/" className={cn("flex items-center gap-3", className)} aria-label={`${brand.name} home`}>
      {logo ? (
        <img src={logo} alt={brand.name} className="h-9 w-auto" />
      ) : (
        <span className="font-display text-2xl font-extrabold uppercase tracking-tight">{brand.logoText || brand.name}</span>
      )}
      <span className="size-2.5 rounded-full bg-highlight" aria-hidden="true" />
    </Link>
  );
}

export function SiteHeader() {
  const { nav } = useSiteSettings();
  const items = nav.filter((n) => n.enabled);
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu and stop the page scrolling behind it.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={cn(
          "mx-auto max-w-7xl rounded-3xl border transition-colors duration-300",
          solid || open ? "border-border/70 bg-card/90 shadow-2xl backdrop-blur-xl" : "border-white/5 bg-card/50 backdrop-blur-md",
        )}
      >
      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
        <Brand />

        <nav className="hidden items-center gap-7 text-sm font-medium xl:flex" aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/prebook"
            className="gold-surface hidden rounded-full px-6 py-2.5 text-sm font-medium uppercase tracking-wide transition-[filter] hover:brightness-110 sm:inline-flex"
          >
            Book Tickets
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="p-2 xl:hidden"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="max-h-[calc(100vh-7rem)] overflow-y-auto border-t border-border/60 px-5 pb-8 pt-4 xl:hidden" aria-label="Mobile">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} onClick={() => setOpen(false)} block />
              </li>
            ))}
          </ul>
          <Link to="/prebook" onClick={() => setOpen(false)} className="gold-surface mt-6 flex justify-center rounded-full px-5 py-4 text-sm font-medium uppercase tracking-wide">
            Book Tickets
          </Link>
        </nav>
      )}
      </div>
    </header>
  );
}

function NavLink({ href, label, onClick, block = false }: { href: string; label: string; onClick?: () => void; block?: boolean }) {
  const external = /^(https?:)?\/\//i.test(href);
  const cls = cn("text-foreground/85 transition-colors hover:text-primary", block && "block py-3 text-lg font-medium");
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer noopener" onClick={onClick}>
        {label}
      </a>
    );
  }
  return (
    <Link
      to={href as never}
      onClick={onClick}
      activeOptions={{ exact: href === "/" }}
      className={cls}
      activeProps={{ className: "text-primary", "aria-current": "page" }}
    >
      {label}
    </Link>
  );
}

export function SiteFooter() {
  const { brand, nav, footer, social, contact } = useSiteSettings();
  const links = social.filter((s) => s.url);
  return (
    <footer className="mx-3 mb-3 mt-24 rounded-[2rem] border border-border/60 bg-card/60 sm:mx-5">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-4">
        <div className="md:col-span-1">
          <Brand />
          <p className="mt-4 text-sm text-muted-foreground">{footer.intro}</p>
          {links.length > 0 && (
            <p className="mt-5 flex flex-wrap gap-2 text-sm">
              {links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" className="chip hover:text-primary">
                  {l.label}
                </a>
              ))}
            </p>
          )}
        </div>

        <nav aria-label="Footer">
          <h2 className="font-sans text-sm font-semibold text-primary">Explore</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {nav
              .filter((n) => n.enabled)
              .map((n) => (
                <li key={n.href}>
                  <NavLink href={n.href} label={n.label} />
                </li>
              ))}
          </ul>
        </nav>

        <div>
          <h2 className="font-sans text-sm font-semibold text-primary">Contact</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {contact.email && (
              <li>
                <a href={`mailto:${contact.email}`} className="hover:text-primary">
                  {contact.email}
                </a>
              </li>
            )}
            {contact.phone && (
              <li>
                <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:text-primary">
                  {contact.phone}
                </a>
              </li>
            )}
            {contact.address && <li className="whitespace-pre-line">{contact.address}</li>}
          </ul>
        </div>

        <div>
          <h2 className="font-sans text-sm font-semibold text-primary">{footer.newsletterTitle}</h2>
          <p className="mt-4 text-sm text-muted-foreground">{footer.newsletterText}</p>
          <NewsletterForm className="mt-4" />
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-muted-foreground">
          <p>{footer.copyright || `© ${brand.name}`}</p>
          <Link to="/admin" className="hover:text-primary">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
