import { getRequestHeader } from "@tanstack/react-start/server";

type Headers = { get(name: string): string | null };

function originFrom(get: (name: string) => string | null | undefined): string {
  // PUBLIC_BASE_URL (set in production) always wins, so a forged Host header can never change the sitemap.
  const env = process.env["PUBLIC_BASE_URL"]?.trim().replace(/\/+$/, "");
  if (env && /^https?:\/\//i.test(env)) return env;
  const host = (get("x-forwarded-host") ?? get("host") ?? "localhost:3000").split(",")[0]!.trim();
  const proto = (get("x-forwarded-proto") ?? "http").split(",")[0]!.trim();
  return `${proto === "https" ? "https" : "http"}://${host}`;
}

/** Public address of the site, for use inside a server function. */
export const siteOrigin = (): string => originFrom((n) => getRequestHeader(n));

/** Public address of the site, for use inside a raw route handler. */
export const siteOriginFor = (headers: Headers): string => originFrom((n) => headers.get(n));

export const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
