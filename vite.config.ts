import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // dither-kit reads process.env.NODE_ENV for its dev-only warnings
  define: { "process.env.NODE_ENV": JSON.stringify(mode) },
}));
