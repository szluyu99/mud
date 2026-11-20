// Build the static single-player site (GitHub Pages) into ./site:
//   site/index.html            game picker
//   site/driver/               FluffOS wasm driver (fluffos.js + fluffos.wasm)
//   site/mudwasm.js            in-browser runtime (web/mudwasm.js)
//   site/<game>/               the game's web client, patched to use MudWasm.Socket
//   site/<game>/mudlib.bin.gz  packed mudlib
// usage: node web/build.mjs [--driver DIR] [--out DIR]
//   DIR defaults: driver = $FLUFFOS_WASM or web/driver ; out = site
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { genWiki } from './wiki/gen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const driverDir = path.resolve(arg('--driver', process.env.FLUFFOS_WASM || path.join(root, 'web/driver')));
const out = path.resolve(arg('--out', path.join(root, 'site')));

export const GAMES = [
  { id: 'es2', config: 'config.es2', title: '东方故事 II', desc: 'ES2 经典武侠，众多武侠 MUD 的母本' },
  { id: 'jy', config: 'config.jy', title: '金庸群侠传', desc: '金庸小说人物与门派' },
  { id: 'xyj', config: 'config.xyj', title: '西游记 2006', desc: '西游神魔世界，数据最大，首次加载较慢' },
  { id: 'zjmud', config: 'config.zj', title: '书剑江湖', desc: '指间争锋 MUD，图形按钮界面', zj: true, wiki: true },
  { id: 'zjmudhell', config: 'config.zj', title: '指尖MUD', desc: '指间协议，地狱家族地图，图形按钮界面', zj: true },
  { id: 'zjdyzj', config: 'config.zj', title: '终极地狱·指间版', desc: '地狱无门，投胎转世选品质，图形按钮界面', zj: true },
  { id: 'shujian3', config: 'config.zj', title: '书剑3', desc: '独立书剑代码，副本与帮会，图形按钮界面', zj: true },
  { id: 'dtxyzjb', config: 'config.zj', title: '大唐西游·指间版', desc: '西游题材指间版，数据较大，图形按钮界面', zj: true },
];

for (const f of ['fluffos.js', 'fluffos.wasm']) {
  if (!fs.existsSync(path.join(driverDir, f))) {
    console.error(`missing ${f} in ${driverDir}; download the wasm driver first (see README.md 浏览器单机版)`);
    process.exit(1);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'driver'), { recursive: true });
