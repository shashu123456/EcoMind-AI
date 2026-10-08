import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Real build stamp (date the bundle was produced), rendered in the sign-in
  // footer. A hardcoded version number is a fabricated value.
  define: {
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    // FastAPI serves frontend/dist (index.html + assets/), so the SPA must
    // land directly there -- not in a nested dist/public.
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Vendor chunks: the shell renders before these are parsed, and they
        // change far less often than application code.
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
  server: {
    host: true,
    // Dev server proxies the API to FastAPI so /api/v1 works in development.
    proxy: {
      "/api": {
        target: process.env.ECOMIND_API_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
