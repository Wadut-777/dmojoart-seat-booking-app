import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/film")(cmsRoute("film", "/film", "Film & Movie Production — D Mojo Art"));
