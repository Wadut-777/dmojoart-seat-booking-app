import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { PageBlocks } from "@/components/page-blocks";
import { ORIGIN_KEY, SETTINGS_KEY, absoluteMedia, mergeSettings, useSiteSettings } from "@/components/cms/data";
import { getSiteOrigin, getSiteSettings } from "@/lib/cms.functions";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: import("@tanstack/react-router").ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Brand settings are editable in the admin; load them once so the first render (and <head>) already use them.
  loader: async ({ context }) => {
    const [raw, origin] = await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: SETTINGS_KEY, queryFn: () => getSiteSettings() }),
      context.queryClient.ensureQueryData({ queryKey: ORIGIN_KEY, queryFn: () => getSiteOrigin() }),
    ]);
    return { settings: mergeSettings(raw), origin };
  },
  head: ({ loaderData }) => {
    const brand = loaderData?.settings.brand.name ?? "D Mojo Art";
    const token = loaderData?.settings.analytics.searchConsoleToken ?? "";
    // Organization structured data, built from the editable brand/contact/social settings.
    const origin = loaderData?.origin ?? "";
    const st = loaderData?.settings;
    const org = st
      ? {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: st.brand.name,
          url: origin || undefined,
          logo: absoluteMedia(origin, st.brand.logo) ?? undefined,
          email: st.contact.email || undefined,
          telephone: st.contact.phone || undefined,
          sameAs: st.social.map((x) => x.url).filter(Boolean),
        }
      : null;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: `${brand} — Concerts, Films & Live Entertainment` },
        { name: "description", content: loaderData?.settings.brand.tagline ?? "" },
        { name: "author", content: brand },
        { property: "og:site_name", content: brand },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(/^[\w-]{10,100}$/.test(token) ? [{ name: "google-site-verification", content: token }] : []),
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@400;600;800&display=swap",
        },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
      ],
      scripts: org
        ? [{ type: "application/ld+json", children: JSON.stringify(org).replace(/</g, "\\u003c") }]
        : [],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Pages whose body is still the older page builder. "/" and "/about" now use the new CMS sections.
const BUILDER_PAGES: Record<string, string> = {
  "/productions": "productions",
  "/events": "events",
  "/prebook": "prebook",
};

/** Pages that start with a full-bleed banner, so the fixed header floats over them. Others get top padding. */
const FULL_BLEED = new Set(["/", "/about", "/music", "/film", "/music-production", "/event-management", "/comedy", "/portfolio", "/contact"]);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Applies the editable colour theme and loads Google Analytics when an ID is configured. */
function ThemeAndAnalytics() {
  const { theme, analytics } = useSiteSettings();
  const css = [
    HEX.test(theme.accent) && `--primary:${theme.accent};--ring:${theme.accent};--gold:${theme.accent};--sidebar-primary:${theme.accent};`,
    HEX.test(theme.accent) && HEX.test(theme.accentSoft) && `--gradient-gold:linear-gradient(100deg,${theme.accentSoft},${theme.accent});`,
    HEX.test(theme.background) && `--background:${theme.background};`,
    HEX.test(theme.surface) && `--card:${theme.surface};--popover:${theme.surface};`,
  ]
    .filter(Boolean)
    .join("");

  useEffect(() => {
    const id = analytics.gaId;
    if (!/^G-[A-Z0-9]{4,20}$/.test(id) || document.getElementById("ga-script")) return;
    const script = document.createElement("script");
    script.id = "ga-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer ?? [];
    const gtag = (...args: unknown[]) => w.dataLayer?.push(args);
    gtag("js", new Date());
    gtag("config", id);
  }, [analytics.gaId]);

  return css ? <style dangerouslySetInnerHTML={{ __html: `:root{${css}}` }} /> : null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const builderPage = BUILDER_PAGES[pathname];
  const fullBleed = FULL_BLEED.has(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeAndAnalytics />
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className={fullBleed ? "flex-1" : "flex-1 pt-20"}>
          {/* Required: nested routes render here. */}
          <Outlet />
          {builderPage && <PageBlocks key={builderPage} page={builderPage} />}
        </main>
        <SiteFooter />
      </div>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
