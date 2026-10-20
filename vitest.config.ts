import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    // demo accounts are off unless explicitly enabled; the unit tests exercise demo mode on purpose
    env: { ALLOW_ADMIN_DEMO: "true" },
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/games/utils.ts", "components/psych/score.ts", "components/olympiad/types.ts", "app/api/**/_lib.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
