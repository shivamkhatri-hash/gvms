import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const screenshotsDir = path.resolve('tests/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

test.describe('GVMS Dashboard Verification', () => {
  test('Log in and capture pages and charts', async ({ page }) => {
    // 1. Visit Login
    console.log('Navigating to login page...');
    await page.goto('/');
    
    // Wait for the login screen to render
    await page.waitForSelector('text=OIL AND NATURAL GAS CORPORATION', { timeout: 10000 });

    // 2. Click the quick-connect "Admin" button to populate credentials reliably
    console.log('Clicking quick-connect Admin button...');
    await page.click('button:has-text("Admin")');
    await page.waitForTimeout(500);

    // 3. Submit form
    console.log('Submitting login form...');
    await page.click('button[type="submit"]');

    // 4. Wait for redirection to complete
    console.log('Waiting for redirection to main app...');
    await page.waitForSelector('text=User Management', { timeout: 15000 });
    console.log('Successfully logged in! Current URL:', page.url());

    const pagesToVerify = [
      { name: '1_Main_Dashboard', url: '/' },
      { name: '2_Source_Rock_Core', url: '/?dataset=core' },
      { name: '3_Oil_GC', url: '/oil/dashboard' },
      { name: '4_Stable_Isotope_Gas', url: '/isotope/dashboard?dataset=gas_isotope' },
      { name: '5_Sterane_Biomarkers', url: '/biomarker/sterane-dashboard' },
      { name: '6_Hopane_Biomarkers', url: '/biomarker/hopane-dashboard' },
      { name: '7_Tricyclic_Terpane_Biomarkers', url: '/biomarker/tricyclic-dashboard' },
      { name: '8_Aromatic_Biomarkers', url: '/biomarker/aromatic-dashboard' },
      { name: '9_Pristane_Phytane_Biomarkers', url: '/biomarker/pr-ph-dashboard' },
      { name: '10_Administration', url: '/users' },
      { name: '11_Audit', url: '/logs' }
    ];

    // Capture console logs during navigation
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleLogs.push(`[Console Error on ${page.url()}] ${msg.text()}`);
      }
    });

    for (const p of pagesToVerify) {
      console.log(`Navigating to: ${p.name} (${p.url})`);
      
      // In SPA, we can also use clicking in the sidebar to navigate, 
      // or direct page.goto(url) which will preserve localStorage!
      await page.goto(p.url);
      
      // Wait for content to settle and charts to load
      await page.waitForTimeout(5000);

      // Verify that we didn't get kicked out to login
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        console.warn(`[WARNING] Kicked out to login page on navigating to ${p.name}! Re-authenticating...`);
        await page.click('button:has-text("Admin")');
        await page.click('button[type="submit"]');
        await page.waitForSelector('text=User Management', { timeout: 10000 });
        await page.goto(p.url);
        await page.waitForTimeout(4000);
      }

      // Scroll to trigger lazy loading or animations
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);

      // Take screenshot
      const screenshotPath = path.join(screenshotsDir, `${p.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot captured: ${p.name}.png`);
    }

    if (consoleLogs.length > 0) {
      console.warn('\nCaptured console errors during page verification:');
      consoleLogs.forEach(err => console.warn(err));
    } else {
      console.log('\nNo console errors detected.');
    }
  });
});
