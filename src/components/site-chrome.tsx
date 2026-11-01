import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import logoAsset from "@/assets/premxl-title.asset.json";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About Us" },
  { to: "/productions", label: "Productions" },
  { to: "/events", label: "Upcoming Events" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoAsset.url} alt="PremXL" className="h-9 w-auto" />
          <span className="hidden text-xs font-semibold tracking-[0.35em] text-muted-foreground sm:block">
            D MOJO ART
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/prebook"
            className="gold-surface rounded-full px-5 py-2 text-sm font-bold tracking-wide transition-transform hover:scale-105"
          >
            Pre-book Now
          </Link>
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-border p-2 text-muted-foreground md:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-border/60 px-5 py-3 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-card/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg tracking-widest text-foreground">D MOJO ART</p>
          <p>Films, events and stories from Assam.</p>
        </div>
        <div className="flex flex-wrap gap-5">
          <Link to="/prebook" className="hover:text-primary">
            Pre-book
          </Link>
          <Link to="/productions" className="hover:text-primary">
            Productions
          </Link>
          <Link to="/admin" className="hover:text-primary">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
