import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { EditorContext, type EditorApi } from "@/components/cms/context";
import { collectionKey, EVENTS_KEY, SETTINGS_KEY } from "@/components/cms/data";
import { PageEditor, RenderBlock, type EditableBlock } from "@/components/cms/editor";
import { needsFor } from "@/lib/cms-blocks";
import { getCmsPage, getSiteSettings, listCollection, type CmsPage as CmsPageMeta } from "@/lib/cms.functions";
import { listPageBlocks, updatePageBlock } from "@/lib/content.functions";
import { listPublicEvents } from "@/lib/events.functions";
import { canEditPages, useRoles } from "@/hooks/use-roles";
import { setPath } from "@/lib/cms-blocks";

export const pageKey = (slug: string) => `cms:${slug}`;
const blocksKey = (slug: string, draft: boolean) => ["cms-blocks", pageKey(slug), draft] as const;

/** Route loader: fetches everything the page needs so the first (server-rendered) paint has real content. */
export async function loadCmsPage(queryClient: QueryClient, slug: string): Promise<CmsPageMeta | null> {
  const page = pageKey(slug);
  const [meta, blocks] = await Promise.all([
    getCmsPage({ data: { slug } }),
    queryClient.ensureQueryData({ queryKey: blocksKey(slug, false), queryFn: () => listPageBlocks({ data: { page, draft: false } }) }),
    queryClient.ensureQueryData({ queryKey: SETTINGS_KEY, queryFn: () => getSiteSettings() }),
  ]);
  const { collections, events } = needsFor(blocks.map((b) => b.block_type));
  await Promise.all([
    ...collections.map((c) =>
      queryClient.ensureQueryData({ queryKey: collectionKey(c), queryFn: () => listCollection({ data: { collection: c } }) }),
    ),
    events ? queryClient.ensureQueryData({ queryKey: EVENTS_KEY, queryFn: () => listPublicEvents() }) : Promise.resolve(null),
  ]);
  return meta;
}

/** <head> tags for a CMS page, from the editable page settings. */
export function cmsHead(meta: CmsPageMeta | null | undefined, fallbackTitle: string, path: string) {
  const title = meta?.metaTitle || meta?.title || fallbackTitle;
  const description = meta?.metaDescription ?? "";
  const image = meta?.ogImage ?? "";
  const imageUrl = image ? (/^https?:\/\//i.test(image) ? image : `/media/${image}`) : "";
  return {
    meta: [
      { title },
      ...(description ? [{ name: "description", content: description }] : []),
      { property: "og:title", content: title },
      ...(description ? [{ property: "og:description", content: description }] : []),
      { property: "og:type", content: "website" },
      ...(imageUrl ? [{ property: "og:image", content: imageUrl }] : []),
      { name: "twitter:card", content: imageUrl ? "summary_large_image" : "summary" },
    ],
    links: [{ rel: "canonical", href: path }],
  };
}

export function CmsPage({ slug }: { slug: string }) {
  const page = pageKey(slug);
  const qc = useQueryClient();
  const roles = useRoles();
  const canEdit = canEditPages(roles);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // Visitors read the published copy; signed-in editors read the working draft.
  const published = useQuery({
    queryKey: blocksKey(slug, false),
    queryFn: () => listPageBlocks({ data: { page, draft: false } }),
    staleTime: 30_000,
  });
  const draft = useQuery({
    queryKey: blocksKey(slug, true),
    queryFn: () => listPageBlocks({ data: { page, draft: true } }),
    enabled: canEdit,
    staleTime: 0,
  });

  const editing = canEdit && !!draft.data;
  const blocks: EditableBlock[] = (editing ? draft.data : published.data) ?? [];

  const setBlocks = (next: EditableBlock[]) => qc.setQueryData(blocksKey(slug, true), next);

  const api: EditorApi = {
    mode: editing ? mode : "off",
    editing: editing && mode === "edit",
    updateField: (id, path, value) => {
      const block = blocks.find((b) => b.id === id);
      if (!block) return;
      const data = setPath(block.data, path, value);
      setBlocks(blocks.map((b) => (b.id === id ? { ...b, data } : b)));
      void updatePageBlock({ data: { id, data } });
    },
  };

  return (
    <EditorContext.Provider value={api}>
      {editing ? (
        // Queries for the editor's draft are keyed separately, so the editor can invalidate by prefix.
        <PageEditor page={page} blocks={blocks} setBlocks={setBlocks} mode={mode} setMode={setMode}>
          <div className="h-24" aria-hidden="true" />
        </PageEditor>
      ) : (
        blocks.map((b) => <RenderBlock key={b.id} block={b} />)
      )}
      {!editing && blocks.length === 0 && !published.isLoading && (
        <section className="mx-auto max-w-3xl px-5 py-40 text-center">
          <p className="text-muted-foreground">This page has no content yet.</p>
        </section>
      )}
    </EditorContext.Provider>
  );
}
