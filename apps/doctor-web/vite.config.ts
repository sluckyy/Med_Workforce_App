import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA-first doctor client per docs/spec/01-technical-architecture-data-model-v0.2.docx
// ADR-009. Native app remains an implementation choice, not a domain
// dependency (same doc, §2, §21).
export default defineConfig({
  server: { port: 5173 },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Medical Workforce Passport",
        short_name: "Passport",
        start_url: "/",
        display: "standalone",
      },
    }),
  ],
});
