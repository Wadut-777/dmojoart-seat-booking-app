import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/about")(cmsRoute("about", "/about", "About Us — D Mojo Art"));
