import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    // All files share one relayer wallet on the local chain, so run them one at a time (nonces).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
