import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { createStaff, deleteStaff, listStaff, setStaffRole, STAFF_ROLES } from "@/lib/staff.functions";

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin — full access",
  editor: "Editor — pages & events",
  booking_manager: "Booking manager — bookings & tickets",
  executive: "Executive — own bookings only",
};

const input = "rounded-lg border border-input bg-background px-3 py-2 text-sm";

export function StaffManager({ executives }: { executives: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const list = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const setRole = useServerFn(setStaffRole);
  const remove = useServerFn(deleteStaff);
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => list() });
  const [form, setForm] = useState({ email: "", password: "", role: "editor", executiveId: "" });
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({
        data: {
          email: form.email,
          password: form.password,
          role: form.role as (typeof STAFF_ROLES)[number],
          executiveId: form.role === "executive" ? form.executiveId || undefined : undefined,
        },
      });
      toast.success("User created. Share the email and password with them.");
      setForm({ email: "", password: "", role: "editor", executiveId: "" });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-6 md:p-8">
      <h2 className="text-2xl">Users &amp; roles</h2>
      <form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        <input required minLength={8} type="text" placeholder="Temporary password (8+)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <button disabled={busy} className="gold-surface rounded-full px-5 py-2 text-sm font-bold disabled:opacity-50">
          {busy ? "Creating…" : "Add user"}
        </button>
        {form.role === "executive" && (
          <select required value={form.executiveId} onChange={(e) => setForm({ ...form, executiveId: e.target.value })} className={`${input} md:col-span-2`}>
            <option value="">Link to which executive?</option>
            {executives.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        )}
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Executive</th><th /></tr>
          </thead>
          <tbody>
            {(staff.data ?? []).map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="py-3 pr-4">{u.email}{u.isSelf && " (you)"}</td>
                <td className="py-3 pr-4">
                  <select
                    disabled={u.isSelf}
                    value={u.roles[0] ?? ""}
                    onChange={async (e) => {
                      try {
                        await setRole({ data: { userId: u.id, role: e.target.value as (typeof STAFF_ROLES)[number] } });
                        toast.success("Role updated.");
                        refresh();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not change role.");
                      }
                    }}
                    className={input}
                  >
                    <option value="" disabled>No role</option>
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </td>
                <td className="py-3 pr-4">{u.executiveName ?? "—"}</td>
                <td className="py-3">
                  {!u.isSelf && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Delete user ${u.email}?`)) return;
                        try {
                          await remove({ data: { userId: u.id } });
                          toast.success("User deleted.");
                          refresh();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not delete user.");
                        }
                      }}
                      className="rounded-full border border-destructive px-4 py-1.5 text-xs font-bold text-destructive"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {staff.isLoading && <p className="py-4 text-muted-foreground">Loading users…</p>}
      </div>
    </section>
  );
}
