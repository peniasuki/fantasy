import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "fantasy-rules": path.resolve(__dirname, "packages/rules/src/index.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["packages/rules/**/*.test.ts", "src/**/*.test.ts"],
  },
});
