import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { COLLECTION_NAMES, ENQUIRY_KINDS, SETTING_KEYS } from "@/lib/cms-schema";

/** Who may change website content (pages, settings, modules, media). */
const CONTENT_ROLES = ["admin", "editor"] as const;
/** Who may read enquiries. */
const ENQUIRY_ROLES = ["admin", "editor", "event_manager"] as const;

const jsonObject = z
  .record(z.string(), z.unknown())
  .refine((d) => JSON.stringify(d).length < 100_000, "Content is too large");

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/* ───────────── site address (canonical URLs, structured data) ───────────── */

/** Public https address of the site, e.g. https://dmojoart.com (from PUBLIC_BASE_URL, else the request). */
export const getSiteOrigin = createServerFn({ method: "GET" }).handler(async (): Promise<string> => {
  const { siteOrigin } = await import("@/server/seo.server");
  return siteOrigin();
});

/* ───────────── site settings ───────────── */

/** Public: brand, theme, navigation, footer, social links, contact details, analytics id. */
export const getSiteSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, unknown>> => {
    const { sql } = await import("@/server/db.server");
    const rows = await sql<{ setting_key: string; setting_value: string }[]>`
      SELECT setting_key, setting_value FROM site_settings`;
    return Object.fromEntries(rows.map((r) => [r.setting_key, parseJson<unknown>(r.setting_value, null)]));
  },
);

export const saveSiteSetting = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        key: z.enum(SETTING_KEYS),
        // nav and social are arrays; the rest are objects.
        value: z.union([jsonObject, z.array(z.record(z.string(), z.unknown())).max(100)]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(CONTENT_ROLES);
    const json = JSON.stringify(data.value);
    if (json.length > 100_000) throw new Error("Setting is too large");
    await exec`
      INSERT INTO site_settings (setting_key, setting_value) VALUES (${data.key}, ${json})
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = UTC_TIMESTAMP(3)`;
    await audit(user, "update", "setting", data.key);
    return { ok: true };
  });

/* ───────────── pages (SEO) ───────────── */

export type CmsPage = {
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  isPublished: boolean;
  parentSlug: string | null;
  position: number;
  isCustom: boolean;
  /** Public URL path, e.g. "/music/live-shows". */
  path: string;
};

type PageRow = {
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image: string | null;
  is_published: boolean;
};

type FullRow = PageRow & { parent_slug: string | null; position: number; is_custom: number };

async function loadPages(onlyPublished: boolean): Promise<CmsPage[]> {
  const { sql } = await import("@/server/db.server");
  const { loadPageNodes, pathOf } = await import("@/server/pages.server");
  const nodes = await loadPageNodes();
  const rows = await sql<FullRow[]>`
    SELECT slug, title, meta_title, meta_description, og_image, is_published, parent_slug, position, is_custom
    FROM cms_pages ORDER BY position, title`;
  return rows
    .filter((r) => !onlyPublished || r.is_published)
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      metaTitle: r.meta_title,
      metaDescription: r.meta_description,
      ogImage: r.og_image,
      isPublished: !!r.is_published,
      parentSlug: r.parent_slug,
      position: Number(r.position),
      isCustom: !!r.is_custom,
      path: pathOf(nodes, r.slug) ?? `/${r.slug}`,
    }));
}

export const getCmsPage = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }): Promise<CmsPage | null> => {
    const pages = await loadPages(true);
    return pages.find((p) => p.slug === data.slug) ?? null;
  });

/** Finds the page for a URL like "music/live-shows" (used by the catch-all route). Null when there is no such page. */
export const resolveCmsPath = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ path: z.string().max(400) }).parse(d))
  .handler(async ({ data }): Promise<CmsPage | null> => {
    const segments = data.path.split("/").filter(Boolean);
    if (segments.length === 0 || segments.length > 3) return null;
    const pages = await loadPages(true);
    const page = pages.find((p) => p.slug === segments[segments.length - 1]);
    if (!page || page.slug === "home") return null;
    return page.path === "/" + segments.join("/") ? page : null;
  });

