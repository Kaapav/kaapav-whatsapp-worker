import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
<<<<<<< HEAD
    host: true,
    port: 5173,
    strictPort: true,
    open: false
=======
    host: true,             // Enables external access (same as "0.0.0.0")
    port: 5173,
    strictPort: true,
    open: false             // Avoid auto-opening browser (cleaner in server)
>>>>>>> a6f2ff63505999f05f4ba077f36fd2f57ee5ce68
  },
  preview: {
    host: true,
    port: 4173
  },
  build: {
    outDir: "dist",
<<<<<<< HEAD
    emptyOutDir: true
=======
    emptyOutDir: true,      // Cleans output dir before build
>>>>>>> a6f2ff63505999f05f4ba077f36fd2f57ee5ce68
  }
});
