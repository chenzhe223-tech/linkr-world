// 把 promo/moments.html 的九张卡片逐张导出为 1080×1080 PNG
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PW =
  process.env.PLAYWRIGHT_CORE ||
  'C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(pathToFileURL(PW).href);
const chromium = pw.chromium ?? pw.default?.chromium;

mkdirSync('promo/out', { recursive: true });
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL('promo/moments.html').href, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

for (let i = 1; i <= 9; i++) {
  const el = page.locator(`#c${i}`);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await el.screenshot({ path: `promo/out/${String(i).padStart(2, '0')}.png` });
  console.log('exported', i);
}
await browser.close();
process.exit(0);
