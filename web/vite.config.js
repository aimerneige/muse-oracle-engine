import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envDir: false,
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
