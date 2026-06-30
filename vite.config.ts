import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Fixed port on both dev and preview so your saved data (browser localStorage,
  // which is per-origin) always lives at http://localhost:5180 and persists.
  server: { port: 5180, strictPort: true, open: true },
  preview: { port: 5180, strictPort: true, open: true },
});