for (const f of ['fluffos.js', 'fluffos.wasm']) fs.copyFileSync(path.join(driverDir, f), path.join(out, 'driver', f));
fs.copyFileSync(path.join(root, 'web/mudwasm.js'), path.join(out, 'mudwasm.js'));
fs.copyFileSync(path.join(root, 'web/minimap.js'), path.join(out, 'minimap.js'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const head = (g) =>
  `<script src="../driver/fluffos.js"></script>\n<script src="../mudwasm.js"></script>\n` +
  `<script>MudWasm.start({ game: ${JSON.stringify(g.id)}, config: ${JSON.stringify(g.config)} });</script>\n`;

// ---------- PWA: per-game manifest + icons + head tags ----------
// Each game is its own installable app (own home-screen icon, opens straight into
// that game). start_url/scope are relative to the manifest, so the site works under
// any path (GitHub Pages serves it at /mud/).
const ICONS = path.join(root, 'web/icons');
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
for (const f of fs.readdirSync(ICONS)) if (f.endsWith('.png')) fs.copyFileSync(path.join(ICONS, f), path.join(out, 'icons', f));

function writeManifest(dir, id, name, shortName, iconBase) {
  fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify({
    name, short_name: shortName, lang: 'zh-CN',
    start_url: './', scope: './', display: 'standalone', orientation: 'any',
    background_color: '#000000', theme_color: '#000000',
    icons: [192, 512].map((n) => ({ src: `${iconBase}icons/${id}-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any maskable' })),
  }, null, 2));
}
const pwaHead = (id, title, iconBase) =>
  `<link rel="manifest" href="manifest.webmanifest">\n` +
  `<meta name="theme-color" content="#000000">\n` +
  `<meta name="apple-mobile-web-app-capable" content="yes">\n` +
  `<meta name="mobile-web-app-capable" content="yes">\n` +
  `<meta name="apple-mobile-web-app-status-bar-style" content="black">\n` +
  `<meta name="apple-mobile-web-app-title" content="${title}">\n` +
  `<link rel="apple-touch-icon" href="${iconBase}icons/${id}-180.png">\n`;
// insert right after <head>; drop the game's own duplicates of the same tags first
function addPwaHead(html, g) {
  html = html.replace(/\s*<meta name="apple-mobile-web-app-(capable|status-bar-style)"[^>]*>/g, '');
  if (!/<head>/i.test(html)) throw new Error(g.id + ': <head> not found');
  return html.replace(/<head>/i, (m) => m + '\n' + pwaHead(g.id, g.title, '../'));
}

const toolbar = `
<style>
#mudwasm-bar button{width:auto;min-width:44px;height:24px;margin:0 0 0 4px;padding:0 8px;font:12px sans-serif;color:#ccc;background:rgba(40,40,40,.85);border:1px solid rgba(150,150,150,.4);border-radius:4px}
#mudwasm-panel button{margin:2px 0 0 4px}
</style>
<div id="mudwasm-bar" style="position:fixed;right:4px;top:4px;z-index:9999;font:12px sans-serif;opacity:.85;text-align:right">
  <!--WIKIBTN--><button onclick="var p=document.getElementById('mudwasm-panel');p.style.display=p.style.display=='none'?'block':'none'" title="存档 / 换游戏">存档</button>
  <div id="mudwasm-panel" style="display:none;margin-top:2px;background:#222;padding:3px;border-radius:3px">
  <button onclick="MudWasm.exportSave()" title="下载存档文件">导出存档</button>
  <label style="cursor:pointer"><input type="file" accept=".json" style="display:none" onchange="this.files[0]&&MudWasm.importSave(this.files[0])"><button onclick="this.previousElementSibling.click()" title="从文件恢复存档">导入存档</button></label>
  <button onclick="MudWasm.resetSave()" title="清除本浏览器中的存档">重置</button>
  <button onclick="var w=document.getElementById('mudwasm-wiz');w.style.display=w.style.display=='none'?'block':'none'" title="把某个角色设为巫师（单机测试用）">巫师</button>
  <a href="../" style="color:#9cf;margin-left:4px">换游戏</a>
  <div id="mudwasm-wiz" style="display:none;margin-top:3px;color:#ddd">
  角色ID <input id="mudwasm-wiz-id" size="8" placeholder="英文账号">
  <select id="mudwasm-wiz-level"><option>admin</option><option>arch</option><option>wizard</option><option>apprentice</option><option>immortal</option><option value="">取消巫师</option></select>
  <button id="mudwasm-wiz-ok" onclick="MudWasm.setWizard(document.getElementById('mudwasm-wiz-id').value,document.getElementById('mudwasm-wiz-level').value)">确定</button>
  </div>
  </div>
</div>`;

function patchTerminalClient(html, g) {
  const rep = (from, to) => {
    if (!html.includes(from)) throw new Error(`${g.id}: pattern not found: ${from}`);
    html = html.split(from).join(to);
  };
  rep('this.ws = new WebSocket(wsUrl, protocols);', 'this.ws = new MudWasm.Socket();');
  rep('<script src="vendor/xterm.js"></script>', head(g) + '<script src="vendor/xterm.js"></script>');
  rep('</body>', toolbar + '\n</body>');
  return addPwaHead(html, g);
}

function patchZjmud(dir, g) {
  // sockshim.js: replace the WebSocket with MudWasm.Socket
  const f = path.join(dir, 'sockshim.js');
  let s = fs.readFileSync(f, 'utf8');
  const from = "var ws = new WebSocket(url, ['telnet']);";
  if (!s.includes(from)) throw new Error(g.id + ': sockshim pattern not found');
  s = s.replace(from, 'var ws = new MudWasm.Socket();');
  fs.writeFileSync(f, s);
  const fi = path.join(dir, 'index.html');
  let html = fs.readFileSync(fi, 'utf8');
  if (!html.includes('<script src="sockshim.js"></script>')) throw new Error(g.id + ': index pattern not found');
  html = html.replace('<script src="sockshim.js"></script>', head(g) + '<script src="sockshim.js"></script>');
  html = html.replace('</body>', toolbar + '\n</body>');
  // 小地图：挂在客户端的 writeToST / writeToEX 上，必须在 main.js 之后加载
  if (!html.includes('<script src="main.js" ></script>')) throw new Error(g.id + ': main.js tag not found');
  html = html.replace('<script src="main.js" ></script>', '<script src="main.js" ></script>\n  <script src="../minimap.js"></script>');
  html = addPwaHead(html, g);
  // 百科：工具栏上和「存档」并排的按钮（游戏里打开浮层；浮层不可用时去百科页面）
  html = html.replace('<!--WIKIBTN-->', g.wiki
    ? '<button onclick="if(!(window.MudMiniMap&&MudMiniMap.wiki&&MudMiniMap.wiki(\'\')))location.href=\'../wiki/?g=' + g.id + '\'" title="查武功、师父、物品、地点">百科</button>' : '');
  fs.writeFileSync(fi, html);
}

for (const g of GAMES) {
  const dst = path.join(out, g.id);
  fs.cpSync(path.join(root, 'games', g.id, 'www'), dst, { recursive: true });
  for (const junk of ['AGENTS.md', 'README.md', 'wasm']) fs.rmSync(path.join(dst, junk), { recursive: true, force: true });
  writeManifest(dst, g.id, g.title + ' · 单机版', g.title, '../');
  if (g.zj) patchZjmud(dst, g);
  else {
    const fi = path.join(dst, 'index.html');
    fs.writeFileSync(fi, patchTerminalClient(fs.readFileSync(fi, 'utf8'), g));
  }
  execFileSync(process.execPath, [path.join(root, 'web/pack.mjs'), path.join(root, 'games', g.id, 'mudlib'), path.join(dst, 'mudlib.bin.gz')], { stdio: 'inherit' });
}

// ---------- offline wiki: data read out of the running mudlib (web/wiki/gen.mjs) ----------
{
  const wdir = path.join(out, 'wiki');
  fs.mkdirSync(wdir, { recursive: true });
  for (const f of ['wiki.js', 'wiki.css']) fs.copyFileSync(path.join(root, 'web/wiki', f), path.join(wdir, f));
  const list = [];
  for (const g of GAMES.filter((x) => x.wiki)) {
    const t0 = Date.now();
    const data = await genWiki({ driverDir, mudlibDir: path.join(root, 'games', g.id, 'mudlib'), config: g.config, title: g.title });
    fs.writeFileSync(path.join(wdir, g.id + '.json'), JSON.stringify(data));
    list.push({ id: g.id, title: g.title });
    console.log(`wiki ${g.id}: ${Object.keys(data.skills).length} skills, ${Object.keys(data.npcs).length} npcs, ${Object.keys(data.items).length} items, ${Object.keys(data.rooms).length} rooms (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  const html = fs.readFileSync(path.join(root, 'web/wiki/index.html'), 'utf8')
    .replace('<!--__HEAD__-->', pwaHead('index', '游戏百科', '../').replace('href="manifest.webmanifest"', 'href="../manifest.webmanifest"') +
      `<script>window.WIKI_GAMES = ${JSON.stringify(list)};</script>`);
  fs.writeFileSync(path.join(wdir, 'index.html'), html);
}

const cards = GAMES.map((g) => `    <a class="card" href="${g.id}/"><h2>${g.title}</h2><p>${g.desc}</p></a>`).join('\n');
const wikiLinks = GAMES.filter((g) => g.wiki).map((g) => `<a href="wiki/?g=${g.id}">${g.title}</a>`).join('、');
fs.writeFileSync(path.join(out, 'index.html'), `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${pwaHead('index', '中文MUD', '')}<title>中文 MUD 单机版</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #ddd; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .card { display: block; padding: 16px; border: 1px solid #333; border-radius: 8px; color: inherit; text-decoration: none; background: #1a1a1a; }
  .card:hover { border-color: #6af; }
  .card h2 { margin: 0 0 6px; font-size: 18px; color: #9cf; }
  .card p { margin: 0; font-size: 13px; color: #aaa; }
  .wiki { margin-top: 18px; padding: 12px 16px; border: 1px solid #2c3c4c; border-radius: 8px; background: #161c22; font-size: 14px; }
  footer { margin-top: 32px; font-size: 12px; color: #777; line-height: 1.6; }
  a { color: #9cf; }
</style>
</head>
<body>
<main>
  <h1>中文 MUD 单机版</h1>
  <p>游戏服务器（FluffOS 驱动，编译成 WebAssembly）直接运行在你的浏览器里，不需要联网服务器。存档保存在本浏览器的 IndexedDB 中，可以在游戏页右下角导出、导入。</p>
  <div class="grid">
${cards}
  </div>
  <div class="wiki">离线百科：${wikiLinks}。查武功、师父、物品、地点和走法，不用进游戏，没网也能看。</div>
  <footer>
    单机模式下只有你一个玩家，聊天频道没有其他人。清除浏览器数据会删除存档，请定期导出。<br>
    手机上可以「添加到主屏幕」：之后像 App 一样全屏打开，玩过的游戏没网也能玩；在 iPhone 上这样还能避免 Safari 长时间不访问后自动清掉存档。<br>
    源码与说明：<a href="https://github.com/szluyu99/mud">github.com/szluyu99/mud</a>。游戏 mudlib 版权归原作者所有。
  </footer>
</main>
</body>
</html>
`);
writeManifest(out, 'index', '中文 MUD 单机版', '中文MUD', '');
// the picker registers the worker too, so installing from the picker caches the shared files
{
  const fi = path.join(out, 'index.html');
  fs.writeFileSync(fi, fs.readFileSync(fi, 'utf8').replace('</body>',
    `<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});` +
    `if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(function(){});</script>\n</body>`));
}

// ---------- service worker with a content-hash manifest ----------
const manifest = {};
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(p, r);
    else if (e.isFile() && r !== 'sw.js' && r !== '.nojekyll') manifest[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
  }
})(out, '');
fs.writeFileSync(path.join(out, 'sw.js'),
  fs.readFileSync(path.join(root, 'web/sw.js'), 'utf8').replace('__MANIFEST__', JSON.stringify(manifest)));
console.log('service worker covers', Object.keys(manifest).length, 'files');
console.log('site built at', out);
