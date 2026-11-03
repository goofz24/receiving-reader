import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the web page runs on Vite (port 5173) and sends /api calls
// to the small back end on port 8787, which holds the API key.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
