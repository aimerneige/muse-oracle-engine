import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:4173", channel: "chrome", locale: "zh-CN" },
  webServer: {
    command: "npm run dev -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI
  }
});
