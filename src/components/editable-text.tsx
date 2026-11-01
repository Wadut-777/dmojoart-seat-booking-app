import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { canEditPages, useRoles } from "@/hooks/use-roles";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { getSiteContent, saveSiteContent } from "@/lib/content.functions";

function useSiteContent() {
  return useQuery({
    queryKey: ["site-content"],
    queryFn: () => getSiteContent(),
    staleTime: 60_000,
  });
}

/** True for admins and editors — anyone allowed to edit page content. */
export function useIsAdmin(): boolean {
  return canEditPages(useRoles());
}

/** Text that admins can edit in place. Everyone else sees saved text or the default. */
export function EditableText({
  id,
  children,
  multiline = false,
}: {
  id: string;
  children: string;
  multiline?: boolean;
}) {
  const content = useSiteContent();
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const value = content.data?.[id] ?? children;

  async function save() {
    try {
      await saveSiteContent({ data: { key: id, value: draft } });
    } catch {
      toast.error("Could not save text.");
      return;
    }
    toast.success("Page updated.");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["site-content"] });
  }

  if (editing) {
    return (
      <span className="block space-y-2 text-base font-normal normal-case tracking-normal">
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"
          />
        )}
        <span className="flex gap-2">
          <button type="button" onClick={save} className="gold-surface rounded-full px-4 py-1 text-xs font-bold">
            Save
          </button>
          <button
            type="button"
            onClick={() => setDraft(children)}
            className="rounded-full border border-border px-4 py-1 text-xs font-bold text-foreground"
          >
            Reset to original
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-border px-4 py-1 text-xs font-bold text-foreground"
          >
            Cancel
          </button>
        </span>
      </span>
    );
  }

  return (
    <>
      {value}
      {isAdmin && (
        <button
          type="button"
          aria-label="Edit text"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="ml-2 inline-flex translate-y-[-2px] items-center rounded-full border border-primary p-1 align-middle text-primary"
        >
          <Pencil className="size-3" />
        </button>
      )}
    </>
  );
}
