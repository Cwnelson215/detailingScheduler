import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // Stands up an in-memory PGlite DB + runs migrations before each test file, so any
    // test (or code under test) that imports `@/db` uses an isolated database.
    setupFiles: ["./test/setup.ts"],
  },
});
