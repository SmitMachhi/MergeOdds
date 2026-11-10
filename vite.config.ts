import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The verify-merge-odds skill starts a second copy of the app with VERIFY_STATE_DIR set. That copy keeps its
// stored results and its Vite cache in that folder, so it shares nothing with the dev server next to it.
const verifyDir = process.env.VERIFY_STATE_DIR;

export default defineConfig(({ command, mode }) => {
  // A build is always for production. A shell that has NODE_ENV=development set would make Vite compile the
  // page with development JSX calls, next to the production copy of React that `define` below selects. That pair
  // crashes on load and the live page stays blank, while the API keeps working.
  if (command === "build") process.env.NODE_ENV = "production";
  return {
    plugins: [react(), tailwindcss(), cloudflare(verifyDir ? { persistState: { path: verifyDir } } : {})],
    cacheDir: verifyDir ? path.join(verifyDir, "vite") : undefined,
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    // dither-kit reads process.env.NODE_ENV for its dev-only warnings
    define: { "process.env.NODE_ENV": JSON.stringify(mode) },
  };
});
