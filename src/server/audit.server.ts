import { exec, uuid } from "./db.server";

/**
 * Records an administrative change. Never throws: a failed audit write must not block the change itself,
 * but it is logged so it can be noticed.
 */
export async function audit(
  user: { id: string; email: string },
  action: string,
  entity: string,
  entityId: string | null = null,
  detail?: unknown,
): Promise<void> {
  try {
    const text = detail === undefined ? null : JSON.stringify(detail).slice(0, 2000);
    await exec`
      INSERT INTO audit_logs (id, user_id, user_email, action, entity, entity_id, detail)
      VALUES (${uuid()}, ${user.id}, ${user.email}, ${action}, ${entity}, ${entityId}, ${text})`;
  } catch (e) {
    console.error("[audit] could not record", action, entity, e instanceof Error ? e.message : e);
  }
}
