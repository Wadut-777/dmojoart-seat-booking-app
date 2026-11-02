import type { QueryClient } from "@tanstack/react-query";

import { CmsPage, cmsHead, loadCmsPage } from "@/components/cms/page";
import type { CmsPage as CmsPageMeta } from "@/lib/cms.functions";

/**
 * Shared options for every CMS-managed route. Each route file is a one-liner:
 *   export const Route = createFileRoute("/music")(cmsRoute("music", "/music", "Music & Live Shows"));
 */
export function cmsRoute(slug: string, path: string, fallbackTitle: string) {
  return {
    loader: async ({ context }: { context: { queryClient: QueryClient } }): Promise<{ meta: CmsPageMeta | null }> => ({
      meta: await loadCmsPage(context.queryClient, slug),
    }),
    head: ({ loaderData }: { loaderData?: { meta: CmsPageMeta | null } | undefined }) => cmsHead(loaderData?.meta, fallbackTitle, path),
    component: () => <CmsPage slug={slug} />,
  };
}
