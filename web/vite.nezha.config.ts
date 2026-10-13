import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(__dirname, "./src/themes/nezha-live"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "../themes/nezha-live/dist"),
    emptyOutDir: true,
    rollupOptions: {
      external: [/^three(\/.*)?$/],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
