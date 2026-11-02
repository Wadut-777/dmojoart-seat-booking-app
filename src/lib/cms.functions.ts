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
};

type PageRow = {
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image: string | null;
  is_published: boolean;
};

const toPage = (r: PageRow): CmsPage => ({
  slug: r.slug,
  title: r.title,
  metaTitle: r.meta_title,
  metaDescription: r.meta_description,
  ogImage: r.og_image,
  isPublished: r.is_published,
});

export const getCmsPage = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }): Promise<CmsPage | null> => {
    const { sql } = await import("@/server/db.server");
    const [row] = await sql<PageRow[]>`
      SELECT slug, title, meta_title, meta_description, og_image, is_published
      FROM cms_pages WHERE slug = ${data.slug} AND is_published = 1`;
    return row ? toPage(row) : null;
  });

export const adminListCmsPages = createServerFn({ method: "GET" }).handler(async (): Promise<CmsPage[]> => {
  const { requireUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  await requireUser(CONTENT_ROLES);
  const rows = await sql<PageRow[]>`
    SELECT slug, title, meta_title, meta_description, og_image, is_published FROM cms_pages ORDER BY slug`;
  return rows.map(toPage);
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
      INSERT INTO cms_pages (slug, title, meta_title, meta_description, og_image, is_published)
      VALUES (${data.slug}, ${data.title}, ${data.metaTitle || null}, ${data.metaDescription || null},
              ${data.ogImage || null}, ${data.isPublished ? 1 : 0})
      ON DUPLICATE KEY UPDATE title = VALUES(title), meta_title = VALUES(meta_title),
        meta_description = VALUES(meta_description), og_image = VALUES(og_image),
        is_published = VALUES(is_published), updated_at = UTC_TIMESTAMP(3)`;
    await audit(user, "update", "page", data.slug);
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
