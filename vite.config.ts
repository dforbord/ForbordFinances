import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Fixed port on both dev and preview so your saved data (browser localStorage,
  // which is per-origin) always lives at http://localhost:5180 and persists.
  // open is handled by Budget.command so it can prefer Chrome (needed for the
  // save-to-file feature, which Safari/Firefox don't support).
  server: { port: 5180, strictPort: true, open: false },
  preview: { port: 5180, strictPort: true, open: false },
});
