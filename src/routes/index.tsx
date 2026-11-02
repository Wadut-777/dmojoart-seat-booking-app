import { createFileRoute } from "@tanstack/react-router";

import { cmsRoute } from "@/components/cms/route";

export const Route = createFileRoute("/")(cmsRoute("home", "/", "D Mojo Art — Concerts, Films & Live Entertainment"));
