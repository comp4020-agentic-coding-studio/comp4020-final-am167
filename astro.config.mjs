import node from "@astrojs/node";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: { host: "0.0.0.0", port: Number(process.env.PORT ?? 8080) },
  security: {
    // Fly's proxy terminates TLS, so the app sees http while the browser's
    // Origin says https. Trusting the forwarded protocol for these hosts lets
    // Astro's same-origin check on form posts compare like with like.
    allowedDomains: [{ hostname: "*.fly.dev" }, { hostname: "localhost" }, { hostname: "127.0.0.1" }],
  },
  vite: {
    // The sky's scene chunk is Three.js plus the baked coastlines: about
    // 650 kB minified, 185 kB gzipped. It loads after the page already works
    // (src/scripts/sky.ts), so the default 500 kB warning doesn't apply.
    build: { chunkSizeWarningLimit: 800 },
  },
});