export const adminListCmsPages = createServerFn({ method: "GET" }).handler(async (): Promise<CmsPage[]> => {
  const { requireUser } = await import("@/server/auth.server");
  await requireUser(CONTENT_ROLES);
  return loadPages(false);
});

export const saveCmsPage = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
        title: z.string().trim().min(1).max(200),
        metaTitle: z.string().trim().max(200),
        metaDescription: z.string().trim().max(500),
        ogImage: z.string().trim().max(500),
        isPublished: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(CONTENT_ROLES);
    await exec`
      UPDATE cms_pages SET title = ${data.title}, meta_title = ${data.metaTitle || null},
        meta_description = ${data.metaDescription || null}, og_image = ${data.ogImage || null},
        is_published = ${data.isPublished ? 1 : 0}, updated_at = UTC_TIMESTAMP(3)
      WHERE slug = ${data.slug}`;
    await audit(user, "update", "page", data.slug);
    return { ok: true };
  });

/** Creates a new page with a starter layout (banner, text, call to action), published straight away. */
export const createCmsPage = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only.").max(60),
        parentSlug: z.string().regex(/^[a-z0-9-]{1,100}$/).nullable(),
        addToMenu: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ path: string }> => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const { loadPageNodes, pathOf, depthOf, RESERVED_SLUGS, MAX_DEPTH } = await import("@/server/pages.server");
    const { defaultBlockData } = await import("@/lib/cms-blocks");
    const { randomUUID } = await import("node:crypto");
    const user = await requireUser(CONTENT_ROLES);

    const nodes = await loadPageNodes();
    if (RESERVED_SLUGS.has(data.slug)) throw new Error("That address is used by the website itself. Please choose another.");
    if (nodes.some((n) => n.slug === data.slug)) throw new Error("A page with that address already exists.");
    if (data.parentSlug) {
      if (!nodes.some((n) => n.slug === data.parentSlug)) throw new Error("The parent page was not found.");
      if (depthOf(nodes, data.parentSlug) >= MAX_DEPTH) throw new Error(`Pages can be nested ${MAX_DEPTH} levels deep at most.`);
    }
    const siblings = nodes.filter((n) => n.parentSlug === data.parentSlug);
    const position = siblings.reduce((m, n) => Math.max(m, n.position), 0) + 1;
    const path = (data.parentSlug ? (pathOf(nodes, data.parentSlug) ?? "") : "") + "/" + data.slug;

    await transaction(async (tx) => {
      await tx.exec`
        INSERT INTO cms_pages (slug, title, parent_slug, position, is_custom, is_published)
        VALUES (${data.slug}, ${data.title}, ${data.parentSlug}, ${position}, 1, 1)`;
      const layout: [string, Record<string, unknown>][] = [
        ["pagehero", { ...defaultBlockData("pagehero"), title: data.title, subtitle: "Add a short introduction to this page." }],
        ["richtext", { ...defaultBlockData("richtext"), eyebrow: "About this page", title: "Write your content here", body: "Click any text on the page to edit it, and use the section menu to add galleries, events, forms and more." }],
        ["cta", defaultBlockData("cta")],
      ];
      for (const [i, [type, block]] of layout.entries()) {
        const json = JSON.stringify(block);
        await tx.exec`
          INSERT INTO page_blocks (id, page, position, block_type, data, published_data, published_position, published_at)
          VALUES (${randomUUID()}, ${"cms:" + data.slug}, ${i}, ${type}, ${json}, ${json}, ${i}, UTC_TIMESTAMP(3))`;
      }
      if (data.addToMenu) {
        const [row] = await tx.sql<{ setting_value: string }[]>`SELECT setting_value FROM site_settings WHERE setting_key = 'nav'`;
        let nav: unknown[] = [];
        try {
          const parsed: unknown = row ? JSON.parse(row.setting_value) : [];
          if (Array.isArray(parsed)) nav = parsed;
        } catch {
          /* keep empty */
        }
        nav.push({ label: data.title, href: path, enabled: true });
        await tx.exec`
          INSERT INTO site_settings (setting_key, setting_value) VALUES ('nav', ${JSON.stringify(nav)})
          ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = UTC_TIMESTAMP(3)`;
      }
    });
    await audit(user, "create", "page", data.slug, { path });
    return { path };
  });

