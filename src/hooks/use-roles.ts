import { useQuery } from "@tanstack/react-query";

import { getSession } from "@/lib/auth.functions";

export const SESSION_KEY = ["session"] as const;

/** Current sign-in state (user, roles, whether first-time setup is still pending). */
export function useSession() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: () => getSession(), staleTime: 30_000 });
}

/** Roles of the signed-in user (empty when signed out). */
export function useRoles(): string[] {
  return useSession().data?.roles ?? [];
}

export function canEditPages(roles: string[]) {
  return roles.includes("admin") || roles.includes("editor");
}
