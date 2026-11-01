import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type SessionInfo = {
  user: { id: string; email: string } | null;
  roles: string[];
  /** True while no account exists yet — the first sign-up becomes the administrator. */
  setupRequired: boolean;
};

export const getSession = createServerFn({ method: "GET" }).handler(async (): Promise<SessionInfo> => {
  const { getSessionUser } = await import("@/server/auth.server");
  const { sql } = await import("@/server/db.server");
  const user = await getSessionUser();
  const [row] = await sql<{ n: number }[]>`SELECT COUNT(*) AS n FROM users`;
  return {
    user: user ? { id: user.id, email: user.email } : null,
    roles: user?.roles ?? [],
    setupRequired: Number(row?.n ?? 0) === 0,
  };
});

const credentials = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

// Hash of a throwaway password so unknown emails cost the same time as wrong passwords.
const DUMMY_HASH = `scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$${"A".repeat(86)}==`;

export const signIn = createServerFn({ method: "POST" })
  .validator((d: unknown) => credentials.parse(d))
  .handler(async ({ data }) => {
    const auth = await import("@/server/auth.server");
    const { sql } = await import("@/server/db.server");
    const key = data.email.toLowerCase();
    if (auth.loginThrottled(key)) throw new Error("Too many attempts. Try again in a few minutes.");

    const [user] = await sql<{ id: string; password_hash: string }[]>`
      SELECT id, password_hash FROM users WHERE email = ${key}`;
    const ok = auth.verifyPassword(data.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      auth.recordLoginFailure(key);
      throw new Error("Invalid email or password.");
    }
    auth.clearLoginFailures(key);
    await auth.startSession(user.id);
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { endSession } = await import("@/server/auth.server");
  await endSession();
  return { ok: true };
});

/** One-time bootstrap: creates the first administrator. Closed once any account exists. */
export const createFirstAdmin = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ email: z.string().trim().email().max(255), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await import("@/server/auth.server");
    const { transaction, uuid } = await import("@/server/db.server");
    const userId = await transaction(
      async (tx) => {
        const [row] = await tx.sql<{ n: number }[]>`SELECT COUNT(*) AS n FROM users`;
        if (Number(row?.n ?? 0) > 0) {
          throw new Error("Setup is already complete. Ask an administrator to create your account.");
        }
        const id = uuid();
        await tx.exec`INSERT INTO users (id, email, password_hash)
                      VALUES (${id}, ${data.email}, ${auth.hashPassword(data.password)})`;
        await tx.exec`INSERT INTO user_roles (id, user_id, role) VALUES (${uuid()}, ${id}, 'admin')`;
        return id;
      },
      { lock: "dmojo_first_admin" },
    );
    await auth.startSession(userId);
    return { ok: true };
  });
