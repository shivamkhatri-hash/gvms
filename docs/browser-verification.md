# Browser Verification Setup

To avoid repeated downloads of browser binaries from the Playwright CDN, the verification environment prioritizes locally installed web browsers (Google Chrome or Microsoft Edge).

## System Architecture

- **Playwright Test Runner**: Runs using package `@playwright/test` version `1.62.1`.
- **Browser Execution**: Automatically scans standard paths for Chrome or Microsoft Edge.
- **Environment Variables**: You can override the detected path by setting:
  ```env
  PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:\Program Files\Google\Chrome\Application\chrome.exe"
  ```

---

## Local Verification Commands

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Run the test suite:
   ```bash
   npx playwright test
   ```
3. Run in UI mode (interactive debugging):
   ```bash
   npx playwright test --ui
   ```

---

## Fallback Behavior

If no local browser is discovered, Playwright falls back to the default configuration. However, setting the variable or installing Google Chrome locally guarantees 100% offline verification compatibility.
