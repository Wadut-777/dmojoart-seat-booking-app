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
        <span className="font-display text-2xl uppercase tracking-[0.18em]">{brand.logoText || brand.name}</span>
      )}
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
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        solid || open ? "border-b border-border/60 bg-background/90 backdrop-blur-xl" : "bg-gradient-to-b from-black/70 to-transparent",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <Brand />

        <nav className="hidden items-center gap-6 text-xs font-bold uppercase tracking-[0.18em] xl:flex" aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/prebook"
            className="gold-surface hidden px-5 py-2.5 text-xs font-bold uppercase tracking-[0.15em] transition-[filter] hover:brightness-110 sm:inline-flex"
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
        <nav className="max-h-[calc(100vh-4.5rem)] overflow-y-auto border-t border-border/60 px-5 pb-8 pt-4 xl:hidden" aria-label="Mobile">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} onClick={() => setOpen(false)} block />
              </li>
            ))}
          </ul>
          <Link to="/prebook" onClick={() => setOpen(false)} className="gold-surface mt-6 flex justify-center px-5 py-4 text-sm font-bold uppercase tracking-[0.15em]">
            Book Tickets
          </Link>
        </nav>
      )}
    </header>
  );
}

function NavLink({ href, label, onClick, block = false }: { href: string; label: string; onClick?: () => void; block?: boolean }) {
  const external = /^(https?:)?\/\//i.test(href);
  const cls = cn("transition-colors hover:text-primary", block && "block py-3 text-base font-bold uppercase tracking-[0.15em]");
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
    <footer className="mt-24 border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-4">
        <div className="md:col-span-1">
          <Brand />
          <p className="mt-4 text-sm text-muted-foreground">{footer.intro}</p>
          {links.length > 0 && (
            <p className="mt-5 flex flex-wrap gap-4 text-xs font-bold uppercase tracking-[0.2em]">
              {links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                  {l.label}
                </a>
              ))}
            </p>
          )}
        </div>

        <nav aria-label="Footer">
          <h2 className="font-sans text-xs font-bold uppercase tracking-[0.3em] text-primary">Explore</h2>
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
          <h2 className="font-sans text-xs font-bold uppercase tracking-[0.3em] text-primary">Contact</h2>
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
          <h2 className="font-sans text-xs font-bold uppercase tracking-[0.3em] text-primary">{footer.newsletterTitle}</h2>
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
