import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // PWA: manifest (ikona, nazwa na ekranie głównym) + service worker (szybsze ładowanie)
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Przepisy",
        short_name: "Przepisy",
        description: "Moje przepisy",
        lang: "pl",
        start_url: "/",
        display: "standalone",
        background_color: "#fffaf5",
        theme_color: "#e8692c",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Android: aplikacja pojawia się w menu "Udostępnij" (iPhone tego nie obsługuje)
        share_target: {
          action: "/dodaj",
          method: "GET",
          params: { title: "title", text: "text", url: "url" },
        },
      },
      workbox: {
        // Adresy API i obrazków zawsze idą do serwera, nie do index.html
        navigateFallbackDenylist: [/^\/api/, /^\/media/, /^\/docs/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/media/"),
            handler: "CacheFirst",
            options: { cacheName: "obrazki", expiration: { maxEntries: 500 } },
          },
        ],
      },
    }),
  ],
  server: {
    // W trybie deweloperskim (npm run dev) zapytania do API idą do backendu na porcie 8000
    proxy: {
      "/api": "http://localhost:8000",
      "/media": "http://localhost:8000",
    },
  },
});
