import { useQuery } from "@tanstack/react-query";

import { getSiteOrigin, listCollection, getSiteSettings, type CmsItem } from "@/lib/cms.functions";
import type { CollectionName, SiteSettings } from "@/lib/cms-schema";
import { listPublicEvents, type PublicEvent } from "@/lib/events.functions";

export const SETTINGS_KEY = ["site-settings"] as const;
export const collectionKey = (name: CollectionName) => ["cms-collection", name] as const;
export const EVENTS_KEY = ["public-events"] as const;
export const ORIGIN_KEY = ["site-origin"] as const;

const STALE = 60_000;

/** Fallback so the chrome still renders if settings could not be loaded. */
export const FALLBACK_SETTINGS: SiteSettings = {
  brand: { name: "D Mojo Art", tagline: "", logo: "", logoText: "D MOJO ART" },
  theme: { accent: "#92b0f4", accentSoft: "#a9c2f9", highlight: "#f26b3a", background: "#14161b", surface: "#1e2128" },
  nav: [
    { label: "Home", href: "/", enabled: true },
    { label: "Events", href: "/events", enabled: true },
    { label: "Contact", href: "/contact", enabled: true },
  ],
  footer: { intro: "", copyright: "© D Mojo Art", newsletterTitle: "Stay in the loop", newsletterText: "" },
  social: [],
  contact: { email: "", phone: "", address: "", hours: "", mapEmbedUrl: "" },
  analytics: { gaId: "", searchConsoleToken: "" },
};

/** Merges saved settings over the fallback, one level deep, so a missing key never crashes the page. */
export function mergeSettings(raw: Record<string, unknown> | undefined | null): SiteSettings {
  const base = FALLBACK_SETTINGS;
  const pick = <K extends keyof SiteSettings>(key: K): SiteSettings[K] => {
    const v = raw?.[key];
    if (Array.isArray(base[key])) return (Array.isArray(v) ? v : base[key]) as SiteSettings[K];
    if (v !== null && typeof v === "object") return { ...(base[key] as object), ...(v as object) } as SiteSettings[K];
    return base[key];
  };
  return {
    brand: pick("brand"),
    theme: pick("theme"),
    nav: pick("nav"),
    footer: pick("footer"),
    social: pick("social"),
    contact: pick("contact"),
    analytics: pick("analytics"),
  };
}

export function useSiteSettings(): SiteSettings {
  const q = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => getSiteSettings(), staleTime: STALE });
  return mergeSettings(q.data);
}

export function useCollection(name: CollectionName): CmsItem[] {
  const q = useQuery({ queryKey: collectionKey(name), queryFn: () => listCollection({ data: { collection: name } }), staleTime: STALE });
  return q.data ?? [];
}

export function usePublicEvents(): PublicEvent[] {
  const q = useQuery({ queryKey: EVENTS_KEY, queryFn: () => listPublicEvents(), staleTime: STALE });
  return q.data ?? [];
}

/** Public address of the site (prefetched by the root route, so it is available during server rendering). */
export function useOrigin(): string {
  const q = useQuery({ queryKey: ORIGIN_KEY, queryFn: () => getSiteOrigin(), staleTime: Infinity });
  return q.data ?? "";
}

/** Absolute URL for a stored image path or URL. */
export function absoluteMedia(origin: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin}/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