/** Sets the order of sibling pages (all pages with the same parent). `order` lists their slugs, first to last. */
export const reorderCmsPages = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ order: z.array(z.string().regex(/^[a-z0-9-]{1,100}$/)).min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(CONTENT_ROLES);
    await transaction(async (tx) => {
      for (const [i, slug] of data.order.entries()) {
        await tx.exec`UPDATE cms_pages SET position = ${i}, updated_at = UTC_TIMESTAMP(3) WHERE slug = ${slug}`;
      }
    });
    await audit(user, "reorder", "page", data.order.join(","));
    return { ok: true };
  });

/** Moves a page you created under another page (or back to the top level). Built-in pages keep their addresses. */
export const moveCmsPage = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ slug: z.string().regex(/^[a-z0-9-]{1,100}$/), parentSlug: z.string().regex(/^[a-z0-9-]{1,100}$/).nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ path: string }> => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const { loadPageNodes, pathOf, depthOf, descendantsOf, MAX_DEPTH } = await import("@/server/pages.server");
    const user = await requireUser(CONTENT_ROLES);

    const nodes = await loadPageNodes();
    const page = nodes.find((n) => n.slug === data.slug);
    if (!page) throw new Error("Page not found.");
    if (!page.isCustom) throw new Error("Built-in pages keep their address. You can still change their order.");
    if (data.parentSlug) {
      if (data.parentSlug === data.slug || descendantsOf(nodes, data.slug).has(data.parentSlug)) {
        throw new Error("A page cannot be placed under itself or one of its own sub-pages.");
      }
      if (!nodes.some((n) => n.slug === data.parentSlug)) throw new Error("The parent page was not found.");
      // Levels below this page + the new parent's depth must stay within the limit.
      const below = Math.max(0, ...[...descendantsOf(nodes, data.slug)].map((s) => depthOf(nodes, s) - depthOf(nodes, data.slug)));
      if (depthOf(nodes, data.parentSlug) + 1 + below > MAX_DEPTH) throw new Error(`Pages can be nested ${MAX_DEPTH} levels deep at most.`);
    }
    const position = nodes.filter((n) => n.parentSlug === data.parentSlug).reduce((m, n) => Math.max(m, n.position), 0) + 1;
    await exec`UPDATE cms_pages SET parent_slug = ${data.parentSlug}, position = ${position}, updated_at = UTC_TIMESTAMP(3) WHERE slug = ${data.slug}`;
    const after = await loadPageNodes();
    await audit(user, "move", "page", data.slug, { parent: data.parentSlug });
    return { path: pathOf(after, data.slug) ?? `/${data.slug}` };
  });

/** Deletes a page you created (not a built-in one). The page must have no sub-pages. */
export const deleteCmsPage = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ slug: z.string().regex(/^[a-z0-9-]{1,100}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const { loadPageNodes } = await import("@/server/pages.server");
    const user = await requireUser(CONTENT_ROLES);
    const nodes = await loadPageNodes();
    const page = nodes.find((n) => n.slug === data.slug);
    if (!page) throw new Error("Page not found.");
    if (!page.isCustom) throw new Error("Built-in pages cannot be deleted. Untick “Page settings are live” to hide its SEO settings instead.");
    if (nodes.some((n) => n.parentSlug === data.slug)) throw new Error("Move or delete this page's sub-pages first.");
    await transaction(async (tx) => {
      await tx.exec`DELETE FROM page_blocks WHERE page = ${"cms:" + data.slug}`;
      await tx.exec`DELETE FROM cms_pages WHERE slug = ${data.slug}`;
    });
    await audit(user, "delete", "page", data.slug);
    return { ok: true };
  });

