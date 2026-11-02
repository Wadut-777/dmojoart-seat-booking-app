import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/event-management")(cmsRoute("event-management", "/event-management", "Event Management — D Mojo Art"));
