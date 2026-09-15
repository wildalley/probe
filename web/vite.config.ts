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
        // cached copies of framer-motion / uplot / react.
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          motion: ["framer-motion"],
          chart: ["uplot"],
          icons: ["lucide-react"],
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
