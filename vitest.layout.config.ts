import { defineConfig } from "vitest/config";

// The layout checks: real Chrome against the running app, which
// spec/global-setup.ts finds, as the spec suite does. Kept out of `pnpm check`
// because CI has no Chrome; run them with `pnpm test:layout`.
export default defineConfig({
  test: {
    include: ["layout/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