/* ───────────── content modules (artists, movies, …) ───────────── */

export type CmsItem = {
  id: string;
  collection: string;
  position: number;
  isPublished: boolean;
  data: Record<string, unknown>;
};

type ItemRow = { id: string; collection: string; position: number; is_published: boolean; data: string };
const toItem = (r: ItemRow): CmsItem => ({
  id: r.id,
  collection: r.collection,
  position: r.position,
  isPublished: r.is_published,
  data: parseJson<Record<string, unknown>>(r.data, {}),
});

const collectionName = z.enum(COLLECTION_NAMES);

/** Public: published items of one module, in display order. */
export const listCollection = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ collection: collectionName }).parse(d))
  .handler(async ({ data }): Promise<CmsItem[]> => {
    const { sql } = await import("@/server/db.server");
    const rows = await sql<ItemRow[]>`
      SELECT id, collection, position, is_published, data FROM cms_items
      WHERE collection = ${data.collection} AND is_published = 1 ORDER BY position, created_at`;
    return rows.map(toItem);
  });

/** Admin: all items including unpublished ones. */
export const adminListCollection = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ collection: collectionName }).parse(d))
  .handler(async ({ data }): Promise<CmsItem[]> => {
    const { requireUser } = await import("@/server/auth.server");
    const { sql } = await import("@/server/db.server");
    await requireUser(CONTENT_ROLES);
    const rows = await sql<ItemRow[]>`
      SELECT id, collection, position, is_published, data FROM cms_items
      WHERE collection = ${data.collection} ORDER BY position, created_at`;
    return rows.map(toItem);
  });

export const saveCollectionItem = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        collection: collectionName,
        isPublished: z.boolean(),
        data: jsonObject,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec, sql, uuid } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(CONTENT_ROLES);
    const json = JSON.stringify(data.data);
    if (data.id) {
      const r = await exec`
        UPDATE cms_items SET data = ${json}, is_published = ${data.isPublished ? 1 : 0}, updated_at = UTC_TIMESTAMP(3)
        WHERE id = ${data.id} AND collection = ${data.collection}`;
      if (!r.affectedRows) throw new Error("Item not found");
      await audit(user, "update", data.collection, data.id);
      return { id: data.id };
    }
    const [max] = await sql<{ p: number | null }[]>`
      SELECT MAX(position) AS p FROM cms_items WHERE collection = ${data.collection}`;
    const id = uuid();
    await exec`
      INSERT INTO cms_items (id, collection, position, data, is_published)
      VALUES (${id}, ${data.collection}, ${Number(max?.p ?? -1) + 1}, ${json}, ${data.isPublished ? 1 : 0})`;
    await audit(user, "create", data.collection, id);
    return { id };
  });

export const deleteCollectionItem = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), collection: collectionName }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(CONTENT_ROLES);
    await exec`DELETE FROM cms_items WHERE id = ${data.id} AND collection = ${data.collection}`;
    await audit(user, "delete", data.collection, data.id);
    return { ok: true };
  });

export const reorderCollection = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        collection: collectionName,
        ids: z.array(z.string().uuid()).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(CONTENT_ROLES);
    await transaction(async (tx) => {
      for (const [i, id] of data.ids.entries()) {
        await tx.exec`UPDATE cms_items SET position = ${i} WHERE id = ${id} AND collection = ${data.collection}`;
      }
    });
    await audit(user, "reorder", data.collection);
    return { ok: true };
  });

/* ───────────── enquiries & newsletter (public forms) ───────────── */

const submissions = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;

