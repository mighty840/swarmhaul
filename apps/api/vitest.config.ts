import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@swarmhaul/api",
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: [],
    testTimeout: 60_000, // testcontainer cold-start budget
    hookTimeout: 90_000,
    pool: "forks",
    isolate: false, // share testcontainer across files (Vitest 4 style)
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/db/client.ts",
        "src/index.ts",
        "src/mcp/stdio.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
});
