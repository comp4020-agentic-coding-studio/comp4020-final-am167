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
    // Three.js is its own chunk, shared by the launchpad's scene and the
    // sky's: about 570 kB minified, 140 kB gzipped. Both pages load it after
    // they already work (src/pages/index.astro, src/scripts/sky.ts), so the
    // default 500 kB warning doesn't apply.
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: { output: { manualChunks: (id) => (id.includes("/node_modules/three/") ? "three" : undefined) } },
    },
  },
});
