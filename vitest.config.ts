import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Load .env/.env.local so integration tests can reach Supabase.
    env: loadEnv("", process.cwd(), ""),
  },
});
