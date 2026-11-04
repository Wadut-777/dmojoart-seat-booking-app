import type { QueryClient } from "@tanstack/react-query";

import { CmsPage, cmsHead, loadCmsPage } from "@/components/cms/page";
import { ORIGIN_KEY } from "@/components/cms/data";
import { getSiteOrigin, type CmsPage as CmsPageMeta } from "@/lib/cms.functions";

/**
 * Shared options for every CMS-managed route. Each route file is a one-liner:
 *   export const Route = createFileRoute("/music")(cmsRoute("music", "/music", "Music & Live Shows"));
 */
export function cmsRoute(slug: string, path: string, fallbackTitle: string) {
  return {
    loader: async ({ context }: { context: { queryClient: QueryClient } }): Promise<{ meta: CmsPageMeta | null; origin: string }> => {
      const [meta, origin] = await Promise.all([
        loadCmsPage(context.queryClient, slug),
        context.queryClient.ensureQueryData({ queryKey: ORIGIN_KEY, queryFn: () => getSiteOrigin() }),
      ]);
      return { meta, origin };
    },
    head: ({ loaderData }: { loaderData?: { meta: CmsPageMeta | null; origin: string } | undefined }) =>
      cmsHead(loaderData?.meta, fallbackTitle, path, loaderData?.origin ?? ""),
    component: () => <CmsPage slug={slug} />,
  };
}
