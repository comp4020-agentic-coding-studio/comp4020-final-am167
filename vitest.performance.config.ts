import { defineConfig } from "vitest/config";

// The fast performance layer: bundle budgets against dist/client and the
// deep suite's own maths. Unlike the spec, none of it needs the app running.
export default defineConfig({
  test: {
    include: ["scripts/performance/**/*.test.ts", "src/scripts/performance-profiler.test.ts"],
  },
});
