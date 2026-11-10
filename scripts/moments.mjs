// 朋友圈九宫格素材：从线上真实版本抓取产品截图
// 用法：node scripts/moments.mjs
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PW =
  process.env.PLAYWRIGHT_CORE ||
  'C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(pathToFileURL(PW).href);
const chromium = pw.chromium ?? pw.default?.chromium;
const BASE = process.env.BASE_URL || 'https://linkr-trip-workbench.app.workbuddy.host/';

const OUT = 'qa/moments';
mkdirSync(OUT, { recursive: true });

const shots = [];
const shot = async (page, name, opts = {}) => {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, ...opts });
  shots.push(name);
  console.log('shot', name);
};

const browser = await chromium.launch({
  args: ['--no-proxy-server', '--disable-features=BlockInsecurePrivateNetworkRequests'],
});

async function walk(scope, opts = {}) {
  await scope.goto(BASE, { waitUntil: 'networkidle' });
  await scope.waitForTimeout(700);
  await scope.getByTestId('wm-start').click();
  await scope.waitForTimeout(500);
  await scope.locator('.wm-option', { hasText: '我有具体日期' }).click();
  await scope.locator('.wm-nav .btn-primary').click();
  await scope.waitForTimeout(300);
  await scope.getByTestId('wm-origin').fill(opts.origin || '上海');
  await scope.locator('.wm-nav .btn-primary').click();
  await scope.waitForTimeout(300);
  await scope.locator('.wm-option', { hasText: '已确定目的地' }).click();
  const city = opts.city || '大理';
  await scope.locator('.wm-chip', { hasText: city }).click();
  await scope.locator('.wm-nav .btn-primary').click();
  await scope.waitForTimeout(350);
}

async function generate(scope, opts = {}) {
  await scope.locator('.wm-chip', { hasText: opts.range || '3–5 天' }).click();
  await scope.waitForTimeout(200);
  await scope.locator('.wm-chip', { hasText: opts.days || '4 天' }).click();
  await scope.locator('.wm-nav .btn-primary').click();
  await scope.waitForTimeout(300);
  for (const s of opts.styles || ['咖啡馆', '自然风光']) {
    const c = scope.locator('.wm-chip', { hasText: s });
    if (await c.count()) await c.first().click();
  }
  await scope.locator('.wm-nav .btn-primary').click();
  await scope.waitForTimeout(300);
  await scope.locator('.wm-nav .btn-primary').click(); // extras → profile
  await scope.waitForTimeout(400);
}

/* ── 桌面 ─────────────────────────────────────────────── */
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

// 01 世界地图首页
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await shot(page, '01-worldmap');

// 02 目的地选择
await page.getByTestId('wm-start').click();
await page.waitForTimeout(500);
await page.locator('.wm-option', { hasText: '我有具体日期' }).click();
await page.locator('.wm-nav .btn-primary').click();
await page.waitForTimeout(300);
await page.getByTestId('wm-origin').fill('上海');
await page.locator('.wm-nav .btn-primary').click();
await page.waitForTimeout(300);
await page.locator('.wm-option', { hasText: '已确定目的地' }).click();
await page.locator('.wm-chip', { hasText: '大理' }).click();
await page.waitForTimeout(250);
await shot(page, '02-where');

// 03 天数节奏
await page.locator('.wm-nav .btn-primary').click();
await page.waitForTimeout(350);
await page.locator('.wm-chip', { hasText: '3–5 天' }).click();
await page.waitForTimeout(300);
await page.locator('.wm-chip', { hasText: '4 天' }).click();
await page.waitForTimeout(250);
await shot(page, '03-days');

// 04 画像卡
await page.locator('.wm-nav .btn-primary').click();
await page.waitForTimeout(300);
for (const s of ['咖啡馆', '自然风光']) {
  const c = page.locator('.wm-chip', { hasText: s });
  if (await c.count()) await c.first().click();
}
await page.locator('.wm-nav .btn-primary').click();
await page.waitForTimeout(300);
await page.locator('.wm-chip', { hasText: '不赶路' }).click();
await page.locator('.wm-nav .btn-primary').click();
await page.waitForTimeout(500);
await shot(page, '04-profile');

// 生成 → 工作台
await page.getByTestId('wm-generate').click();
await page.waitForSelector('.workbench-bar', { timeout: 30000 });
await page.waitForFunction(
  () => [...document.querySelectorAll('.place-photo')].every((el) => el.complete),
  null,
  { timeout: 20000 }
).catch(() => {});
await page.waitForTimeout(1200);

// 05 工作台顶部（概况）
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
await page.waitForTimeout(500);
await shot(page, '05-workbench-top');

// 06 逐日行程时间轴
await page.locator('.wb-col.center .timeline .tl-item').nth(1).scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot(page, '06-itinerary');

// 07 地图与地点
await page.locator('.poster-open-btn').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(700);
await shot(page, '07-map');

// 08 特色住宿 + 记忆
await page.evaluate(() => {
  const el = document.querySelector('.wb-stay-slot');
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'auto' });
});
await page.waitForTimeout(700);
await shot(page, '08-stay');

// 09 行程图海报
await page.evaluate(() => document.querySelector('.poster-open-btn')?.click());
await page.waitForSelector('.poster', { timeout: 15000 });
await page.waitForTimeout(2500);
await shot(page, '09-poster');

await ctx.close();

/* ── 手机 ─────────────────────────────────────────────── */
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const m = await mctx.newPage();
await m.goto(BASE, { waitUntil: 'networkidle' });
await m.waitForTimeout(800);
await shot(m, '10-m-worldmap');
await walk(m, { origin: '上海', city: '大理' });
await generate(m, { range: '3–5 天', days: '4 天', styles: ['咖啡馆', '自然风光'] });
await m.waitForSelector('.workbench-bar', { timeout: 30000 });
await m.waitForTimeout(1500);
await shot(m, '11-m-plan');
await m.locator('.mobile-tabbar [role="tab"], .mobile-tabbar button').nth(1).click().catch(() => {});
await m.waitForTimeout(1500);
await shot(m, '12-m-second');
await mctx.close();

console.log(JSON.stringify({ ok: true, shots }, null, 2));
await browser.close();
process.exit(0);
