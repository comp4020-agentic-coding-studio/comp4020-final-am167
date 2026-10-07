import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
// `pnpm test` runs spec/fit.test.ts on its own after the rest: its headless
// Chrome would starve the CPU-heavy simulation tests of time.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
  },
});
