import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/music-production")(cmsRoute("music-production", "/music-production", "Music Production — D Mojo Art"));