/** Per-process throttle (resets on restart); the honeypot below catches most bots. */
function tooMany(key: string): boolean {
  const now = Date.now();
  const recent = (submissions.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    submissions.set(key, recent);
    return true;
  }
  recent.push(now);
  submissions.set(key, recent);
  return false;
}

export const submitEnquiry = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        kind: z.enum(ENQUIRY_KINDS),
        name: z.string().trim().max(120).optional().default(""),
        email: z.string().trim().email().max(255),
        phone: z
          .string()
          .trim()
          .regex(/^[0-9+\-\s]{7,20}$/, "Enter a valid phone number")
          .optional()
          .or(z.literal(""))
          .default(""),
        message: z.string().trim().max(4000).optional().default(""),
        extra: z.record(z.string().max(60), z.string().max(500)).optional().default({}),
        /** Honeypot: real visitors leave this empty. */
        website: z.string().max(200).optional().default(""),
      })
      .superRefine((v, ctx) => {
        if (v.kind !== "newsletter") {
          if (v.name.length < 2) ctx.addIssue({ code: "custom", path: ["name"], message: "Please enter your name" });
          if (v.message.length < 10) {
            ctx.addIssue({ code: "custom", path: ["message"], message: "Please tell us a little more (10+ characters)" });
          }
        }
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Bots fill the hidden field; pretend success so they don't retry.
    if (data.website) return { ok: true };

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { exec, uuid } = await import("@/server/db.server");
    const forwarded = getRequestHeader("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || getRequestHeader("x-real-ip") || "unknown";
    if (tooMany(`${ip}:${data.kind}`)) throw new Error("Too many submissions. Please try again in a few minutes.");

    await exec`
      INSERT INTO enquiries (id, kind, name, email, phone, message, extra)
      VALUES (${uuid()}, ${data.kind}, ${data.name || null}, ${data.email}, ${data.phone || null},
              ${data.message || null}, ${JSON.stringify(data.extra)})`;
    return { ok: true };
  });

export type AdminEnquiry = {
  id: string;
  kind: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  extra: Record<string, string>;
  status: string;
  createdAt: string;
};

export const adminListEnquiries = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ limit: z.number().int().min(1).max(500).default(200) }).parse(d ?? {}))
  .handler(async ({ data }): Promise<AdminEnquiry[]> => {
    const { requireUser } = await import("@/server/auth.server");
    const { sql } = await import("@/server/db.server");
    await requireUser(ENQUIRY_ROLES);
    const rows = await sql<
      {
        id: string;
        kind: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        message: string | null;
        extra: string | null;
        status: string;
        created_at: string;
      }[]
    >`
      SELECT id, kind, name, email, phone, message, extra, status, created_at
      FROM enquiries ORDER BY created_at DESC LIMIT ${data.limit}`;
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      email: r.email,
      phone: r.phone,
      message: r.message,
      extra: parseJson<Record<string, string>>(r.extra ?? "{}", {}),
      status: r.status,
      createdAt: r.created_at,
    }));
  });

export const setEnquiryStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["new", "in_progress", "done", "spam"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(ENQUIRY_ROLES);
    await exec`UPDATE enquiries SET status = ${data.status} WHERE id = ${data.id}`;
    await audit(user, "status", "enquiry", data.id, { status: data.status });
    return { ok: true };
  });

/* ───────────── audit log ───────────── */

export type AuditEntry = {
  id: string;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
};

export const adminListAuditLogs = createServerFn({ method: "GET" }).handler(async (): Promise<AuditEntry[]> => {
  const { requireUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  await requireUser(["admin"]);
  const rows = await sql<
    {
      id: string;
      user_email: string | null;
      action: string;
      entity: string;
      entity_id: string | null;
      detail: string | null;
      created_at: string;
    }[]
  >`SELECT id, user_email, action, entity, entity_id, detail, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 200`;
  return rows.map((r) => ({
    id: r.id,
    userEmail: r.user_email,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    detail: r.detail,
    createdAt: r.created_at,
  }));
});
