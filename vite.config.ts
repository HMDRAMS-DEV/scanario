import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/oh": {
        target: "https://or.hqontario.ca",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/oh/, ""),
      },
      "/nominatim": {
        target: "https://nominatim.openstreetmap.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nominatim/, ""),
        headers: {
          Accept: "application/json",
          "Accept-Language": "en",
          "User-Agent": "OntarioWait/1.0 (+https://ramihmd.com; public wait-times tool)",
        },
      },
    },
  },
});
