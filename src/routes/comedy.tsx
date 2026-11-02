import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/comedy")(cmsRoute("comedy", "/comedy", "Stand-up Comedy — D Mojo Art"));
