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
});
