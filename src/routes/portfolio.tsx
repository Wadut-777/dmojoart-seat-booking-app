import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/portfolio")(cmsRoute("portfolio", "/portfolio", "Portfolio & Gallery — D Mojo Art"));
