import { sql } from "@/server/db.server";

export type PageNode = { slug: string; title: string; parentSlug: string | null; position: number; isCustom: boolean; isPublished: boolean; updatedAt: string };

/** URL segments that belong to the app itself and can never be used by an admin-created page. */
export const RESERVED_SLUGS = new Set([
  "home", "admin", "auth", "api", "media", "prebook", "events", "productions", "sitemap", "robots", "assets", "_serverFn",
]);

/** Deepest allowed nesting: /a/b/c. */
export const MAX_DEPTH = 3;

export async function loadPageNodes(): Promise<PageNode[]> {
  const rows = await sql<
    { slug: string; title: string; parent_slug: string | null; position: number; is_custom: number; is_published: number; updated_at: string }[]
  >`SELECT slug, title, parent_slug, position, is_custom, is_published, updated_at FROM cms_pages ORDER BY position, title`;
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    parentSlug: r.parent_slug,
    position: Number(r.position),
    isCustom: !!r.is_custom,
    isPublished: !!r.is_published,
    updatedAt: String(r.updated_at),
  }));
}

/** Public path of a page: "/" for home, "/music", "/music/live-shows". Returns null if the parent chain is broken. */
export function pathOf(nodes: PageNode[], slug: string): string | null {
  if (slug === "home") return "/";
  const by = new Map(nodes.map((n) => [n.slug, n]));
  const parts: string[] = [];
  let cur = by.get(slug);
  for (let i = 0; cur && i <= MAX_DEPTH + 1; i++) {
    parts.unshift(cur.slug);
    if (!cur.parentSlug) return "/" + parts.join("/");
    cur = by.get(cur.parentSlug);
  }
  return null;
}

/** How many levels deep a page sits (1 = top level). */
export function depthOf(nodes: PageNode[], slug: string): number {
  const by = new Map(nodes.map((n) => [n.slug, n]));
  let depth = 0;
  for (let cur = by.get(slug); cur && depth < 20; cur = cur.parentSlug ? by.get(cur.parentSlug) : undefined) depth++;
  return depth;
}

export function descendantsOf(nodes: PageNode[], slug: string): Set<string> {
  const out = new Set<string>();
  const walk = (s: string) => {
    for (const n of nodes) if (n.parentSlug === s && !out.has(n.slug)) (out.add(n.slug), walk(n.slug));
  };
  walk(slug);
  return out;
}
