import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../cmd/server/dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split the vendor weight so editing app code doesn't invalidate the
        // cached copies of framer-motion / uplot / react. Matched by module path
        // rather than by package name: HeroUI depends on react, and the name form
        // let that shared dependency migrate into the heroui chunk, leaving
        // react-vendor empty.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (id.includes("node_modules/framer-motion")) return "motion";
          if (id.includes("node_modules/uplot")) return "chart";
          if (id.includes("node_modules/lucide-react")) return "icons";
          // HeroUI sits on react-aria / react-stately; grouping them keeps app
          // edits from invalidating ~240 kB of vendor code.
          if (/node_modules\/(@heroui|react-aria|react-stately|@react-aria|@react-stately|@react-types|react-aria-components|@internationalized|tailwind-variants|@swc)/.test(id)) {
            return "heroui";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:8080",
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
