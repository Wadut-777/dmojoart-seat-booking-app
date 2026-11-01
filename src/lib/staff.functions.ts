import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const STAFF_ROLES = ["admin", "editor", "booking_manager", "executive"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffMember = {
  id: string;
  email: string;
  createdAt: string;
  roles: string[];
  executiveName: string | null;
  isSelf: boolean;
};

export const listStaff = createServerFn({ method: "GET" }).handler(async (): Promise<StaffMember[]> => {
  const { requireUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  const me = await requireUser(["admin"]);
  const users = await sql<{ id: string; email: string; created_at: string }[]>`
    SELECT id, email, created_at FROM users ORDER BY created_at`;
  const roles = await sql<{ user_id: string; role: string }[]>`SELECT user_id, role FROM user_roles`;
  const execs = await sql<{ user_id: string; name: string }[]>`
    SELECT user_id, name FROM executives WHERE user_id IS NOT NULL`;
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    createdAt: u.created_at,
    roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role),
    executiveName: execs.find((x) => x.user_id === u.id)?.name ?? null,
    isSelf: u.id === me.id,
  }));
});

export const createStaff = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(72),
        role: z.enum(STAFF_ROLES),
        executiveId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser, hashPassword } = await import("@/server/auth.server");
    const { transaction, uuid, isDuplicate } = await import("@/server/db.server");
    await requireUser(["admin"]);
    if (data.role === "executive" && !data.executiveId) throw new Error("Pick which executive this login belongs to.");

    try {
      return await transaction(async (tx) => {
        const id = uuid();
        await tx.exec`INSERT INTO users (id, email, password_hash)
                      VALUES (${id}, ${data.email}, ${hashPassword(data.password)})`;
        await tx.exec`INSERT INTO user_roles (id, user_id, role) VALUES (${uuid()}, ${id}, ${data.role})`;
        if (data.role === "executive" && data.executiveId) {
          await tx.exec`UPDATE executives SET user_id = ${id} WHERE id = ${data.executiveId}`;
        }
        return { id };
      });
    } catch (e) {
      if (isDuplicate(e)) throw new Error("A user with that email (or that executive) already has a login.");
      throw new Error("Could not create the user");
    }
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ userId: z.string().uuid(), role: z.enum(STAFF_ROLES) }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { transaction, uuid } = await import("@/server/db.server");
    const me = await requireUser(["admin"]);
    if (data.userId === me.id) throw new Error("You can't change your own role.");
    await transaction(async (tx) => {
      await tx.exec`DELETE FROM user_roles WHERE user_id = ${data.userId}`;
      await tx.exec`INSERT INTO user_roles (id, user_id, role) VALUES (${uuid()}, ${data.userId}, ${data.role})`;
    });
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    const me = await requireUser(["admin"]);
    if (data.userId === me.id) throw new Error("You can't delete your own account.");
    // user_roles and sessions cascade; executives.user_id is set to null.
    await exec`DELETE FROM users WHERE id = ${data.userId}`;
    return { ok: true };
  });
