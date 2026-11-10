// 把 vite 产物内联成一个自包含的单文件 HTML：
// JS 与 CSS 内联，Poppins 字体转 base64 内联。产物可 file:// 直接打开、可转发。
//
// 两个真实的坑，本脚本显式防住：
// 1) String.replace 的字符串替换会解析 $& / $' / $` 等模式。JS 压缩产物里常出现 $&，
//    会把被匹配的原始标签注入到脚本中间 —— 因此一律使用「函数替换」。
// 2) 内联脚本里若出现 </script> 或 <!-- 会提前终止/切换解析状态，必须为 0 才允许内联。
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve('dist');
const OUT_FILE = join(DIST, 'linkr-world.html');
const assetsDir = join(DIST, 'assets');
const files = readdirSync(assetsDir);

const pick = (re, what) => {
  const hit = files.filter((f) => re.test(f));
  if (hit.length === 0) throw new Error(`找不到${what}产物`);
  return hit.map((f) => join(assetsDir, f)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
};

const css = readFileSync(pick(/\.css$/, 'CSS'), 'utf8');
const js = readFileSync(pick(/\.js$/, 'JS'), 'utf8');

const count = (s, re) => (s.match(re) || []).length;
if (count(js, /<\/script/gi) !== 0) throw new Error('JS 产物含 </script>，无法安全内联，已中止。');
if (count(js, /<!--/g) !== 0) throw new Error('JS 产物含 <!--，会触发内联脚本的双重转义状态，已中止。');
if (count(css, /<\/style/gi) !== 0) throw new Error('CSS 产物含 </style>，已中止。');
if (count(css, /<!--/g) !== 0) throw new Error('CSS 产物含 <!--，已中止。');

let shell = readFileSync(join(DIST, 'index.html'), 'utf8');
const linkRe = /<link[^>]*rel="stylesheet"[^>]*>/i;
const scriptRe = /<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/i;
if (!linkRe.test(shell)) throw new Error('未找到样式表引用，产物结构可能已变化。');
if (!scriptRe.test(shell)) throw new Error('未找到入口脚本引用，产物结构可能已变化。');
shell = shell.replace(linkRe, '').replace(scriptRe, '');
if (/<script/i.test(shell) || /rel="stylesheet"/i.test(shell)) {
  throw new Error('外壳中仍有未处理的脚本或样式引用，已中止。');
}

// 内联字体：把 CSS 里的 url() 全部换成 data URI
const MIME = { woff2: 'font/woff2', woff: 'font/woff' };
const inlinedCss = css.replace(
  /url\(\s*([^)\s]+\.(woff2|woff))\s*\)/gi,
  (m, rel) => {
    const base = String(rel).split(/[\\/]/).pop();
    const p = join(assetsDir, base);
    const ext = String(rel).split('.').pop().toLowerCase();
    try {
      return `url(data:${MIME[ext]};base64,${readFileSync(p).toString('base64')})`;
    } catch {
      throw new Error(`字体内联失败：${base}`);
    }
  }
);
if (/url\(\s*[^)]*\.woff/i.test(inlinedCss)) {
  throw new Error('仍有字体未被内联，已中止。');
}

// 关键：一律用函数替换，避免 $& 之类的替换模式
let out = shell.replace('</head>', () => `<style>\n${inlinedCss}\n</style>\n</head>`);
out = out.replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`);

if (!out.includes('<style>') || !out.includes('type="module"')) {
  throw new Error('内联插入失败，已中止。');
}
if (out.split('</script>').length - 1 !== 1) {
  throw new Error('内联后 </script> 数量异常，已中止。');
}

writeFileSync(OUT_FILE, out, 'utf8');
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`✔ 单文件产物 ${OUT_FILE}  体积 ${kb(Buffer.byteLength(out, 'utf8'))}`);

// 同步到 site/ 供静态发布使用（site 目录只有一个 index.html，是发布入口）
const SITE_DIR = resolve('site');
mkdirSync(SITE_DIR, { recursive: true });
writeFileSync(join(SITE_DIR, 'index.html'), out, 'utf8');
console.log(`✔ 发布目录 ${join(SITE_DIR, 'index.html')}`);

// 同步真实照片目录（public/photos → dist/photos → site/photos）
const photosDir = join(DIST, 'photos');
if (existsSync(photosDir)) {
  cpSync(photosDir, join(SITE_DIR, 'photos'), { recursive: true });
  console.log(`✔ 照片目录 ${join(SITE_DIR, 'photos')}`);
}
