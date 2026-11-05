import { createFileRoute, notFound } from "@tanstack/react-router";

import { ORIGIN_KEY } from "@/components/cms/data";
import { CmsPage, cmsHead, loadCmsPage } from "@/components/cms/page";
import { getSiteOrigin, resolveCmsPath, type CmsPage as CmsPageMeta } from "@/lib/cms.functions";

/**
 * Pages created in the admin ("Website content → Pages & SEO → Add new page"), at any nesting level,
 * e.g. /services or /music/live-shows. Built-in pages have their own route files and win over this one.
 */
export const Route = createFileRoute("/$")({
  loader: async ({ params, context }): Promise<{ meta: CmsPageMeta; origin: string }> => {
    const page = await resolveCmsPath({ data: { path: params._splat ?? "" } });
    if (!page) throw notFound();
    const [, origin] = await Promise.all([
      loadCmsPage(context.queryClient, page.slug),
      context.queryClient.ensureQueryData({ queryKey: ORIGIN_KEY, queryFn: () => getSiteOrigin() }),
    ]);
    return { meta: page, origin };
  },
  head: ({ loaderData }) => (loaderData ? cmsHead(loaderData.meta, loaderData.meta.title, loaderData.meta.path, loaderData.origin) : {}),
  component: CustomPage,
});

function CustomPage() {
  const { meta } = Route.useLoaderData();
  return <CmsPage slug={meta.slug} />;
}
