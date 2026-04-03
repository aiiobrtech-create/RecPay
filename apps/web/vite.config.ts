import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** PostCSS com autoprefixer; estilos do app em `styles.css` (sem Tailwind). */
export default defineConfig({
  plugins: [react()],
  envDir: monorepoRoot,
  css: {
    postcss: {
      plugins: [autoprefixer()],
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
