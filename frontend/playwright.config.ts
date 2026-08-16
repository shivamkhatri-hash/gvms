import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';

// Helper to locate a locally installed browser (Chrome or Edge) in standard paths
const getLocalBrowserPath = () => {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }
  const standardPaths = [
    // Google Chrome paths
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    
    // Microsoft Edge paths
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/microsoft-edge',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
};

const localBrowserExecutable = getLocalBrowserPath();

export default defineConfig({
  testDir: './tests',
  timeout: 120000, // 2 minutes timeout to navigate and capture screenshots across all dashboards
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',
    trace: 'off',
    video: 'off',
    screenshot: 'on',
    headless: true,
    launchOptions: {
      executablePath: localBrowserExecutable,
    },
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
