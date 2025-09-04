import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: false,
  },
  optimizeDeps: {
    include: ["socket.io-client"],
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
