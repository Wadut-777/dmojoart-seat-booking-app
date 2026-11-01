import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const EDITORS = ["admin", "editor"] as const;

/* ───────────── inline-editable text ───────────── */

export const getSiteContent = createServerFn({ method: "GET" }).handler(async (): Promise<Record<string, string>> => {
  const { sql } = await import("@/server/db.server");
  const rows = await sql<{ content_key: string; content_value: string }[]>`
    SELECT content_key, content_value FROM site_content`;
  return Object.fromEntries(rows.map((r) => [r.content_key, r.content_value]));
});

export const saveSiteContent = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ key: z.string().min(1).max(200), value: z.string().max(20_000) }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    await requireUser(EDITORS);
    await exec`
      INSERT INTO site_content (content_key, content_value) VALUES (${data.key}, ${data.value})
      ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), updated_at = UTC_TIMESTAMP(3)`;
    return { ok: true };
  });

/* ───────────── page builder ───────────── */

export type PageBlockRow = {
  id: string;
  page: string;
  position: number;
  block_type: string;
  data: Record<string, unknown>;
};

const blockData = z
  .record(z.string(), z.unknown())
  .refine((d) => JSON.stringify(d).length < 500_000, "Block is too large");

/** Editors (draft=true) see the working draft; everyone else sees only published content. */
export const listPageBlocks = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ page: z.string().min(1).max(100), draft: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<PageBlockRow[]> => {
    const { getSessionUser, hasAnyRole } = await import("@/server/auth.server");
    const { sql } = await import("@/server/db.server");
    const user = data.draft ? await getSessionUser() : null;
    // `data` is stored as JSON text; parse it here.
    const parse = (rows: (Omit<PageBlockRow, "data"> & { data: string })[]): PageBlockRow[] =>
      rows.map((r) => ({ ...r, data: JSON.parse(r.data) as Record<string, unknown> }));
    if (data.draft && hasAnyRole(user, EDITORS)) {
      return parse(await sql`
        SELECT id, page, position, block_type, data FROM page_blocks
        WHERE page = ${data.page} AND draft_deleted = 0 ORDER BY position`);
    }
    return parse(await sql`
      SELECT id, page, published_position AS position, block_type, published_data AS data FROM page_blocks
      WHERE page = ${data.page} AND published_data IS NOT NULL AND published_position IS NOT NULL
      ORDER BY published_position`);
  });

export const addPageBlock = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        page: z.string().min(1).max(100),
        block_type: z.string().min(1).max(50),
        position: z.number().int().min(0).max(100_000),
        data: blockData,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec, uuid } = await import("@/server/db.server");
    await requireUser(EDITORS);
    await exec`INSERT INTO page_blocks (id, page, block_type, position, data)
               VALUES (${uuid()}, ${data.page}, ${data.block_type}, ${data.position}, ${JSON.stringify(data.data)})`;
    return { ok: true };
  });

export const updatePageBlock = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), data: blockData }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    await requireUser(EDITORS);
    await exec`UPDATE page_blocks SET data = ${JSON.stringify(data.data)}, updated_at = UTC_TIMESTAMP(3) WHERE id = ${data.id}`;
    return { ok: true };
  });

/** Soft delete: the block disappears from the draft and is removed for good on the next publish. */
export const deletePageBlock = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    await requireUser(EDITORS);
    await exec`UPDATE page_blocks SET draft_deleted = 1 WHERE id = ${data.id}`;
    return { ok: true };
  });

export const reorderPageBlocks = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0).max(100_000) })).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction } = await import("@/server/db.server");
    await requireUser(EDITORS);
    await transaction(async (tx) => {
      for (const it of data.items) await tx.exec`UPDATE page_blocks SET position = ${it.position} WHERE id = ${it.id}`;
    });
    return { ok: true };
  });

export const publishPage = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ page: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction } = await import("@/server/db.server");
    await requireUser(EDITORS);
    await transaction(async (tx) => {
      await tx.exec`DELETE FROM page_blocks WHERE page = ${data.page} AND draft_deleted = 1`;
      await tx.exec`UPDATE page_blocks
                    SET published_data = data, published_position = position,
                        published_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
                    WHERE page = ${data.page}`;
    });
    return { ok: true };
  });
