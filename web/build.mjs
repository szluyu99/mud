// Build the static single-player site (GitHub Pages) into ./site:
//   site/index.html            game picker
//   site/driver/               FluffOS wasm driver (fluffos.js + fluffos.wasm)
//   site/mudwasm.js            in-browser runtime (web/mudwasm.js)
//   site/<game>/               the game's web client, patched to use MudWasm.Socket
//   site/<game>/mudlib.bin.gz  packed mudlib
// usage: node web/build.mjs [--driver DIR] [--out DIR]
//   DIR defaults: driver = $FLUFFOS_WASM or web/driver ; out = site
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const driverDir = path.resolve(arg('--driver', process.env.FLUFFOS_WASM || path.join(root, 'web/driver')));
const out = path.resolve(arg('--out', path.join(root, 'site')));

export const GAMES = [
  { id: 'es2', config: 'config.es2', title: '东方故事 II', desc: 'ES2 经典武侠，众多武侠 MUD 的母本' },
  { id: 'jy', config: 'config.jy', title: '金庸群侠传', desc: '金庸小说人物与门派' },
  { id: 'xyj', config: 'config.xyj', title: '西游记 2006', desc: '西游神魔世界，数据最大，首次加载较慢' },
  { id: 'zjmud', config: 'config.zj', title: '书剑江湖', desc: '指间争锋 MUD，图形按钮界面', zj: true },
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
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const head = (g) =>
  `<script src="../driver/fluffos.js"></script>\n<script src="../mudwasm.js"></script>\n` +
  `<script>MudWasm.start({ game: ${JSON.stringify(g.id)}, config: ${JSON.stringify(g.config)} });</script>\n`;

const toolbar = `
<div id="mudwasm-bar" style="position:fixed;right:6px;bottom:6px;z-index:9999;font:12px sans-serif;opacity:.75">
  <button onclick="MudWasm.exportSave()" title="下载存档文件">导出存档</button>
  <label style="cursor:pointer"><input type="file" accept=".json" style="display:none" onchange="this.files[0]&&MudWasm.importSave(this.files[0])"><button onclick="this.previousElementSibling.click()" title="从文件恢复存档">导入存档</button></label>
  <button onclick="MudWasm.resetSave()" title="清除本浏览器中的存档">重置</button>
  <a href="../" style="color:#9cf;margin-left:4px">换游戏</a>
</div>`;

function patchTerminalClient(html, g) {
  const rep = (from, to) => {
    if (!html.includes(from)) throw new Error(`${g.id}: pattern not found: ${from}`);
    html = html.split(from).join(to);
  };
  rep('this.ws = new WebSocket(wsUrl, protocols);', 'this.ws = new MudWasm.Socket();');
  rep('<script src="vendor/xterm.js"></script>', head(g) + '<script src="vendor/xterm.js"></script>');
  rep('</body>', toolbar + '\n</body>');
  return html;
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
  fs.writeFileSync(fi, html);
}

for (const g of GAMES) {
  const dst = path.join(out, g.id);
  fs.cpSync(path.join(root, 'games', g.id, 'www'), dst, { recursive: true });
  for (const junk of ['AGENTS.md', 'README.md', 'wasm']) fs.rmSync(path.join(dst, junk), { recursive: true, force: true });
  if (g.zj) patchZjmud(dst, g);
  else {
    const fi = path.join(dst, 'index.html');
    fs.writeFileSync(fi, patchTerminalClient(fs.readFileSync(fi, 'utf8'), g));
  }
  execFileSync(process.execPath, [path.join(root, 'web/pack.mjs'), path.join(root, 'games', g.id, 'mudlib'), path.join(dst, 'mudlib.bin.gz')], { stdio: 'inherit' });
}

const cards = GAMES.map((g) => `    <a class="card" href="${g.id}/"><h2>${g.title}</h2><p>${g.desc}</p></a>`).join('\n');
fs.writeFileSync(path.join(out, 'index.html'), `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>中文 MUD 单机版</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #ddd; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .card { display: block; padding: 16px; border: 1px solid #333; border-radius: 8px; color: inherit; text-decoration: none; background: #1a1a1a; }
  .card:hover { border-color: #6af; }
  .card h2 { margin: 0 0 6px; font-size: 18px; color: #9cf; }
  .card p { margin: 0; font-size: 13px; color: #aaa; }
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
  <footer>
    单机模式下只有你一个玩家，聊天频道没有其他人。清除浏览器数据会删除存档，请定期导出。<br>
    源码与说明：<a href="https://github.com/szluyu99/mud">github.com/szluyu99/mud</a>。游戏 mudlib 版权归原作者所有。
  </footer>
</main>
</body>
</html>
`);
console.log('site built at', out);
