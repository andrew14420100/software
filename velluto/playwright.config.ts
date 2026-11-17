import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const PORT = Number(process.env.E2E_PORT || 3200);
const preinstalled = fs.existsSync("/opt/pw-browsers") ? fs.readdirSync("/opt/pw-browsers").find((d) => /^chromium-\d+$/.test(d)) : undefined;
const executablePath = preinstalled ? `/opt/pw-browsers/${preinstalled}/chrome-linux64/chrome` : undefined;

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  globalSetup: "./tests/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", screenshot: "only-on-failure", launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["iPad Mini"], defaultBrowserType: "chromium" } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VELLUTO_WORKER: "0" },
  },
});
