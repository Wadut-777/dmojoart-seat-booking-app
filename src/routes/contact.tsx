import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/contact")(cmsRoute("contact", "/contact", "Contact Us — D Mojo Art"));
