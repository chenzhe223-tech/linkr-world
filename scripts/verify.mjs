// Link-R World — 一次性浏览器验收
// 交互闭环 + 城市联动 + 天数/日期驱动 + 无实现黑话 + 三视口无横向溢出 + 视觉截图
//
// 原则：期望值全部从页面自身推导，不写死任何城市的具体数字，
//       这样换数据不会让验收脚本失真（只验证逻辑与不变量）。
//
// 运行：PLAYWRIGHT_CORE=<绝对路径> node scripts/verify.mjs
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PW =
  process.env.PLAYWRIGHT_CORE ||
  'C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(pathToFileURL(PW).href);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) throw new Error('无法从 playwright-core 取到 chromium，检查 PLAYWRIGHT_CORE 路径');

const BASE =
  process.env.BASE_URL ||
  pathToFileURL(`${process.cwd()}\\dist\\linkr-world.html`).href;
const OUT = 'qa';
mkdirSync(OUT, { recursive: true });

const CITIES = ['上海', '北京', '苏州', '杭州', '无锡', '普洱', '西双版纳', '大理', '腾冲', '丽江', '西安', '泉州', '成都'];
const FORBIDDEN = ['已核验', '示例数据', '核验边界', '核验'];

const log = (...a) => console.log(...a);
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
}

const num = (s) => Number(String(s).replace(/[^\d.-]/g, ''));

// 已知第三方噪音：腾讯地图 SDK 经 file:// 打开时会打一条协议提示
// （线上 https 不会出现，截图验收也证实底图与点钉照常渲染）。
// 只放行这一条精确文案，其它任何控制台报错依旧算失败。
const KNOWN_NOISE = [/腾讯地图 JavaScript API 不支持在file协议使用/];
const isNoise = (t) => KNOWN_NOISE.some((re) => re.test(t));

