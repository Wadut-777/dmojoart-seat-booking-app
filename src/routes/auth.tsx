import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { SESSION_KEY, useSession } from "@/hooks/use-roles";
import { createFirstAdmin, signIn } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — D Mojo Art" },
      { name: "description", content: "Secure sign-in for D Mojo Art administrators." },
      { property: "og:title", content: "Admin Sign In — D Mojo Art" },
      { property: "og:description", content: "Staff access to the D Mojo Art booking dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  // Until the first account exists, this page creates the administrator.
  const setup = session.data?.setupRequired ?? false;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      if (setup) await createFirstAdmin({ data: { email, password } });
      else await signIn({ data: { email, password } });
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-surface flex min-h-[80vh] items-center justify-center px-5 py-16">
      <form onSubmit={submit} className="panel w-full max-w-md space-y-4 p-8">
        <h1 className="text-3xl">{setup ? "Create the administrator account" : "Admin sign in"}</h1>
        <p className="text-sm text-muted-foreground">
          {setup
            ? "No accounts exist yet. The account you create here becomes the administrator."
            : "Restricted to D Mojo Art staff. Bookings and hall data are only visible to administrators."}
        </p>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-3"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-3"
        />
        <button
          type="submit"
          disabled={busy}
          className="gold-surface w-full rounded-full px-6 py-3 font-bold disabled:opacity-60"
        >
          {busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}
        </button>
        {!setup && (
          <p className="text-center text-xs text-muted-foreground">
            Need access? Ask an administrator to create your account.
          </p>
        )}
      </form>
    </div>
  );
}
