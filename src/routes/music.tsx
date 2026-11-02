import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/music")(cmsRoute("music", "/music", "Music & Live Shows — D Mojo Art"));
