import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "fantasy-rules": path.resolve(__dirname, "packages/rules/src/index.ts"),
    },
  },
  test: {
    include: ["packages/rules/**/*.test.ts"],
  },
});
