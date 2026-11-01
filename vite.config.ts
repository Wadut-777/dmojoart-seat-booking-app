import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => {
  // Make .env values (DATABASE_URL, STORAGE_DIR, …) visible to server code in `vite dev`.
  // In production, `npm start` loads .env via `node --env-file`.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }

  return {
    server: { host: true, port: 3000 },
    plugins: [
      tsConfigPaths(),
      // Redirects the bundled server entry to src/server.ts (our SSR error wrapper).
      tanstackStart({ server: { entry: "server" } }),
      viteReact(),
      tailwindcss(),
      // Builds a standalone Node server into .output/ (run with `npm start`).
      nitro(),
    ],
    optimizeDeps: { include: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"] },
  };
});
