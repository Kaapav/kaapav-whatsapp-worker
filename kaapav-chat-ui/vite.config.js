import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,             // Enables external access (same as "0.0.0.0")
    port: 5173,
    strictPort: true,
    open: false             // Avoid auto-opening browser (cleaner in server)
  },
  preview: {
    host: true,
    port: 4173
  },
  build: {
    outDir: "dist",
    emptyOutDir: true       // Cleans output dir before build
  }
});

