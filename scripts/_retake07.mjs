// 补拍 07：让右栏地图完整入镜
import { pathToFileURL } from 'node:url';
const PW =
  process.env.PLAYWRIGHT_CORE ||
  'C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(pathToFileURL(PW).href);
const chromium = pw.chromium ?? pw.default?.chromium;
const BASE = process.env.BASE_URL || 'https://linkr-trip-workbench.app.workbuddy.host/';

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('wm-skip-form').click();
await page.waitForTimeout(300);
await page.locator('#wish').fill('去大理 4 天，自然风光，不赶路');
await page.locator('.departure .btn-primary').click();
await page.waitForSelector('.workbench-bar', { timeout: 30000 });
await page.waitForTimeout(1500);

// 直接对右栏做元素截图（滚到地图位置后整体取一张，含地图与当日地点）
await page.locator('.wb-col.right').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.evaluate(() => {
  const map = document.querySelector('.map-host');
  const absTop = map.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, absTop - 150), behavior: 'auto' });
});
await page.evaluate(() => { const b = document.querySelector('.workbench-bar'); if (b) b.style.display = 'none'; });
await page.waitForTimeout(400);
await page.locator('.wb-col.right').screenshot({ path: 'qa/moments/07-map.png' });
console.log('retaken 07');
await browser.close();
process.exit(0);