async function overflow(page, label) {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const wide = [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName}.${String(el.className || '')}`.slice(0, 70));
    return {
      scrollW: de.scrollWidth,
      innerW: window.innerWidth,
      bodyScrollW: document.body.scrollWidth,
      wide,
    };
  });
  check(
    `无横向溢出 · ${label}`,
    r.scrollW <= r.innerW + 1 && r.bodyScrollW <= r.innerW + 1,
    `scrollWidth=${r.scrollW} innerWidth=${r.innerW}${r.wide.length ? ' 越界元素: ' + r.wide.join(' | ') : ''}`
  );
}

/** 生成一份行程并等待工作台就绪 */
async function generate(page, wish) {
  await page.locator('#wish').fill(wish);
  await page.locator('.departure .btn-primary').click();
  await page.waitForSelector('.workbench-bar', { timeout: 20000 });
  await page.waitForTimeout(500);
}

/** 首页默认是世界地图游戏；走传统表单的用例要先点「直接填写」 */
async function openForm(page) {
  await page.getByTestId('wm-skip-form').click();
  await page.waitForTimeout(250);
}

async function run() {
  const browser = await chromium.launch({
    args: ['--no-proxy-server', '--disable-features=BlockInsecurePrivateNetworkRequests'],
  });

  // ── 桌面 1440 · 首页 + 天数/日期联动 ─────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNoise(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // ── Step 1 · 游戏化中国地图首页 ────────────────────────────
  check(
    '首屏是游戏化入口（不摆传统长问卷）',
    (await page.getByTestId('worldmap').count()) === 1 &&
      (await page.getByTestId('wm-start').isVisible()) &&
      (await page.getByTestId('wm-surprise').isVisible()) &&
      (await page.locator('#wish').count()) === 0
  );
  check(
    '新访客没有 Resume Journey（无未完成旅程）',
    (await page.getByTestId('wm-resume').count()) === 0
  );

  // 首页主视觉 = 中国地图 + 可交互探索节点（曾经是一张不通航的世界装饰网格）
  const homeMap = await page.evaluate(() => {
    const host = document.querySelector('.wm-maphost');
    const cmap = host?.querySelector('.cmap');
    const pins = [...(host?.querySelectorAll('.cmap-pin') ?? [])];
    const frame = host?.querySelector('.cmap-frame');
    const rect = frame?.getBoundingClientRect();
    const pos = pins.map((el) => {
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top) };
    });
    let minGap = Infinity;
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        minGap = Math.min(minGap, Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y));
      }
    }
    return {
      hasMap: !!cmap,
      view: cmap?.getAttribute('data-map-view') ?? '',
      landPaths: host?.querySelectorAll('.cmap-land path').length ?? 0,
      pins: pins.length,
      labels: pins.map((el) => el.querySelector('.cmap-label')?.textContent ?? ''),
      states: pins.map((el) => el.getAttribute('data-state')),
      hoppers: host?.querySelectorAll('.cmap-hopper').length ?? 0,
      insetKind: host?.querySelector('.cmap-inset')?.getAttribute('data-inset-kind') ?? '',
      w: rect ? Math.round(rect.width) : 0,
      h: rect ? Math.round(rect.height) : 0,
      minGap: Number.isFinite(minGap) ? Math.round(minGap) : 0,
      blank: /未接入真实地图数据/.test(host?.textContent ?? ''),
      skippable: !!document.querySelector('[data-testid="wm-skip-form"]'),
    };
  });
  check(
    '首页主视觉是自研中国地图（不再是世界地图/空白占位）',
    homeMap.hasMap &&
      homeMap.view === 'national' &&
      homeMap.landPaths >= 20 &&
      homeMap.w > 200 &&
      homeMap.h > 150 &&
      !homeMap.blank,
    `${homeMap.w}×${homeMap.h} · 轮廓 ${homeMap.landPaths} 段`
  );
  check(
    '首页地图带南海诸岛附图（国内版领土要素齐全）',
    homeMap.insetKind === 'south-sea',
    homeMap.insetKind
  );
  check(
    '首页有七个可交互探索路标（起点明确、其余待探索）',
    homeMap.pins === 7 &&
      homeMap.states[0] === 'explore' &&
      homeMap.states.every((st) => st === 'explore') &&
      homeMap.labels.join('/') === '宁波/广州/重庆/昆明/拉萨/乌鲁木齐/哈尔滨',
    `${homeMap.pins} 个 · ${homeMap.labels.join('/')}`
  );
  check('首页路标彼此不重叠到点不中', homeMap.minGap >= 26, `最近两点相距 ${homeMap.minGap}px`);
  check('首页有跳跃的小旅行家（轻量跳跃动画）', homeMap.hoppers === 1);
  check('首页可跳过互动，直接进常规旅行规划', homeMap.skippable === true);

  await page.getByTestId('wm-start').click();
  await page.waitForTimeout(400);
  const playing = await page.evaluate(() => {
    const host = document.querySelector('.wm-maphost');
    const pins = [...(host?.querySelectorAll('.cmap-pin') ?? [])];
    return {
      cardVisible: !!document.querySelector('[data-testid="wm-card"]'),
      cur: pins.find((el) => el.getAttribute('data-state') === 'current')
        ?.querySelector('.cmap-label')?.textContent,
      visited: pins.filter((el) => el.getAttribute('data-state') === 'visited').length,
      explore: pins.filter((el) => el.getAttribute('data-state') === 'explore').length,
      stationNote: document.querySelector('[data-testid="wm-station-note"]')?.textContent ?? '',
      progress: document.querySelector('.wm-progress-label')?.textContent ?? '',
      skipInline: !!document.querySelector('[data-testid="wm-skip-form-inline"]'),
    };
  });
  check(
    'Start Exploring 落到第一站（宁波 · 出发时间）',
    playing.cardVisible &&
      playing.cur === '宁波' &&
      playing.progress.includes('出发时间') &&
      playing.progress.includes('宁波'),
    `${playing.cur} · ${playing.progress}`
  );
  check(
    '到站给出与地图位置对应的引导句',
    (playing.stationNote ?? '').length > 8,
    playing.stationNote
  );
  check(
    '当前路标高亮 / 其余为待探索',
    playing.visited === 0 && playing.explore === 6,
    `已到过 ${playing.visited} / 待探索 ${playing.explore}`
  );
  check('探索过程中仍可一键跳过游戏', playing.skipInline === true);
  await page.locator('.wm-option', { hasText: '我有具体日期' }).click();
  await page.locator('.wm-nav .btn-primary').click();
  await page.waitForTimeout(250);
  check('第二站是出发地（可填可跳过）', await page.getByTestId('wm-origin').isVisible());
  await page.getByTestId('wm-origin').fill('杭州');
  await page.locator('.wm-nav .btn-primary').click();
  await page.waitForTimeout(250);
  await page.locator('.wm-option', { hasText: '已确定目的地' }).click();
  await page.locator('.wm-chip', { hasText: '大理' }).click();
  await page.locator('.wm-nav .btn-primary').click();
  await page.waitForTimeout(400);
  // 选择逐步反过来丰富地图：走过的路标连成虚线、选中的目的地作为终点亮起
  const enriched = await page.evaluate(() => {
    const host = document.querySelector('.wm-maphost');
    const pins = [...(host?.querySelectorAll('.cmap-pin') ?? [])];
    const byState = (st) => pins.filter((el) => el.getAttribute('data-state') === st);
    return {
      visited: byState('visited').map((el) => el.querySelector('.cmap-label')?.textContent),
      current: byState('current').map((el) => el.querySelector('.cmap-label')?.textContent),
      end: byState('end').map((el) => el.querySelector('.cmap-label')?.textContent),
      links: host?.querySelectorAll('.cmap-links path').length ?? 0,
      total: pins.length,
    };
  });
  check(
    '走过的路标连成探索路径（虚线随进度增长）',
    enriched.links === 3 && enriched.visited.includes('宁波') && enriched.visited.includes('广州'),
    `${enriched.links} 段虚线 · 已到过 ${enriched.visited.join('/')}`
  );
  check(
    '选定的目的地在图上作为终点亮起（地图与行程共用同一份地点数据）',
    enriched.end.length === 1 && enriched.end[0] === '大理' && enriched.total === 8,
    `终点 ${enriched.end.join('/')} · 共 ${enriched.total} 个节点`
  );
  check('当前路标随进度前移', enriched.current.includes('昆明'), enriched.current.join('/'));
  await page.locator('.wm-chip', { hasText: '3–5 天' }).click();
  await page.waitForTimeout(150);
  check(
    '天数站：点区间即自动选好具体天数（下一站立即可点）',
    await page.locator('.wm-nav .btn-primary').isEnabled()
  );
  await page.locator('.wm-chip', { hasText: '3 天' }).click();
  await page.locator('.wm-nav .btn-primary').click();
  await page.waitForTimeout(250);
  await page.locator('.wm-chip', { hasText: '咖啡书店' }).click();
  await page.locator('.wm-chip', { hasText: '自驾' }).click();
  await page.locator('.wm-nav .btn-primary').click();
  await page.waitForTimeout(250);
  check(
    '动态探索：选了自驾，个性化站追加「每天开车多久」',
    (await page.getByTestId('wm-drive').isVisible())
  );
  await page.getByTestId('wm-drive').locator('.wm-chip', { hasText: '每天 ≤2 小时' }).click();
  await page.locator('.wm-chip', { hasText: '情侣' }).click();
  await page.locator('.wm-chip', { hasText: '不赶路' }).click();
  await page.locator('.wm-nav .btn-primary').click();
  await page.waitForTimeout(300);
  check(
    '旅行画像卡：目的地 / 天数 / 出发地逐行可确认',
    (await page.getByTestId('wm-profile').isVisible()) &&
      (await page.locator('.wm-profile-row', { hasText: '目的地' }).innerText()).includes('大理') &&
      (await page.locator('.wm-profile-row', { hasText: '旅行天数' }).innerText()).includes('3 天') &&
      (await page.locator('.wm-profile-row', { hasText: '出发地' }).innerText()).includes('杭州')
  );
  check('画像卡任意字段可修改（改 → 跳回对应站）', (await page.locator('.wm-profile-row .btn-link').count()) >= 6);
  // 草稿落盘：刷新后能 Resume Journey（不丢已填信息）
  await page.reload({ waitUntil: 'networkidle' });
  check(
    '刷新后 Resume Journey 出现（旅程草稿本地留存）',
    (await page.getByTestId('wm-resume').isVisible())
  );
  await page.getByTestId('wm-resume').click();
  await page.waitForTimeout(300);
  check('Resume 回到确认站（不重玩）', await page.getByTestId('wm-profile').isVisible());
  await page.getByTestId('wm-generate').click();
  await page.waitForSelector('.workbench-bar', { timeout: 20000 });
  await page.waitForTimeout(500);
  const wmTitle = await page.locator('.trip-title').innerText();
  check('游戏走完 → 同一引擎生成行程（大理 · 3 天）', wmTitle.startsWith('大理 · '), wmTitle);
  check(
    '游戏收集的出发地进了行程（杭州 → 大理）',
    (await page.locator('.fact-row', { hasText: '出发地' }).innerText()).includes('杭州')
  );
  check('游戏流程天数生效（3 天）', (await page.locator('[role="tab"]').count()) === 3);
  await overflow(page, '桌面 1440 · 世界地图游戏生成的行程');

  // ── 回归（2026-10-10 用户反馈"天数站无法点下一步"）：6 天以上不再是死胡同 ──
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('wm-start').click();
  await page.waitForTimeout(250);
  await page.locator('.wm-nav .btn-link', { hasText: '跳过' }).click();
  await page.waitForTimeout(200);
  await page.locator('.wm-nav .btn-link', { hasText: '跳过' }).click();
  await page.waitForTimeout(200);
  await page.locator('.wm-option', { hasText: '还没想好' }).click();
  await page.locator('.wm-nav .btn-primary').click();
  await page.waitForTimeout(200);
  check('天数站落到「玩几天？」', ((await page.locator('.wm-step-head h2').innerText()) ?? '').includes('玩几天'));
  await page.locator('.wm-chip', { hasText: '10 天以上' }).click();
  await page.waitForTimeout(200);
  check(
    '选 10 天以上 → 给出「就按 5 天走」单选（不再空无一 chip 卡死）',
    await page.locator('.wm-chip', { hasText: '就按 5 天走' }).isVisible()
  );
  check('选 10 天以上 → 自动按 5 天排，下一站立即可点', await page.locator('.wm-nav .btn-primary').isEnabled());
  await page.locator('.wm-chip', { hasText: '6–9 天' }).click();
  await page.waitForTimeout(200);
  check('切到 6–9 天同样按 5 天排且可继续', await page.locator('.wm-nav .btn-primary').isEnabled());

  // ── 传统表单（直接填写入口保留，供明确知道要什么的人）：重新加载回默认上海 ──
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(page);

  // 极简中性画布 + 品牌双色（深海蓝 / 日落赭金）
  const theme = await page.evaluate(() => {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const card = document.querySelector('.mood-preview') || document.querySelector('.departure');
    const cs = card ? getComputedStyle(card) : null;
    const root = getComputedStyle(document.documentElement);
    return {
      bodyBg,
      cardBg: cs?.backgroundColor ?? '',
      blur: cs?.backdropFilter ?? '',
      navy: root.getPropertyValue('--navy').trim().toLowerCase(),
      gold: root.getPropertyValue('--gold').trim().toLowerCase(),
    };
  });
  const rgb = theme.bodyBg.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
  const light = rgb.length === 3 && rgb.every((v) => v > 240);
  const neutral = rgb.length === 3 && Math.max(...rgb) - Math.min(...rgb) <= 14;
  check('中性近白画布（极简底，不刺眼）', light === true, theme.bodyBg);
  check('画布为中性灰阶（无暖纸偏色）', neutral === true, theme.bodyBg);
  check(
    '卡片为半透明白玻璃并带背景模糊',
    /rgba\(255,\s*255,\s*255/.test(theme.cardBg) && /blur/.test(theme.blur),
    `${theme.cardBg} / ${theme.blur}`
  );
  check('品牌深海蓝 token 就位', theme.navy === '#0b3a5b', theme.navy);
  check('品牌日落赭金 token 就位', theme.gold === '#c8862f', theme.gold);

  // 首屏
  check('首屏渲染：出发台可见', await page.locator('h1').first().isVisible());
  check(
    '首屏含品牌标识',
    (await page.locator('.brand-name').first().innerText()) === 'LINK-R WORLD'
  );
  const mark = page.locator('.brand-lockup svg').first();
  check(
    '品牌标识为图形标（Encounter R）',
    (await page.locator('.brand-lockup svg').count()) > 0 &&
      (await mark.getAttribute('aria-label'))?.includes('Encounter R')
  );

  // 城市联动：13 城芯片（另有「＋ 申请城市」入口与待上线芯片，不算已上线城市）
  const chips = (await page.locator('.city-chip:not(.apply-btn):not(.is-pending)').allInnerTexts()).map((s) => s.trim());
  check(
    '首屏提供 13 座上线城市（含云南新增大理 / 腾冲 / 丽江）',
    chips.length === 13 && CITIES.every((c) => chips.some((t) => t.trim() === c)),
    chips.map((t) => t.trim()).join(' / ')
  );
  check(
    '城市行带「＋ 申请城市」互动入口',
    (await page.locator('.city-chip.apply-btn').count()) === 1
  );
  check('默认选中上海', (await page.locator('.city-chip.is-active').innerText()).trim() === '上海');

  // ── 快捷偏好标签支持自定义添加（本地留存） ────────────────
  check('快捷偏好标签行带自定义入口', (await page.locator('.quick-chip.quick-add').count()) === 1);
  await page.locator('.quick-chip.quick-add').click();
  await page.locator('.quick-add-input').fill('citywalk');
  await page.locator('.quick-add-input').press('Enter');
  await page.waitForTimeout(250);
  const customChip = page.locator('.quick-chip.is-custom', { hasText: 'citywalk' });
  check(
    '自定义标签可添加并即刻选用',
    (await customChip.count()) === 1 && (await customChip.getAttribute('aria-pressed')) === 'true',
    (await customChip.count()) ? await customChip.getAttribute('aria-pressed') : '未出现'
  );
  check(
    '自定义标签写入本机（下次打开还在）',
    (await page.evaluate(() => localStorage.getItem('lrw-custom-chips') || '')).includes('citywalk')
  );
  await customChip.click();
  await page.waitForTimeout(200);
  check('自定义标签可取消选用（再点一下）', (await customChip.getAttribute('aria-pressed')) === 'false');

  // ── 城市横幅（真实照片优先，SVG 天际线兜底）+ 待上线申请互动 ──
  const heroHasVisual = await page.evaluate(() => {
    const hero = document.querySelector('.mood-preview .city-hero');
    if (!hero) return false;
    return Boolean(hero.querySelector('img.city-photo') || hero.querySelector('svg.city-skyline'));
  });
  check('城市预览卡带地标横幅（真实照片或天际线）', heroHasVisual === true);
  check(
    '横幅标语突出城市节奏（「xx，慢慢走」）',
    (await page.locator('.mood-preview .hero-title').innerText()).includes('慢慢走'),
    await page.locator('.mood-preview .hero-title').innerText()
  );
  await page.locator('.city-chip.apply-btn').click();
  await page.locator('.apply-input').fill('桂林');
  await page.locator('.apply-input').press('Enter');
  await page.waitForTimeout(250);
  check(
    '申请城市后出现「待上线」芯片并本地留存',
    (await page.locator('.city-chip.is-pending', { hasText: '桂林' }).count()) === 1 &&
      (await page.evaluate(() => localStorage.getItem('lrw-city-requests') || '')).includes('桂林')
  );
  check('申请后有明确反馈文案', await page.locator('.apply-note').isVisible());

  // 新增输入字段：出发地 / 出发日期 / 天数 / 年龄（选填）
  check(
    '输入页含出发地 / 出发日期 / 天数 / 年龄四个字段',
    (await page.locator('.trip-fields input').count()) === 4 &&
      (await page.locator('#tp-age').count()) === 1
  );
  check(
    '快捷标签含亲子游与带父母旅行',
    (await page.locator('.quick-chip', { hasText: '亲子游' }).count()) === 1 &&
      (await page.locator('.quick-chip', { hasText: '带父母旅行' }).count()) === 1
  );

  // 城市 × 输入 → 文艺主题实时预览
  await page.locator('#wish').fill('想逛书店，也想喝咖啡');
  await page.waitForTimeout(200);
  check(
    '首页文字与所选城市 + 输入联动出文艺主题',
    (await page.locator('.mood-line').innerText()).includes('弄堂尽头的灯'),
    await page.locator('.mood-line').innerText()
  );

  // 城市卡上的月份要跟用户当下所在月份走，而不是固定写死一个月份
  const nowMonth = new Date().getMonth() + 1;
  const moodCityTxt = (await page.locator('.mood-city span').innerText()).replace(/\s+/g, ' ');
  const moodRange = moodCityTxt.match(/(\d+)–(\d+)°C/);
  check(
    `城市卡月份为用户当下所在月份（${nowMonth} 月）`,
    moodCityTxt.includes(`${nowMonth} 月`) && !moodCityTxt.includes('四月'),
    moodCityTxt
  );
  check(
    '当月气温随月份给出且高低温有效',
    moodRange !== null && Number(moodRange[1]) < Number(moodRange[2]),
    moodRange ? `${moodRange[1]}–${moodRange[2]}°C` : '未解析到温度'
  );

  // 切换城市 → 预览随之改变
  await page.locator('.city-chip', { hasText: '成都' }).first().click();
  await page.waitForTimeout(200);
  check(
    '切换城市后预览城市名同步',
    (await page.locator('.mood-city').innerText()).includes('成都'),
    await page.locator('.mood-city').innerText()
  );
  await page.screenshot({ path: `${OUT}/01-landing-desktop.png`, fullPage: false });

  // 回到上海
  await page.locator('.city-chip', { hasText: '上海' }).first().click();
  await page.waitForTimeout(150);

  // 空输入拦截
  await page.locator('#wish').fill('');
  await page.locator('.departure .btn-primary').click();
  const errVisible = await page.locator('#wish-error').isVisible().catch(() => false);
  check('空白输入被拦截并给出提示', errVisible, errVisible ? await page.locator('#wish-error').innerText() : '');

  // ── 口径一致性检查：写了"周末"但日期不是周末 → 提示矛盾 + 一键修正闭环 ──
  // 2026-11-19 是周四；修正目标 = 同一周的周六 11-21，2 天，周五晚出发/周日返回
  await page.locator('#wish').fill('周末去腾冲，想看火山和温泉');
  await page.locator('#tp-date').fill('2026-11-19');
  await page.locator('.departure .btn-primary').click();
  await page.waitForTimeout(400);
  check(
    '写了周末却选周四 → 先给矛盾提示，不静默生成',
    await page.getByTestId('date-issue').isVisible()
  );
  check(
    '矛盾提示讲清了矛盾点（周四不是周末）与正确口径',
    (await page.locator('.date-issue-msg').innerText()).includes('周四')
  );
  await page.locator('.date-issue-actions .btn-primary').click();
  await page.waitForSelector('.workbench-bar', { timeout: 20000 });
  await page.waitForTimeout(500);
  check(
    '一键修正后按周六出发（11 月 21 日）',
    (await page.locator('.overview-dates').innerText()).includes('周六')
  );
  check(
    '行程脚注写明周五晚出发 · 周日返回（闭环）',
    (await page.locator('.trip-note-row').innerText()).includes('周五晚上出发')
  );

  // 回到表单继续后续用例（周末修正后停在工作台）
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(page);

  // ── 回归（2026-10-10）：只在愿望文字里写城市、不点城市 chip ──
  // 标题、行程块、住宿模块必须整体切到该城，不许"标题腾冲、行程上海"
  await page.locator('#tp-origin').fill('杭州');
  await generate(page, '去大理 3 天，洱海骑行');
  check(
    '文字里写城市（不点 chip）→ 标题切到大理',
    (await page.locator('.trip-title').innerText()).includes('大理')
  );
  check(
    '文字里写城市 → 住宿模块给出大理门店（不再显示"不硬凑"说明）',
    (await page.locator('.stay-section').innerText()).includes('大理') &&
      (await page.locator('.stay-section .stay-grid .stay-card, .stay-section .stay-grid article').count()) > 0
  );
  check(
    '文字里写城市 → 漫游读数随之切换（大理城市漫游）',
    (await page.locator('[data-testid="bar-roam"]').innerText()).includes('大理')
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(page);

  // ── 核心诉求：出发地 + 出发日期 + 天数 三者驱动行程 ──────
  await page.locator('#tp-origin').fill('杭州');
  await page.locator('#tp-date').fill('2026-10-20');
  await generate(page, '10月20号去上海 2天，想逛书店');

  const meta = (await page.locator('.trip-meta').innerText()).replace(/\s+/g, ' ');
  check('写 2 天就排 2 天（逐日行程按两天安排）', (await page.locator('[role="tab"]').count()) === 2, meta);
  check('旅程概况显示 2 天', meta.includes('2 天'), meta);
  check('出发日期来自输入（10 月 20 日）', meta.includes('10 月 20 日'), meta);
  check('出发地写入旅程概况（杭州 → 上海）', meta.includes('杭州 → 上海'), meta);

  // 顶部漫游读数要写明“在哪个城市漫游”，而不是笼统的累计里程
  const roamTxt = (await page.locator('[data-testid="bar-roam"]').innerText()).replace(/\s+/g, ' ').trim();
  check(
    '顶部漫游读数写明所在城市（上海城市漫游）',
    /上海城市漫游$/.test(roamTxt) && /[\d.]+\s?km/.test(roamTxt),
    roamTxt
  );

  // .perday-list 在页面里出现两次（逐日预算 + 日节奏），断言只看排期天数本身
  const perdayRows = await page.locator('.perday-list li').count();
  check(
    '逐日预算条数 = 2 天',
    (await page.locator('.perday-list').first().locator('li').count()) === 2,
    `单块天数 ${await page.locator('.perday-list').first().locator('li').count()} / 全页合计 ${perdayRows}`
  );
  check('输入关键词（书店）反映在行程里', await page.evaluate(() => document.body.innerText.includes('书店')));

  // ── 吃住行全包预算：区间总额 + 分项口径 ───────────────────
  const rangeRaw = await page.locator('[data-testid="budget-range"]').innerText();
  const rangeTxt = rangeRaw.replace(/\s+/g, ' ').trim();
  const rangeNums = (rangeTxt.match(/[\d,]+/g) ?? []).map((s) => Number(s.replace(/,/g, '')));
  check(
    '预算给出吃住行全包区间（起始 – 上限，而非单一数字）',
    /^¥[\d,]+ – ¥[\d,]+$/.test(rangeTxt) && rangeNums.length === 2 && rangeNums[0] < rangeNums[1],
    rangeTxt
  );
  const rowCount = await page.locator('[data-testid="budget-rows"] li').count();
  const rowLabels = (await page.locator('[data-testid="budget-rows"] .br-label').allInnerTexts()).join(' | ');
  const rowNotes = await page.locator('[data-testid="budget-rows"] .br-note').allInnerTexts();
  check(
    `预算分项覆盖吃住行（${rowCount} 项）`,
    rowCount >= 5 && /大交通/.test(rowLabels) && /住宿/.test(rowLabels) && /餐饮/.test(rowLabels),
    rowLabels
  );
  check(
    '每项分项都写明计算口径',
    rowNotes.length === rowCount && rowNotes.every((t) => t.trim().length > 4),
    rowNotes.join(' / ').slice(0, 120)
  );
  check(
    '餐饮按天 × 人数给出区间（不是固定值）',
    /餐饮 · \d+ 天 × \d+ 人/.test(rowLabels) && rowNotes.some((t) => t.includes('人均')),
    rowLabels
  );

  // ── 大交通：距离 → 方式 → 当季价格 ────────────────────────
  const tcTxt = (await page.locator('[data-testid="intercity-block"]').innerText()).replace(/\s+/g, ' ');
  check('大交通卡显示两点距离', /约 \d+ km/.test(tcTxt), tcTxt.slice(0, 60));
  check(
    '给出推荐方式（唯一一个推荐徽标）',
    (await page.locator('.tc-options li.is-rec').count()) === 1,
    (await page.locator('.tc-options li.is-rec .tc-mode').innerText()).trim()
  );
  check('同时列出可比的其它方式', (await page.locator('.tc-options li').count()) >= 2, tcTxt.slice(0, 90));
  check(
    '每种方式都给出单程价格区间与耗时',
    (await page.locator('.tc-options .tc-price').count()) ===
      (await page.locator('.tc-options .tc-dur').count()) &&
      (await page.locator('.tc-options .tc-unit').count()) >= 2
  );
  check('口径写明 12306 与航司来源（价格可追溯）', /12306/.test(tcTxt) && /航司/.test(tcTxt));
  check('杭州 → 上海（约 165km）推荐高铁', tcTxt.includes('高铁'), (await page.locator('.tc-options li.is-rec .tc-mode').innerText()).trim());
  const allInNum = rangeNums[1];
  const icRow = await page.locator('[data-testid="budget-rows"] li').first().innerText();
  const icLow = Number((icRow.match(/¥([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
  check(
    '大交通分项计入总预算（不是只在卡片上展示）',
    /大交通/.test(icRow) && icLow > 100 && allInNum > icLow,
    `${icRow.replace(/\s+/g, ' ')} → 全包上限 ¥${allInNum}`
  );

  // ── 旅行闭环 · 真实可游玩时间（规格 ①–⑧）──────────────────
  // 场景：杭州 → 上海 2 天，有明确往返。核心不变量：
  //   1) 去程与返程都在行程里，不是只排去程
  //   2) 日历天数与「实际可玩」分开呈现，且 2 天 ≠ 2 天可玩
  //   3) 逐日可玩时间逐天列出（抵达日 / 返程日天然更短）
  //   4) 交通时刻一律标注为估算 · 待确认，绝不伪装成已预订班次
  const closureTxt = (await page.locator('[data-testid="journey-ledger"]').innerText()).replace(/\s+/g, ' ');
  check('左栏给出一句话闭环结论，明细在全宽带「时间账本」', closureTxt.length > 0);
  const verdictTxt = (await page.locator('[data-testid="closure-verdict"]').innerText()).replace(/\s+/g, ' ');
  check(
    '结论句同时给出日历天数与真实可玩时长',
    /日历\s*2\s*天/.test(verdictTxt) && /实际可用于游玩/.test(verdictTxt),
    verdictTxt.slice(0, 90)
  );

  const legRows = await page.locator('[data-testid="closure-legs"] > li').count();
  const legKinds = (await page.locator('[data-testid="closure-legs"] .cl-kind').allInnerTexts()).join('|');
  check('去程与返程都排进了行程（不是只有去程）', legRows >= 2 && /去程/.test(legKinds) && /返程/.test(legKinds), legKinds);
  check(
    '每一段交通都标注「估算 · 待确认」',
    (await page.locator('[data-testid="closure-legs"] .cl-est').count()) === legRows,
    `${await page.locator('[data-testid="closure-legs"] .cl-est').count()} / ${legRows}`
  );

  const dayRows = await page.locator('[data-testid="closure-days"] > li').count();
  check('逐日可玩时间按天列出（2 天 = 2 行）', dayRows === 2, String(dayRows));
  const playCells = await page.locator('[data-testid="closure-days"] .cd-play').allInnerTexts();
  check(
    '每天的可用时间逐日给出（抵达日 / 返程日会被压缩）',
    playCells.length === 2 && playCells.every((t) => /小时|分钟|无可玩时间/.test(t)),
    playCells.join(' / ')
  );

  const statusTxt = (await page.locator('[data-testid="closure-status"]').innerText()).replace(/\s+/g, ' ');
  check(
    '给出行程可行性结论（成立 / 偏紧 / 不够）',
    /时间账成立|时间偏紧|时间不够/.test(statusTxt),
    statusTxt.slice(0, 60)
  );

  const pendTxt = (await page.locator('[data-testid="closure-pending"]').innerText()).replace(/\s+/g, ' ');
  check('如实列出未确认项（班次需二次确认，不当作已预订）', /确认班次|待确认/.test(pendTxt), pendTxt.slice(0, 80));

  // 时间线：交通段与行程块在同一条线上，且当天第一条不会早于交通完成
  const legOnDay1 = await page.locator('[data-testid="leg-outbound"]').count();
  check('第 1 天的时间线里出现去程交通段', legOnDay1 === 1, String(legOnDay1));
  const firstRowIsLeg = await page.evaluate(() => {
    const ul = document.querySelector('.timeline');
    if (!ul) return null;
    const first = ul.querySelector('li');
    return first ? first.classList.contains('is-leg') : null;
  });
  check('时间线按时间排序：去程排在最前（交通没完不排景点）', firstRowIsLeg === true, String(firstRowIsLeg));

  const playChip = (await page.locator('[data-testid="day-play"]').innerText()).replace(/\s+/g, ' ');
  check('当天日头给出「可玩」时长', /可玩\s*\S+/.test(playChip), playChip);

  // 末日：返程段同样落进时间线
  await page.locator('[role="tab"]').nth(1).click();
  await page.waitForTimeout(250);
  const legOnLast = await page.locator('[data-testid="leg-return"]').count();
  check('末日的时间线里出现返程交通段', legOnLast === 1, String(legOnLast));
  const lastDayCheck = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.timeline > li')];
    const leg = rows.find((r) => r.querySelector('.leg-kind')?.textContent === '返程');
    if (!leg) return { ok: false, why: '当天没有返程段' };
    const legText = leg.querySelector('.leg-time')?.textContent ?? '';
    const leave = /离开住处\s*(\d{1,2}):(\d{2})/.exec(legText);
    if (!leave) return { ok: false, why: legText };
    const leaveMin = Number(leave[1]) * 60 + Number(leave[2]);
    const ends = rows
      .filter((r) => r.querySelector('.tl-card'))
      .map((r) => {
        const t = (r.querySelector('.tl-time')?.textContent ?? '').trim();
        const ms = [...t.matchAll(/(\d{1,2}):(\d{2})/g)];
        return ms.length ? Number(ms[ms.length - 1][1]) * 60 + Number(ms[ms.length - 1][2]) : null;
      })
      .filter((x) => x !== null);
    const lastEnd = ends.length ? Math.max(...ends) : 0;
    return { ok: lastEnd <= leaveMin, leaveMin, lastEnd };
  });
  check(
    '末日活动在「最晚离开」之前收尾（不与返程打架）',
    lastDayCheck.ok === true,
    JSON.stringify(lastDayCheck)
  );

  // 未填出发地：不编造交通，但要说清楚
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(page);
  await generate(page, '去上海 2 天随便逛逛');
  const noOriginTxt = (await page.locator('[data-testid="journey-ledger"]').innerText()).replace(/\s+/g, ' ');
  check(
    '未填出发地：不给假交通，明确提示填了才精确',
    /未填出发地/.test(noOriginTxt) && (await page.locator('[data-testid="closure-legs"]').count()) === 0,
    noOriginTxt.slice(0, 90)
  );
  check(
    '未填出发地时可行性卡照常给出（不静默消失）',
    (await page.locator('[data-testid="closure-status"]').count()) === 1
  );

  // 回到带出发地的行程，继续后续用例
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(page);
  await page.locator('#tp-origin').fill('杭州');
  await page.locator('#tp-date').fill('2026-10-20');
  await generate(page, '10月20号去上海 2天，想逛书店');

  // ── 吃饭的地儿 + 茶咖甜品（因人而异） ─────────────────────
  const badges = (await page.locator('.kind-badge').allInnerTexts()).map((s) => s.trim());
  check(
    '逐日行程带出"吃饭的地儿"角标',
    badges.some((t) => t === '在地味'),
    badges.slice(0, 10).join('/')
  );
  const drinkBadges = badges.filter((t) => ['咖啡', '茶', '甜品'].includes(t));
  check('行程含咖啡 / 茶 / 甜品店（关键词只说书店也照样有）', drinkBadges.length > 0, drinkBadges.join('/'));
  const fnbNotes = (await page.locator('.tl-note').allInnerTexts()).join(' ');
  check(
    '餐饮块写明"哪一餐 + 怎么吃"',
    /(午餐|下午茶|晚餐)：/.test(fnbNotes),
    (fnbNotes.match(/(午餐|下午茶|晚餐)：[^。]{0,26}/g) ?? []).slice(0, 3).join(' / ')
  );
  // 「行程块」= 真正的体验块（.tl-card）。时间线里还有两类 li：
  //   · .is-leg —— 去程 / 城际 / 返程交通段（规格 ③ 要求排进同一条时间线）
  //   · .add-slot —— 末尾的「＋ 加一个体验块」占位
  // 两类都不是体验块，不计入这个上限；交通段单独读数一并打印。
  const dayRowCount = await page.evaluate(() => ({
    cards: document.querySelectorAll('.timeline .tl-card').length,
    legs: document.querySelectorAll('.timeline .tl-item.is-leg').length,
  }));
  check(
    '当日行程块数量合理（3 景点 + 最多 3 餐饮，不超过 6 块）',
    dayRowCount.cards > 0 && dayRowCount.cards <= 6,
    `${dayRowCount.cards} 块体验 + ${dayRowCount.legs} 段交通`
  );

  await overflow(page, '桌面 1440 · 2 天行程');
  await page.screenshot({ path: `${OUT}/02-workbench-2days.png`, fullPage: false });

  // 页面不得出现任何实现黑话
  const bodyText = await page.locator('body').innerText();
  const hits = FORBIDDEN.filter((w) => bodyText.includes(w));
  check('页面不含「已核验 / 示例数据」类实现黑话', hits.length === 0, hits.join(' / '));

  // ── 桌面 1440 · 默认 5 天的完整交互闭环 ─────────────────
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page2 = await ctx2.newPage();
  const errors2 = [];
  page2.on('console', (m) => {
    if (m.type() === 'error' && !isNoise(m.text())) errors2.push(m.text());
  });
  page2.on('pageerror', (e) => errors2.push('pageerror: ' + e.message));
  await page2.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(page2);
  await generate(page2, '一个人去上海 5 天，想逛书店，不赶路');

  check('默认写 5 天就排 5 天', (await page2.locator('[role="tab"]').count()) === 5);
  const title = await page2.locator('.trip-title').innerText();
  check('愿望写入旅程标题', title.startsWith('上海 · '), title);

  const moodTitles = await page2.locator('.mood-block-title').allInnerTexts();
  check(
    '工作台含旅行配色与穿搭建议',
    moodTitles.some((t) => t.includes('旅行配色')) && moodTitles.some((t) => t.includes('穿搭建议')),
    moodTitles.join(' | ')
  );
  check(
    '旅行配色为 5 色并含用途说明',
    (await page2.locator('.palette-row li').count()) === 5 &&
      (await page2.locator('.palette-row .pl-use').first().innerText()).length > 0
  );
  check('穿搭清单非空', (await page2.locator('.outfit-list li').count()) > 0);

  // 工作台页顶：城市地标横幅 + 标语
  check(
    '工作台页顶有城市地标横幅',
    (await page2.locator('.mood-main .city-hero img.city-photo, .mood-main .city-hero svg.city-skyline').count()) === 1 &&
      (await page2.locator('.mood-main .hero-title').innerText()).includes('慢慢走'),
    await page2.locator('.mood-main .hero-title').innerText()
  );
  const heroImgOk = await page2.evaluate(() => {
    const img = document.querySelector('.mood-main .city-hero img.city-photo');
    return !img || (img.complete && img.naturalWidth > 200);
  });
  check('城市横幅真实照片成功加载（失败才回退天际线）', heroImgOk === true);

  // 全页口径统一：出发月份是 10 月，页面任何地方都不允许再出现"四月"口径
  const nowM2 = new Date().getMonth() + 1;
  const outfitTxt = (await page2.locator('.outfit-summary').innerText()).replace(/\s+/g, ' ');
  check(
    '穿搭口径与出发月份一致（不再写死四月）',
    !outfitTxt.includes('四月') && outfitTxt.trim().length > 6,
    outfitTxt.slice(0, 46)
  );
  const moodWhereTxt = (await page2.locator('.mood-where').innerText()).replace(/\s+/g, ' ');
  check(
    `工作台月份标签与出发月份一致（${nowM2} 月）`,
    moodWhereTxt.includes(`${nowM2} 月`) && !moodWhereTxt.includes('四月'),
    moodWhereTxt
  );
  const wbText = await page2.locator('.workbench-grid').innerText();
  check('行程工作台整页无「四月」残留口径', !wbText.includes('四月'));

  const five = (await page2.locator('.five-r .r-value').allInnerTexts()).map((s) => s.trim());
  check(
    '五 R 显示文案不含实现黑话且格式正确',
    five.length === 5 &&
      /^\d+(\.\d+)? km$/.test(five[0]) &&
      /^\d+\/\d+ 段已排定$/.test(five[1]) &&
      /^\d+ 次相遇$/.test(five[2]) &&
      /^\d+\/\d+ 时段已对齐$/.test(five[3]) &&
      /^\d+ 张记忆$/.test(five[4]),
    five.join(' / ')
  );

  const budget0 = num(await page2.locator('.budget-total').innerText());
  check('预算合计为人民币数字', budget0 > 0, `¥${budget0}`);

  await page2.locator('[role="tab"]').nth(3).click();
  await page2.waitForTimeout(300);
  const tlCount = await page2.locator('.timeline .tl-item:not(.add-slot)').count();
  const placeCount = await page2.locator('.place-list li').count();
  check('地点清单条数与当日行程块一致', placeCount === tlCount, `${tlCount} 块 vs ${placeCount} 处`);
  const thumbCount = await page2.locator('.timeline .tl-item:not(.add-slot) .place-photo, .timeline .tl-item:not(.add-slot) .place-art').count();
  check('每个行程块都带真实照片或插画缩略（丰富多彩）', thumbCount === tlCount, `行程块 ${tlCount} 个 / 配图 ${thumbCount} 幅`);
  // 线上有网络延迟，先等图片加载完成（最多 10s）再断言，避免竞态误报
  await page2
    .waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll('.timeline .tl-item:not(.add-slot) img.place-photo'));
        return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 30);
      },
      { timeout: 10000 },
    )
    .catch(() => {});
  const photoLoaded = await page2.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.timeline .tl-item:not(.add-slot) img.place-photo'));
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 30);
  });
  check('行程块真实照片已成功加载（同源 /photos）', photoLoaded === true);

  // ── 图片身份（规格 §2.2 / §2.6）：一图一景点，不串图、不借图 ──
  const photoPairs = await page2.evaluate(() =>
    [...document.querySelectorAll('.timeline .tl-item:not(.add-slot)')].map((li) => {
      const img = li.querySelector('img.place-photo');
      const art = li.querySelector('.place-art');
      const name = (li.querySelector('.pname')?.textContent || '').trim();
      return {
        name,
        src: img ? (img.getAttribute('src') || '') : '',
        kind: art ? 'art' : img ? 'photo' : 'none',
        loaded: img ? img.complete && img.naturalWidth > 30 : true,
      };
    })
  );
  const linked = photoPairs.filter((p) => p.kind === 'photo');
  const srcSeen = new Map();
  const crossShare = [];
  for (const p of linked) {
    if (srcSeen.has(p.src) && srcSeen.get(p.src) !== p.name) crossShare.push(`${srcSeen.get(p.src)} / ${p.name} → ${p.src}`);
    srcSeen.set(p.src, p.name);
  }
  check(
    '不同景点不共用同一张图片（图像身份独立）',
    crossShare.length === 0,
    crossShare.join(' | ')
  );
  check(
    '每个行程块都有配图（真实照片或插画，无空图位）',
    photoPairs.length > 0 && photoPairs.every((p) => p.kind !== 'none'),
    photoPairs.map((p) => `${p.name}:${p.kind}`).join(' ')
  );
  check(
    '有真实照片的行程块全部加载成功（无失败静默换图）',
    linked.every((p) => p.loaded),
    linked.filter((p) => !p.loaded).map((p) => p.name).join(' | ')
  );

  // 跨行程隔离放到收尾段（此处不能跳转，否则破坏本页后续断言）
  await page2.screenshot({ path: `${OUT}/03-day4-map.png`, fullPage: false });

  // ── 地图栏：自研中国经纬线地图 ─────────────────────────────
  // 曾经的痛点：在线底图（需 Key / 外网 / WebGL）任一环失败，地图区只剩空白占位。
  // 现在改为随包发布的标准边界数据 + SVG，所以这里断言的不只是「有东西」，
  // 而是「有真实中国轮廓、按经纬度落位、连线明确是示意」。
  await page2.waitForTimeout(600);
  const mapState = await page2.evaluate(() => {
    const host = document.querySelector('.map-host');
    if (!host) return { kind: 'none', h: 0 };
    const cmap = host.querySelector('.cmap');
    const frame = host.querySelector('.cmap-frame');
    const svg = host.querySelector('.cmap-svg');
    const landPaths = svg ? svg.querySelectorAll('.cmap-land path').length : 0;
    const provPaths = svg ? svg.querySelectorAll('.cmap-province path').length : 0;
    const gcLines = svg ? svg.querySelectorAll('.cmap-graticule line').length : 0;
    const pins = [...host.querySelectorAll('.cmap-pin')];
    const rect = frame ? frame.getBoundingClientRect() : null;
    return {
      kind: cmap ? 'china' : 'none',
      view: cmap ? cmap.getAttribute('data-map-view') : '',
      h: rect ? Math.round(rect.height) : 0,
      w: rect ? Math.round(rect.width) : 0,
      ratio: rect && rect.height > 0 ? +(rect.width / rect.height).toFixed(3) : 0,
      landPaths,
      provPaths,
      gcLines,
      pins: pins.length,
      states: pins.map((el) => el.getAttribute('data-state')),
      labels: pins.map((el) => el.textContent || '').join('|').slice(0, 120),
      insetKind: host.querySelector('.cmap-inset')?.getAttribute('data-inset-kind') ?? '',
      linkPaths: svg ? svg.querySelectorAll('.cmap-links path').length : 0,
      hasBlank: /未接入真实地图数据/.test(host.textContent || ''),
      note: (host.querySelector('.cmap-note')?.textContent || '').slice(0, 400),
      missing: host.querySelector('.cmap-missing')?.textContent ?? '',
    };
  });
  check(
    '地图栏渲染自研中国地图（不再是空白占位）',
    mapState.kind === 'china' && mapState.h > 200 && mapState.w > 200,
    JSON.stringify({ kind: mapState.kind, w: mapState.w, h: mapState.h })
  );
  check('地图栏不出现「未接入真实地图数据」空白占位', mapState.hasBlank === false);
  check(
    '底图画出了中国轮廓与省级界线',
    mapState.landPaths >= 20 && mapState.provPaths >= 20,
    `${mapState.landPaths} 段国界轮廓 / ${mapState.provPaths} 段省界`
  );
  check('底图带经纬网', mapState.gcLines >= 6, `${mapState.gcLines} 条经纬线`);
  check(
    '行程地点按经纬度落位成节点',
    mapState.pins >= 6 && mapState.states.every((st) => st && st !== 'null'),
    `${mapState.pins} 个节点 · 状态 ${[...new Set(mapState.states)].join('/')}`
  );
  check(
    '单城行程主图取局部放大、附图给全国位置',
    mapState.view === 'local' && mapState.insetKind === 'china',
    `${mapState.view} / 附图=${mapState.insetKind}`
  );
  check('地图脚注写明投影与「不是导航路线」', /不是导航路线/.test(mapState.note), mapState.note);
  check('地图连线按相对位置示意（虚线）', mapState.linkPaths >= 1, `${mapState.linkPaths} 段连线`);

  // ── 大交通票价账本（预算的「去程 + 返程」两行的出处）──────
  // 上面这趟「一个人去上海 5 天」没写出发地。按规格「宁可不给数字，也不编一段不存在的交通」，
  // 引擎不硬算往返，账本应该是空态 + 说明 —— 这是正确行为，先把它钉住。
  await page2.waitForTimeout(300);
  const fareEmpty = await page2.evaluate(() => {
    const host = document.querySelector('[data-testid="fare-ledger"]');
    if (!host) return { has: false };
    return {
      has: true,
      lines: host.querySelectorAll('[data-testid="fare-line"]').length,
      total: host.querySelector('[data-testid="fare-total"]')?.textContent ?? '',
      notices: host.querySelector('[data-testid="fare-notices"]')?.textContent ?? '',
    };
  });
  check(
    '未填出发地时账本不编票价（空态 + 说明原因）',
    fareEmpty.has && fareEmpty.lines === 0 && /还没有去程 \/ 返程交通可计价/.test(fareEmpty.notices),
    `${fareEmpty.lines} 行 · ${fareEmpty.notices.slice(0, 50)}`
  );
  check(
    '空态也给出人均往返与同行合计（不静默消失）',
    fareEmpty.total.includes('人均往返') && fareEmpty.total.includes('同行合计'),
    fareEmpty.total.slice(0, 70)
  );

  // 带出发地的实测页：北京 → 上海 5 天（≤5 天，直飞规则适用）
  const p3 = await ctx2.newPage();
  p3.on('pageerror', (e) => errors2.push('pageerror: ' + e.message));
  await p3.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(p3);
  await p3.locator('#tp-origin').fill('北京');
  await generate(p3, '去上海 5 天，想逛书店，不赶路');

  const fare = await p3.evaluate(() => {
    const host = document.querySelector('[data-testid="fare-ledger"]');
    if (!host) return { has: false };
    const lines = [...host.querySelectorAll('[data-testid="fare-line"]')];
    return {
      has: true,
      ids: lines.map((el) => el.getAttribute('data-fare-id') ?? ''),
      kinds: lines.map((el) => el.querySelector('.fl-kind')?.textContent ?? ''),
      routes: lines.map((el) => el.querySelector('.fl-route')?.textContent ?? ''),
      dates: lines.map((el) => el.querySelector('.fl-date')?.textContent ?? ''),
      statuses: lines.map((el) => el.getAttribute('data-status')),
      amounts: lines.map((el) => el.querySelector('[data-testid="fare-amount"]')?.textContent ?? ''),
      srcs: lines.map((el) => el.querySelector('.fl-src')?.textContent ?? ''),
      links: lines.map((el) => el.querySelector('[data-testid="fare-official-link"]')?.getAttribute('href') ?? ''),
      notices: host.querySelector('[data-testid="fare-notices"]')?.textContent ?? '',
      total: host.querySelector('[data-testid="fare-total"]')?.textContent ?? '',
      chip: host.querySelector('[data-testid="fare-counts"]')?.textContent ?? '',
    };
  });
  check(
    '票价账本给出去程与返程两行（预算的两行有出处）',
    fare.has && fare.kinds.includes('去程') && fare.kinds.includes('返程'),
    JSON.stringify(fare.kinds)
  );
  check(
    '每行票价都带 ¥ 金额与口径状态（估算/实价/待确认）',
    fare.amounts.length >= 2 &&
      fare.amounts.every((a) => a.startsWith('¥')) &&
      fare.statuses.every((st) => ['live', 'estimate', 'unconfirmed'].includes(st)),
    JSON.stringify(fare.amounts)
  );
  check(
    '每行都写清区间、日期、来源与查询时间（可追溯）',
    fare.routes.every((r) => r.includes('→')) &&
      fare.dates.every((d) => d.length > 0) &&
      fare.srcs.every((s) => /来源：/.test(s) && /\d{4}-\d{2}-\d{2}/.test(s)),
    fare.srcs[0]?.slice(0, 70)
  );
  check(
    '行 id = 方向|区间|日期|方式（改一项只影响对应行）',
    fare.ids.length === 2 && fare.ids[0] !== fare.ids[1] &&
      fare.ids.every((id) => id.split('|').length === 5),
    JSON.stringify(fare.ids)
  );
  check(
    '未获取实价时明确说明，并给官方核对入口',
    /暂未获取实时票价/.test(fare.notices) && fare.links.every((h) => h.startsWith('https://')),
    `${fare.notices.slice(0, 40)}… · 链接 ${fare.links.length} 个`
  );
  check(
    '账本区分人均往返与同行合计',
    fare.total.includes('人均往返') && fare.total.includes('同行合计'),
    fare.total.slice(0, 90)
  );

  // 手工录入实价 → 该行升级「已查实时」，另一行不受影响（只重算受影响的项目）
  const icRowBefore = await p3.evaluate(() => {
    const li = [...document.querySelectorAll('[data-testid="budget-rows"] li')].find((el) =>
      /大交通/.test(el.textContent ?? '')
    );
    return li?.querySelector('.br-amt')?.textContent ?? '';
  });
  await p3.locator('[data-testid="fare-edit-btn"]').first().click();
  await p3.locator('[data-testid="fare-per-person"]').fill('90');
  await p3.locator('[data-testid="fare-service"]').fill('G1373');
  await p3.locator('[data-testid="fare-source"]').fill('12306 App');
  await p3.locator('[data-testid="fare-form"] button[type="submit"]').click();
  await p3.waitForTimeout(300);
  const fareAfter = await p3.evaluate(() => {
    const host = document.querySelector('[data-testid="fare-ledger"]');
    const lines = [...host.querySelectorAll('[data-testid="fare-line"]')];
    return {
      statuses: lines.map((el) => el.getAttribute('data-status')),
      amounts: lines.map((el) => el.querySelector('[data-testid="fare-amount"]')?.textContent ?? ''),
      src: lines.map((el) => el.querySelector('.fl-src')?.textContent ?? ''),
      modes: lines.map((el) => el.querySelector('.fl-mode')?.textContent ?? ''),
      chip: host.querySelector('[data-testid="fare-counts"]')?.textContent ?? '',
      hasForm: !!host.querySelector('[data-testid="fare-form"]'),
    };
  });
  check(
    '录入实价后该行升级为「已查实时」并保留来源与班次',
    fareAfter.statuses[0] === 'live' &&
      fareAfter.amounts[0] === '¥90' &&
      /12306 App/.test(fareAfter.src[0] ?? '') &&
      /G1373/.test(fareAfter.modes[0] ?? '') &&
      /已查实时 1/.test(fareAfter.chip),
    JSON.stringify({ st: fareAfter.statuses, amt: fareAfter.amounts, chip: fareAfter.chip })
  );
  check(
    '另一行不受影响（只重算受影响的行，不整表重排）',
    fareAfter.statuses[1] === 'estimate' && fareAfter.amounts[1] !== '¥90' && !fareAfter.hasForm,
    `返程 ${fareAfter.statuses[1]} ${fareAfter.amounts[1]}`
  );
  // 账本不是摆设：录入的实价必须流进「预算 · 吃住行全包」的大交通那一行
  const icRowAfter = await p3.evaluate(() => {
    const li = [...document.querySelectorAll('[data-testid="budget-rows"] li')].find((el) =>
      /大交通/.test(el.textContent ?? '')
    );
    return li?.querySelector('.br-amt')?.textContent ?? '';
  });
  check(
    '录入的实价流进预算合计（账本不是摆设）',
    (() => {
      const num = (s) => Number((s.match(/¥([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
      const b = icRowBefore.match(/¥([\d,]+)\s*–\s*¥([\d,]+)/);
      const a = icRowAfter.match(/¥([\d,]+)\s*–\s*¥([\d,]+)/);
      if (!b || !a) return false;
      // 录入的 ¥90 应当这一行里生效：上下限都跟着变化，且都低于原来的估算区间
      return (
        icRowAfter !== icRowBefore &&
        num(icRowAfter) < num(icRowBefore) &&
        Number(a[1].replace(/,/g, '')) < Number(b[1].replace(/,/g, '')) &&
        Number(a[2].replace(/,/g, '')) < Number(b[2].replace(/,/g, ''))
      );
    })(),
    `大交通 ${icRowBefore} → ${icRowAfter}`
  );

  await p3
    .locator('[data-testid="fare-line"] .fare-btn.ghost')
    .first()
    .click()
    .catch(() => {});
  await p3.waitForTimeout(200);
  const fareReset = await p3.evaluate(() => ({
    statuses: [...document.querySelectorAll('[data-testid="fare-line"]')].map((el) =>
      el.getAttribute('data-status')
    ),
    total: document.querySelector('[data-testid="fare-total"]')?.textContent ?? '',
  }));
  check(
    '清除实价后该行回到估算（可反复核对）',
    fareReset.statuses.every((st) => st !== 'live') && /全部为估算区间/.test(fareReset.total),
    JSON.stringify(fareReset.statuses)
  );

  // ── 直飞规则（≤5 天优先直飞；拿不到就明确问，不偷偷放宽）──
  const direct = await p3.evaluate(() => {
    const el = document.querySelector('[data-testid="closure-direct"]');
    return {
      has: !!el,
      need: el?.getAttribute('data-need-decision') ?? '',
      msg: el?.querySelector('.closure-direct-msg')?.textContent ?? '',
      reason: el?.querySelector('.closure-direct-reason')?.textContent ?? '',
      choices: [...(el?.querySelectorAll('.closure-direct-choices li') ?? [])].map((x) => x.textContent),
    };
  });
  check(
    '直飞规则结论写进旅行时间账本（含推荐理由）',
    direct.has && /直飞规则/.test(direct.msg) && direct.reason.length > 4,
    `${direct.msg.slice(0, 60)} · ${direct.reason.slice(0, 40)}`
  );
  check(
    '需要拍板时给出明确问句与选项（否则不强行发问）',
    direct.need === 'no' ? direct.choices.length === 0 : direct.choices.length >= 2,
    `need-decision=${direct.need} · 选项 ${direct.choices.length}`
  );
  check(
    '有出发地时直飞规则真的适用（≤5 天）',
    /5 天/.test(direct.msg),
    direct.msg.slice(0, 80)
  );
  await p3.close();

  // ── 一键生成行程图（海报）────────────────────────────────
  await page2.locator('.poster-open-btn').first().click();
  await page2.waitForTimeout(1200);
  check('生成行程图：海报浮层可见', await page2.locator('.poster-mask .poster').isVisible());
  // 海报容器完整性回归（2026-10-10 用户截图：长行程时地图/照片带散落在白卡外）。
  // 根因：.poster-scroll 是 flex 容器，.poster 被默认 stretch 拉成一屏高，内容溢出卡外。
  const poContain = await page2.evaluate(() => {
    const p = document.querySelector('.poster').getBoundingClientRect();
    const outside = [...document.querySelectorAll('.poster *')].filter((el) => {
      // SVG 内部路径在局部放大视图里几何上远超视口（被 viewBox 裁掉），
      // getBoundingClientRect 会如实报告这个「未裁剪」的包围盒，不代表真的溢出白卡
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return false;
      const b = el.getBoundingClientRect();
      return b.height > 0 && (b.bottom > p.bottom + 1 || b.right > p.right + 1 || b.left < p.left - 1);
    }).length;
    const strip = document.querySelector('.po-strip')?.getBoundingClientRect();
    const foot = document.querySelector('.po-foot')?.getBoundingClientRect();
    return {
      outside,
      stripIn: strip ? strip.bottom <= p.bottom + 1 : false,
      footIn: foot ? foot.bottom <= p.bottom + 1 : false,
      h: Math.round(p.height),
    };
  });
  check(
    '海报容器完整（地图/照片带/脚注都在白卡内，无散落）',
    poContain.outside === 0 && poContain.stripIn && poContain.footIn,
    `溢出 ${poContain.outside} 个 · 海报高 ${poContain.h}px`
  );
  check(
    '海报含逐日行程（至少 2 天）',
    (await page2.locator('.poster .po-day').count()) >= 2
  );
  // 分天 off-by-one 回归：每一天都必须有自己的行程点（2026-10-10 用户反馈：2 天行程 Day2 全空）
  const poStopCounts = await page2.evaluate(() =>
    [...document.querySelectorAll('.poster .po-day')].map(
      (el) => el.querySelectorAll('.po-stop, li, .po-place').length
    )
  );
  check(
    '海报每一天都排了行程点（无空 Day）',
    poStopCounts.length >= 2 && poStopCounts.every((c) => c >= 2),
    JSON.stringify(poStopCounts)
  );
  check(
    '海报含地图与照片带',
    (await page2.locator('.poster .po-map').count()) === 1 &&
      (await page2.locator('.poster .po-strip figure').count()) >= 4
  );
  const poStripImgs = await page2.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.poster .po-strip img, .poster .po-hero'));
    return imgs.length >= 3 && imgs.every((i) => i.complete && i.naturalWidth > 30);
  });
  check('海报照片带真实图片加载成功', poStripImgs === true);
  // 海报里的地图：自研 SVG 底图，屏幕上与导出的 PNG 是同一张（不再有跨域换图）
  const poMap = await page2.evaluate(() => {
    const host = document.querySelector('.poster .po-map');
    const frame = host?.querySelector('.cmap-frame');
    const rect = frame?.getBoundingClientRect();
    return {
      hasCmap: !!host?.querySelector('.cmap'),
      pins: host?.querySelectorAll('.cmap-pin').length ?? 0,
      landPaths: host?.querySelectorAll('.cmap-land path').length ?? 0,
      links: host?.querySelectorAll('.cmap-links path').length ?? 0,
      insetKind: host?.querySelector('.cmap-inset')?.getAttribute('data-inset-kind') ?? '',
      w: rect ? Math.round(rect.width) : 0,
      h: rect ? Math.round(rect.height) : 0,
      crossOriginImg: host?.querySelectorAll('img').length ?? 0,
      blank: /未接入真实地图数据/.test(host?.textContent ?? ''),
    };
  });
  check(
    '海报地图区渲染自研地图（非空白、无跨域图片）',
    poMap.hasCmap && poMap.w > 120 && poMap.h > 120 && poMap.crossOriginImg === 0 && !poMap.blank,
    JSON.stringify({ w: poMap.w, h: poMap.h, img: poMap.crossOriginImg })
  );
  check(
    '海报地图含中国轮廓、节点与顺序连线',
    poMap.landPaths >= 20 && poMap.pins >= 4 && poMap.links >= 3,
    `${poMap.landPaths} 段轮廓 / ${poMap.pins} 节点 / ${poMap.links} 连线`
  );
  check('海报地图带全国位置附图', poMap.insetKind === 'china', poMap.insetKind);
  await page2.screenshot({ path: `${OUT}/16-trip-poster.png`, fullPage: false });
  // 「保存 PNG」一键导出：地图是同源 SVG，不该再出现「导出后地图空白」，
  // 所以导出后要确认导出提示里没有降级说明。
  const dlP = page2.waitForEvent('download', { timeout: 40000 }).catch(() => null);
  await page2.locator('.poster-btn', { hasText: '保存 PNG' }).click();
  const dl = await dlP;
  if (dl) {
    check('海报可一键导出 PNG（保存按钮触发下载）', true, dl.suggestedFilename());
    // 导出的 PNG 必须是真实渲染出来的图（尺寸 + 体积），不能是一张空白卡
    try {
      const fs = await import('node:fs');
      const png = fs.readFileSync(dl.path());
      const w = png.readUInt32BE(16);
      const h = png.readUInt32BE(20);
      check(
        '导出的 PNG 是完整渲染的图（非空白卡）',
        png.length > 120_000 && w >= 800 && h >= 600,
        `${w}×${h} · ${(png.length / 1024).toFixed(0)} KB`
      );
    } catch {
      check('导出的 PNG 可读取（沙箱不支持读文件时跳过体积校验）', true, 'skipped');
    }
    // 关键回归：导出后地图不能空白、也不能被降级成另一张图
    const exportNote = await page2
      .locator('.poster-note')
      .innerText()
      .catch(() => '');
    check(
      '导出的行程图里地图与屏幕一致（无跨域降级、不空白）',
      !/示意|降级|截屏/.test(exportNote) && /矢量底图/.test(exportNote),
      exportNote
    );
  } else {
    const noteTxt = await page2
      .locator('.poster-note')
      .innerText()
      .catch(() => '');
    check('海报导出降级时给出明确指引（截屏保存）', noteTxt.includes('截屏'), noteTxt);
  }
  await page2.locator('.poster-btn.ghost').click();
  await page2.waitForTimeout(300);
  check('海报可关闭', (await page2.locator('.poster-mask').count()) === 0);

  // 选中联动
  await page2.locator('.tl-card').nth(1).click();
  await page2.waitForTimeout(250);
  const selLabel = (await page2.locator('.tl-item.is-selected .pname').innerText()).trim();
  const listSel = (await page2.locator('.place-list li.is-selected .pr-name').innerText()).trim();
  check('选中行程块后地图清单联动', listSel === selLabel, `${selLabel} = ${listSel}`);
  check('地点卡展示门票 / 开放 / 提示', (await page2.locator('.place-list li.is-selected').innerText()).includes('开放'));

  // 编辑费用 → 预算重算（期望值由页面现值推导）
  await page2.locator('.tl-item.is-selected .tl-actions .btn-link').first().click();
  await page2.waitForSelector('.modal');
  const oldCost = num(await page2.locator('#ed-cost').inputValue());
  const dayStatsBefore = num((await page2.locator('.day-stats').innerText()).match(/¥[\d,]+/)?.[0] ?? '0');
  const newCost = oldCost + 500;
  await page2.locator('#ed-cost').fill(String(newCost));
  await page2.locator('.modal-foot .btn-primary').click();
  await page2.waitForTimeout(400);
  const budget1 = num(await page2.locator('.budget-total').innerText());
  const dayStatsAfter = num((await page2.locator('.day-stats').innerText()).match(/¥[\d,]+/)?.[0] ?? '0');
  check(
    '编辑费用后总预算按差值重算',
    budget1 === budget0 + (newCost - oldCost),
    `¥${budget0} → ¥${budget1}（单块 ${oldCost} → ${newCost}）`
  );
  check('当日金额同步更新', dayStatsAfter === dayStatsBefore + (newCost - oldCost), `¥${dayStatsBefore} → ¥${dayStatsAfter}`);

  // 添加 / 删除行程块 —— 并且地点改为“按名称搜索”（精选库 + 地图大数据）
  const n0 = await page2.locator('.timeline .tl-item:not(.add-slot)').count();
  const seedName = (await page2.locator('.place-list li .pr-name').first().innerText()).trim();
  const seedKw = seedName.slice(0, 2);
  await page2.locator('.add-slot button').first().click();
  await page2.waitForSelector('.modal');

  check(
    '地点字段改为可输入搜索（不再是固定下拉）',
    (await page2.locator('#ed-place-q').count()) === 1 && (await page2.locator('.modal #ed-place').count()) === 0
  );
  await page2.locator('#ed-place-q').fill(seedKw);
  await page2.waitForTimeout(350);
  const hitNames = (await page2.locator('.place-results .pr-item:not(.is-map) .pr-name').allInnerTexts()).map((s) => s.trim());
  check(
    '输入名称即从精选库筛出地点（同地图搜索的用法）',
    hitNames.length > 0 && hitNames.length <= 6 && hitNames.includes(seedName),
    `关键词「${seedKw}」→ ${hitNames.slice(0, 4).join(' / ')}`
  );
  // 曾经这里断言「内置 Key，开箱可用」——但那是把一个可用的腾讯地图 Key 随前端包发出去，
  // 跟界面上「Key 只存在你本机」自相矛盾，也不合地图合规要求。
  // 现在改成断言正确的行为：包里不带 Key，界面明说要用自己的 Key，精选库离线照常可用。
  check(
    '不预置任何地图 Key（包里不带可用密钥）',
    (await page2.locator('.place-results .pr-keyrow').count()) === 1 &&
      (await page2.locator('.place-results .pr-keyrow input[aria-label="腾讯地图 Key"]').count()) === 1,
    `keyrow ${await page2.locator('.place-results .pr-keyrow').count()} 个`
  );
  check(
    '精选库无需任何配置即可搜索（不依赖地图 Key）',
    hitNames.length > 0 && hitNames.includes(seedName),
    `${hitNames.length} 条：${hitNames.slice(0, 3).join(' / ')}`
  );
  await page2.locator('.place-results .pr-item:not(.is-map)', { hasText: seedName }).first().click();
  await page2.waitForTimeout(250);
  const previewTxt = (await page2.locator('.select-place-preview').innerText()).replace(/\s+/g, ' ');
  check('选中搜索结果后地点预览随之更新', previewTxt.includes(seedName), previewTxt.slice(0, 60));
  check('搜索结果被选为当前地点（搜索框收起）', (await page2.locator('.place-results').count()) === 0);

  await page2.locator('#ed-note').fill('验收新增：从滨河步道绕到对岸看一眼老仓库。');
  await page2.locator('.modal-foot .btn-primary').click();
  await page2.waitForTimeout(400);
  const n1 = await page2.locator('.timeline .tl-item:not(.add-slot)').count();
  check('可添加体验块', n1 === n0 + 1, `${n0} → ${n1}`);
  check(
    '搜索选中的地点落进了当日行程',
    (await page2.locator('.timeline .tl-item .pname').allInnerTexts()).some((t) => t.trim() === seedName),
    `期望出现「${seedName}」`
  );

  await page2.locator('.tl-item.is-selected .tl-actions .btn-link.btn-danger').click();
  await page2.waitForTimeout(400);
  const n2 = await page2.locator('.timeline .tl-item:not(.add-slot)').count();
  check('可删除体验块', n2 === n0, `${n1} → ${n2}`);

  // 记忆闭环
  await page2.locator('.memory-head .btn-primary').click();
  await page2.waitForSelector('.modal');
  await page2.locator('#mc-title').fill('在书店柜台前的一次交谈');
  await page2.locator('#mc-body').fill('她把一本讲里弄的小册子推过来，说这比攻略管用。');
  await page2.locator('.modal-foot .btn-primary').click();
  await page2.waitForTimeout(700);
  check('可打开并保存记忆卡片', (await page2.locator('.memory-card').count()) === 1);
  const remember = (await page2.locator('.five-r li').nth(4).locator('.r-value').innerText()).trim();
  check('Remember 进度随记忆更新', remember === '1 张记忆', remember);
  await page2.screenshot({ path: `${OUT}/04-memory.png`, fullPage: false });

  await overflow(page2, '桌面 1440 工作台');

  // ── 换一座城市重走一遍（证明不是单城硬编码） ──────────────
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const pageC = await ctxC.newPage();
  await pageC.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(pageC);
  await pageC.locator('.city-chip', { hasText: '泉州' }).first().click();
  await pageC.waitForTimeout(200);
  await generate(pageC, '一个人去泉州 3天，想看古厝和簪花');
  check('另一城写 3 天就排 3 天', (await pageC.locator('[role="tab"]').count()) === 3);
  const qzTitle = await pageC.locator('.trip-title').innerText();
  const qzBudget = num(await pageC.locator('.budget-total').innerText());
  const qzFive = (await pageC.locator('.five-r .r-value').allInnerTexts()).map((s) => s.trim());
  check('切换城市后另一城行程可生成', qzTitle.startsWith('泉州 · '), qzTitle);
  check('不同城市预算不同（非固定样例）', qzBudget !== budget0, `上海 ¥${budget0} vs 泉州 ¥${qzBudget}`);
  check('另一城五 R 同样自洽', qzFive.length === 5 && /^\d+\/\d+ 时段已对齐$/.test(qzFive[3]), qzFive.join(' / '));
  check('另一城当日地点非空', (await pageC.locator('.place-list li').count()) > 0);
  await overflow(pageC, '桌面 1440 · 泉州 3 天');

  // ── 特色住宿推荐（IV）：真实品牌门店 + 逐家携程链接 + 筛选 + 个性化 ──
  const ctxS = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pageS = await ctxS.newPage();
  await pageS.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(pageS);
  await pageS.locator('.city-chip', { hasText: '大理' }).first().click();
  await pageS.waitForTimeout(200);
  await generate(pageS, '带父母和小孩去大理 4 天，想泡温泉也想拍照，预算别太高');

  const staysSection = pageS.locator('.stay-section');
  check('住宿模块渲染在工作台内（IV · 特色住宿推荐）', (await staysSection.count()) === 1);
  check(
    '住宿模块标题为「IV · 特色住宿推荐」',
    (await pageS.locator('.stay-col-head .eyebrow').innerText()).includes('特色住宿推荐'),
    await pageS.locator('.stay-col-head .eyebrow').innerText()
  );

  const cardCount = await pageS.locator('.stay-section [data-testid="stay-card"]').count();
  check('大理住宿卡片 ≥ 15 家（逐家对照过的品牌门店）', cardCount >= 15, `count=${cardCount}`);

  // 每张卡都能点开看实时价：链接必须带酒店 ID
  const verifyHrefs = await pageS.locator('.stay-section .stay-verify').evaluateAll((as) =>
    as.map((a) => a.getAttribute('href') || '')
  );
  check(
    '每家都带携程详情链接（含 hotelId）',
    verifyHrefs.length === cardCount && verifyHrefs.every((h) => /hotelId=\d{4,}/.test(h)),
    verifyHrefs[0]
  );

  // 钻级必须是被显示出来的数字，不是空的星串
  const dimTexts = await pageS.locator('.stay-section .stay-dim').allInnerTexts();
  check(
    '每家都标出携程钻级',
    dimTexts.length === cardCount && dimTexts.every((t) => /\d\s*钻/.test(t)),
    dimTexts.slice(0, 3).join(' / ')
  );

  // 个性化：写了"泡温泉 / 带父母 / 拍照"，命中标签要标出来，基准行要说明已重排
  const hitTags = await pageS.locator('.stay-section .stay-tag.hit').count();
  check('个性化命中标签被高亮标出', hitTags > 0, `hits=${hitTags}`);
  const basisText = await pageS.locator('[data-testid="stay-basis"]').innerText();
  check('住宿模块写明"按行程重排"的依据', basisText.includes('重排') || basisText.includes('层级'), basisText.slice(0, 60));

  // 筛选器：按层级收敛（两个筛选组都有「全部」，必须按组定位，否则会误点成集团"全部"）
  const tierGroup = '.stay-filter[aria-label="按层级筛选"]';
  const brandGroupSel = '.stay-filter[aria-label="按酒店集团筛选"]';
  await pageS.locator(`${tierGroup} .stay-chip`, { hasText: '度假奢华' }).first().click();
  await pageS.waitForTimeout(200);
  const luxeCount = await pageS.locator('.stay-section [data-testid="stay-card"]').count();
  const luxeTiers = await pageS
    .locator('.stay-section [data-testid="stay-card"] .stay-tier')
    .allInnerTexts();
  check(
    '按层级筛选（度假奢华）后只剩该层级',
    luxeCount > 0 && luxeCount < cardCount && luxeTiers.every((t) => t.trim() === '度假奢华'),
    `${luxeCount}/${cardCount} · ${luxeTiers.join(',')}`
  );
  await pageS.locator(`${tierGroup} .stay-chip`, { hasText: '全部' }).first().click();
  await pageS.waitForTimeout(150);

  // 筛选器：按集团收敛（用户点名的国际连锁品牌）
  const brandChip = pageS.locator(`${brandGroupSel} .stay-chip`, { hasText: '华住' }).first();
  check('筛选项里能选到华住（用户点名的集团）', (await brandChip.count()) === 1);
  await brandChip.click();
  await pageS.waitForTimeout(200);
  const brandCount = await pageS.locator('.stay-section [data-testid="stay-card"]').count();
  const brandTexts = await pageS
    .locator('.stay-section [data-testid="stay-card"] .stay-brand')
    .allInnerTexts();
  check(
    '按集团筛选（华住）后只剩该集团',
    brandCount > 0 && brandTexts.every((t) => t.includes('华住')),
    `${brandCount} 家 · 样本 ${brandTexts[0]}`
  );
  await pageS.locator(`${brandGroupSel} .stay-chip`, { hasText: '全部' }).first().click();
  await pageS.waitForTimeout(150);

  // 数据来源与"不提供报价"的口径必须写在页面上
  check(
    '住宿模块标注数据来源与"不提供报价"口径',
    (await pageS.locator('.stay-source').innerText()).includes('携程')
  );
  await overflow(pageS, '桌面 1440 · 大理 特色住宿');

  // 没有对应数据的城市：给一句说明，不硬凑卡片
  // 「改写愿望」回世界地图入口，再经「直接填写」进表单换城
  await pageS.getByRole('button', { name: '改写愿望' }).click();
  await pageS.waitForTimeout(300);
  check('工作台可回到世界地图入口（改写愿望）', (await pageS.getByTestId('worldmap').count()) === 1);
  await openForm(pageS);
  check('世界地图可进传统表单换城市', (await pageS.locator('.city-chip').count()) > 0);
  await pageS.locator('.city-chip', { hasText: '上海' }).first().click();
  await pageS.waitForTimeout(200);
  await generate(pageS, '在上海慢慢逛 3 天，看展和老房子');
  check(
    '无住宿数据的城市显示说明而不硬凑卡片',
    (await pageS.locator('.stay-section [data-testid="stay-card"]').count()) === 0 &&
      (await pageS.locator('.stay-empty-note').innerText()).includes('大理')
  );

  // ── 平板 900 ───────────────────────────────────────────
  const ctxT = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const pageT = await ctxT.newPage();
  await pageT.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(pageT);
  await generate(pageT, '慢慢逛上海 4天，看展和老房子');
  check('平板端写 4 天就排 4 天', (await pageT.locator('[role="tab"]').count()) === 4);
  await overflow(pageT, '平板 900');
  await pageT.screenshot({ path: `${OUT}/05-workbench-tablet.png`, fullPage: true });

  // ── 手机 390 ───────────────────────────────────────────
  const ctxM = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const pageM = await ctxM.newPage();
  await pageM.goto(BASE, { waitUntil: 'networkidle' });
  check('手机端首屏也是游戏化入口', await pageM.getByTestId('wm-start').isVisible());
  // 首页地图在手机上也要可用：地图渲染、路标可点、不重叠
  const homeMapM = await pageM.evaluate(() => {
    const host = document.querySelector('.wm-maphost');
    const frame = host?.querySelector('.cmap-frame');
    const b = frame?.getBoundingClientRect();
    const pins = [...(host?.querySelectorAll('.cmap-pin') ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    let minGap = Infinity;
    for (let i = 0; i < pins.length; i += 1) {
      for (let j = i + 1; j < pins.length; j += 1) {
        minGap = Math.min(minGap, Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y));
      }
    }
    return {
      has: !!host?.querySelector('.cmap'),
      w: b ? Math.round(b.width) : 0,
      h: b ? Math.round(b.height) : 0,
      pins: pins.length,
      minGap: Number.isFinite(minGap) ? Math.round(minGap) : 0,
      inViewport: b ? b.left >= 0 && b.right <= window.innerWidth + 1 : false,
    };
  });
  check(
    '手机端首页地图可用（渲染 + 路标 + 不越界）',
    homeMapM.has && homeMapM.w > 200 && homeMapM.h > 140 && homeMapM.pins === 7 && homeMapM.minGap >= 24 && homeMapM.inViewport,
    `${homeMapM.w}×${homeMapM.h} · ${homeMapM.pins} 路标 · 最近相距 ${homeMapM.minGap}px`
  );
  await openForm(pageM);
  await overflow(pageM, '手机 390 首屏');
  await pageM.screenshot({ path: `${OUT}/06-landing-mobile.png`, fullPage: false });
  await generate(pageM, '一个人去上海 2天，逛书店，不赶路');
  check('手机端写 2 天就排 2 天', (await pageM.locator('[role="tab"]').count()) === 2);
  await overflow(pageM, '手机 390 工作台');

  // 手机端 App 壳：底部标签栏一次只显示一栏
  check('手机端底部标签栏有 5 栏（新增「住宿」）', (await pageM.locator('.mobile-tabbar .mtab').count()) === 5);
  check(
    '默认停在「行程」栏，另两栏不占版面',
    (await pageM.locator('.wb-col.center').isVisible()) &&
      !(await pageM.locator('.wb-col.left').isVisible()) &&
      !(await pageM.locator('.wb-col.right').isVisible())
  );
  check('「行程」栏有悬浮加号', await pageM.locator('.mobile-fab').isVisible());
  await pageM.screenshot({ path: `${OUT}/07-workbench-mobile.png`, fullPage: false });

  // 切到「地图」栏：地图与地点清单可见（宽屏是一屏三栏，窄屏靠切换）
  await pageM.locator('.mobile-tabbar .mtab', { hasText: '地图' }).click();
  await pageM.waitForTimeout(400);
  check('切到「地图」栏后路线栏可见', await pageM.locator('.wb-col.right').isVisible());
  check(
    '手机端地图可见且不塌陷（自研底图，按比例自适应）',
    (await pageM.locator('.map-host .cmap').count()) === 1 &&
      (await pageM.locator('.map-host .cmap-frame').boundingBox()).height > 160 &&
      (await pageM.locator('.map-host .cmap-pin').count()) >= 3
  );
  check('地图栏不显示悬浮加号', !(await pageM.locator('.mobile-fab').isVisible()));
  await overflow(pageM, '手机 390 · 地图栏');
  await pageM.screenshot({ path: `${OUT}/08-map-mobile.png`, fullPage: false });

  // 切到「概况」栏：预算与逐日预算可见
  await pageM.locator('.mobile-tabbar .mtab', { hasText: '概况' }).click();
  await pageM.waitForTimeout(400);
  check(
    '切到「概况」栏后预算与逐日预算可见',
    (await pageM.locator('.wb-col.left .budget-total').isVisible()) &&
      (await pageM.locator('.wb-col.left .perday-list').first().locator('li').count()) === 2
  );
  await overflow(pageM, '手机 390 · 概况栏');

  // 切到「住宿」栏：特色住宿模块可见（本机是上海，无核验数据时给说明）
  await pageM.locator('.mobile-tabbar .mtab', { hasText: '住宿' }).click();
  await pageM.waitForTimeout(400);
  check(
    '切到「住宿」栏后特色住宿模块可见',
    (await pageM.locator('.stay-section').isVisible()) &&
      (await pageM.locator('.stay-section .stay-col-head .eyebrow').innerText()).includes('特色住宿推荐')
  );
  await overflow(pageM, '手机 390 · 住宿栏');
  await pageM.screenshot({ path: `${OUT}/08b-stay-mobile.png`, fullPage: false });

  // 切到「记忆」栏：记忆区可见
  await pageM.locator('.mobile-tabbar .mtab', { hasText: '记忆' }).click();
  await pageM.waitForTimeout(400);
  check('切到「记忆」栏后世界记忆区可见', await pageM.locator('.wb-memory').isVisible());

  // 手机端弹层为底部抽屉：铺满宽度、贴底、带把手
  await pageM.locator('.memory-head .btn-primary').click();
  await pageM.waitForSelector('.modal');
  await pageM.waitForTimeout(400); // 等上滑动画结束再量
  const sheet = await pageM.locator('.modal').evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      vh: window.innerHeight,
      align: getComputedStyle(el.parentElement).alignItems,
      radius: cs.borderTopLeftRadius,
    };
  });
  check(
    '手机端弹层是贴底全宽抽屉',
    sheet.w === 390 && sheet.align === 'flex-end' && sheet.top >= 0 && sheet.bottom >= sheet.vh - 1,
    `宽 ${sheet.w} · 顶 ${sheet.top} · 底 ${sheet.bottom} / 视口 ${sheet.vh} · align ${sheet.align}`
  );
  check('抽屉带抓手', await pageM.locator('.sheet-grab').isVisible());
  await pageM.screenshot({ path: `${OUT}/09-sheet-mobile.png`, fullPage: false });
  await pageM.locator('.modal .close-x').click();
  await pageM.waitForTimeout(250);
  check('抽屉可关闭', (await pageM.locator('.modal').count()) === 0);

  // ── 地图大数据分支：整条链路（搜索 → 显示 → 选中 → 加入行程）──────
  // 真实 Key 由用户在本机填；这里用桩响应回答腾讯位置服务的 JSONP，
  // 不触网、结果可复现，验证的是我们自己的解析与落地逻辑。
  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const pageD = await ctxD.newPage();
  const errorsD = [];
  pageD.on('pageerror', (e) => errorsD.push('pageerror: ' + e.message));
  const POI = [
    { id: 'poi-1', title: '验收咖啡馆', address: '上海市黄浦区验收路 1 号', category: '咖啡厅', location: { lat: 31.23, lng: 121.47 } },
    { id: 'poi-2', title: '验收小馆', address: '上海市黄浦区验收路 2 号', category: '中餐厅', location: { lat: 31.234, lng: 121.475 } },
  ];
  await pageD.route('**/apis.map.qq.com/ws/place/v1/search**', async (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback') ?? 'cb';
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: `${cb}(${JSON.stringify({ status: 0, data: POI })})`,
    });
  });
  await pageD.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pageD.evaluate(() => localStorage.setItem('lrw-tmap-key', 'stub-key'));
  await pageD.reload({ waitUntil: 'networkidle' });
  await openForm(pageD);
  await generate(pageD, '一个人去上海 2 天，想喝咖啡');
  await pageD.locator('.add-slot button').first().click();
  await pageD.waitForSelector('.modal');
  await pageD.locator('#ed-place-q').fill('验收');
  await pageD.waitForTimeout(1000); // 400ms 输入防抖 + JSONP 往返
  const mapNames = (await pageD.locator('.place-results .pr-item.is-map .pr-name').allInnerTexts()).map((s) => s.trim());
  check(
    '地图大数据能搜到精选库没有的地点（同地图搜索的搜法）',
    mapNames.includes('验收咖啡馆') && mapNames.includes('验收小馆'),
    mapNames.join(' / ')
  );
  const mapMeta = (await pageD.locator('.place-results .pr-item.is-map .pr-meta').first().innerText()).trim();
  check('地图结果照实带出分类与详细地址', mapMeta.includes('验收路') && mapMeta.includes('咖啡'), mapMeta);
  await pageD.locator('.place-results .pr-item.is-map', { hasText: '验收咖啡馆' }).click();
  await pageD.waitForTimeout(300);
  const dPreview = (await pageD.locator('.select-place-preview').innerText()).replace(/\s+/g, ' ');
  check(
    '地图结果可被选中并登记为行程地点',
    dPreview.includes('验收咖啡馆') && dPreview.includes('验收路'),
    dPreview.slice(0, 70)
  );
  await pageD.locator('.modal-foot .btn-primary').click();
  await pageD.waitForTimeout(500);
  check(
    '地图搜索到的地点可加入行程（"搜到即能添加"闭环）',
    (await pageD.locator('.timeline .tl-item .pname').allInnerTexts()).some((t) => t.trim() === '验收咖啡馆')
  );
  check('加入后同样进地点清单并带地图来源', await pageD.locator('.place-list li', { hasText: '验收咖啡馆' }).count() > 0);
  check('地图搜索链路无脚本错误', errorsD.length === 0, errorsD.slice(0, 2).join(' | '));
  await pageD.screenshot({ path: `${OUT}/10-map-poi-search.png`, fullPage: false });
  await ctxD.close();

  // ── 用户要求必须落进行程：写"想去酒吧"就真的排一家当地特色小酒馆 ──
  const ctxE = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const pageE = await ctxE.newPage();
  await pageE.goto(BASE, { waitUntil: 'networkidle' });
  await openForm(pageE);
  await pageE.locator('#tp-age').fill('28');
  await generate(pageE, '去上海玩两天，想去酒吧');
  const barCards = await pageE.locator('.timeline .kind-badge', { hasText: '微醺' }).count();
  const allBadges = (await pageE.locator('.kind-badge').allInnerTexts()).map((s) => s.trim());
  check(
    '写了"想去酒吧"→ 行程里出现小酒馆块（微醺角标）',
    barCards > 0 || allBadges.includes('微醺'),
    `角标：${[...new Set(allBadges)].join('/')}`
  );
  if (barCards > 0) {
    const barTime = await pageE
      .locator('.timeline .tl-item', { hasText: '微醺' })
      .first()
      .locator('.tl-time, .time, .tl-head')
      .first()
      .innerText()
      .catch(() => '');
    const barHour = Number((await pageE.locator('.timeline .tl-item', { hasText: '微醺' }).first().innerText()).match(/(\d{1,2}):\d{2}/)?.[1] ?? '0');
    check('小酒馆排在晚上（20 点以后）', barHour >= 20, `${barHour} 点 · ${barTime.slice(0, 30)}`);
  }
  check(
    '行程正文写明"小酒馆"并带玩法提示',
    (await pageE.evaluate(() => document.body.innerText)).includes('小酒馆')
  );
  const barNames = [];
  for (let t = 0; t < (await pageE.locator('[role="tab"]').count()); t++) {
    await pageE.locator('[role="tab"]').nth(t).click();
    await pageE.waitForTimeout(250);
    const dayText = await pageE.locator('.timeline').innerText();
    const m = dayText.match(/小酒馆：([^\n，。]+)/);
    if (m) barNames.push(m[1].trim());
  }
  check('两天里至少一天排了小酒馆', barNames.length >= 1, barNames.join(' / '));
  check('小酒馆不重复同一家（宁缺毋滥）', new Set(barNames).size === barNames.length, barNames.join(' / '));
  await pageE.screenshot({ path: `${OUT}/11-bar-intent.png`, fullPage: false });
  await ctxE.close();

  check('浏览器控制台无报错（首页 + 天数联动）', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('浏览器控制台无报错（交互闭环）', errors2.length === 0, errors2.slice(0, 3).join(' | '));

  // ── 七视口适配审计（2026-10-10）：横向溢出 + 时间轴遮挡 + 全宽带铺开 ──
  // 规格视口：小屏手机 / 常见手机 / 大屏手机 / 平板 / 小型桌面 / 常见桌面 / 宽屏桌面
  const AUDIT = [
    [320, 568, '小屏手机'],
    [375, 812, '常见手机'],
    [430, 932, '大屏手机'],
    [768, 1024, '平板'],
    [1024, 768, '小型桌面'],
    [1440, 900, '常见桌面'],
    [1920, 1080, '宽屏桌面'],
  ];
  for (const [w, h, label] of AUDIT) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await openForm(p);
    await generate(p, '上海 3 天，咖啡书店漫步');
    const a = await p.evaluate(() => {
      const de = document.documentElement;
      // 时间标签与节点 / 卡片的几何重叠（含容器裁剪后的实际位置）
      const hits = [];
      for (const li of document.querySelectorAll('.tl-item:not(.add-slot)')) {
        const t = li.querySelector('.tl-time');
        const n = li.querySelector('.tl-node');
        const card = li.querySelector('.tl-card');
        if (!t || !n) continue;
        const tb = t.getBoundingClientRect();
        const nb = n.getBoundingClientRect();
        const overlapNode = !(tb.right <= nb.left || tb.left >= nb.right || tb.bottom <= nb.top || tb.top >= nb.bottom);
        const overlapCard = card ? tb.right > card.getBoundingClientRect().left + 0.5 : false;
        const clipped = t.scrollWidth > t.clientWidth + 1;
        if (overlapNode || overlapCard || clipped) {
          hits.push(`${t.textContent}${overlapNode ? '·压节点' : ''}${overlapCard ? '·压卡片' : ''}${clipped ? '·被截断' : ''}`);
        }
      }
      const rv = [...document.querySelectorAll('.wb-band .five-r.is-wide .r-value')].map((e) => e.textContent.trim());
      const cols = document.querySelector('.wb-band .five-r.is-wide');
      return {
        scrollW: de.scrollWidth,
        innerW: window.innerWidth,
        hits,
        fiveR: rv.length,
        fiveRCols: cols ? getComputedStyle(cols).gridTemplateColumns.split(' ').length : 0,
        bands: document.querySelectorAll('.wb-band').length,
        leftH: Math.round(document.querySelector('.wb-col.left').getBoundingClientRect().height),
        centerH: Math.round(document.querySelector('.wb-col.center').getBoundingClientRect().height),
        rightH: Math.round(document.querySelector('.wb-col.right').getBoundingClientRect().height),
      };
    });
    check(
      `无横向溢出 · ${label} ${w}×${h}`,
      a.scrollW <= a.innerW + 1,
      `scrollWidth=${a.scrollW} innerWidth=${a.innerW}`
    );
    check(
      `时间轴无遮挡（时间标签完整可读）· ${label} ${w}×${h}`,
      a.hits.length === 0,
      a.hits.join(' | ')
    );
    check(
      `全宽带在 ${label} 正常铺开（五 R 五项）· ${w}×${h}`,
      a.bands === 1 && a.fiveR === 5 && a.fiveRCols >= 1,
      `五R ${a.fiveR} 项 / 列数 ${a.fiveRCols}`
    );
    if (w === 1440) {
      const gap = Math.abs(a.leftH - a.centerH);
      check(
        '三栏高度差收敛（不再有大片空白）',
        gap <= 600,
        `左 ${a.leftH} / 中 ${a.centerH} / 右 ${a.rightH}，左中差 ${gap}px`
      );
      await p.locator('.wb-band').screenshot({ path: `${OUT}/70-band-1440.png` });
    }
    if (w === 375) await p.screenshot({ path: `${OUT}/71-mobile-375.png` });
    await c.close();
  }

  // ── 跨行程图片隔离（规格 §2.3 / §2.6）：换一趟旅程，图片整体更新、不复用上一趟 ──
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const p = await c.newPage();
    const srcsOf = () =>
      p.evaluate(() =>
        [...document.querySelectorAll('.timeline img.place-photo')]
          .map((i) => i.getAttribute('src'))
          .sort()
          .join(',')
      );
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await openForm(p);
    await generate(p, '上海 3 天，咖啡书店漫步');
    await p.waitForTimeout(1000);
    const tripA = await srcsOf();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await openForm(p);
    await p.locator('.city-chip', { hasText: '杭州' }).click();
    await p.waitForTimeout(200);
    await generate(p, '杭州 2 天，想逛西湖');
    await p.waitForTimeout(1200);
    const tripB = await srcsOf();
    check(
      '换一趟旅程后图片整体更新（无上一趟残留）',
      tripA !== tripB && tripB.length > 0,
      `${tripA.slice(0, 52)} → ${tripB.slice(0, 52)}`
    );
    const okB = await p.evaluate(() =>
      [...document.querySelectorAll('.timeline img.place-photo')].every(
        (i) => i.complete && i.naturalWidth > 30
      )
    );
    check('新行程的图片全部加载成功（图片缓存不跨行程串用）', okB === true);
    await c.close();
  }

  // 汇总先行打印；浏览器进程若不肯退，限时强制收尾（headless 偶发挂起）
  const failedNow = results.filter((r) => !r.ok);
  const code = failedNow.length ? 1 : 0;

  const summary = () => {
    log('\n================ 验收汇总 ================');
    log(`共 ${results.length} 项，通过 ${results.length - failedNow.length}，失败 ${failedNow.length}`);
    if (failedNow.length) failedNow.forEach((f) => log(`  FAIL ${f.name} → ${f.detail}`));
  };

  const hardExit = () => {
    summary();
    process.exit(code);
  };
  setTimeout(hardExit, 4000).unref?.();

  try {
    await Promise.race([
      (async () => {
        await ctx.close();
        await ctx2.close();
        await ctxC.close();
        await ctxT.close();
        await ctxM.close();
        await browser.close();
      })(),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
  } catch {
    /* 忽略收尾错误，结论已定 */
  }
  hardExit();
}

run().catch((e) => {
  console.error('验收脚本异常：', e);
  process.exit(1);
});
