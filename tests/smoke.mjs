// Browser smoke tests for the built site. Usage: node tests/smoke.mjs <site dir> [game ...]
// Serves the site under /mud/ (same sub-path as GitHub Pages), drives a phone-sized headless Chrome,
// and exits non-zero on any failure. Chrome: $CHROME_PATH, else the usual macOS / Linux locations.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const site = path.resolve(process.argv[2] || 'site');
const only = process.argv.slice(3);
const GAMES = ['zjmud', 'zjmudhell', 'zjdyzj', 'shujian3', 'dtxyzjb', 'zjrogue'].filter((g) => !only.length || only.includes(g));
const chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((p) => p && fs.existsSync(p));
if (!chrome) { console.error('no Chrome found; set CHROME_PATH'); process.exit(2); }

// ---------- static server: /mud/... -> site/... ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.gz': 'application/gzip', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith('/mud/')) { res.writeHead(404); return res.end(); }
  p = p.slice(4);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, p);
  if (!f.startsWith(site)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/mud/`;

// ---------- tiny test harness ----------
let failed = 0;
const check = (name, ok, info) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
  if (!ok) failed++;
};
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
const watch = (page, errs, tag) => {
  page.on('pageerror', (e) => errs.push(tag + ': ' + String(e).slice(0, 200)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
};
const until = async (page, fn, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await page.evaluate(fn).catch(() => false)) return true; await page.waitForTimeout(250); } return false; };

// Register a fresh character and walk out of the newbie rooms (zj clients all share this flow).
async function newCharacter(page, g) {
  await page.goto(BASE + g + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('input[value="注册账号"]'), null, { timeout: 180000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('input[value="注册账号"]').click()); await page.waitForTimeout(600);
  const id = 't' + Math.random().toString(36).slice(2, 8);
  page.charId = id;
  await page.fill('input#id', id);
  await page.fill('input#pass', 'Test1234'); await page.fill('input#repass', 'Test1234');
  await page.evaluate(() => document.querySelector('button#register').click());
  await until(page, () => !!document.querySelector('input#nicheng'), 15000);
  if (await page.locator('input#nicheng').count()) {
    await page.fill('input#nicheng', '龙飞'); await page.check('input#nan', { force: true });
    await page.evaluate(() => charcheck());
    await until(page, () => document.querySelectorAll('#exits td').length === 9, 30000);
    await page.waitForTimeout(2000);
  }
  await page.evaluate(() => { try { $('.ui-dialog-content').dialog('close'); } catch (e) { /* none */ } });
}
const send = (page, c) => page.evaluate((c) => sock.emit('stream', c + '\n'), c);
const room = (page) => page.evaluate(() => document.querySelector('#exits tr:nth-child(2) td:nth-child(2)')?.innerText || '');
async function waitRoom(page, name, ms) { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if ((await room(page)) === name) return true; await page.waitForTimeout(250); } return false; }

// ---------- every game: loads, registers, layout intact, minimap opens ----------
for (const g of GAMES) {
  const ctx = await phone(), page = await ctx.newPage(), errs = [];
  watch(page, errs, g);
  try {
    await newCharacter(page, g);
    const r = await page.evaluate(() => ({
      minimap: typeof window.MudMiniMap === 'object',
      exits: document.querySelectorAll('#exits td').length,
      exitsScroll: (() => { const e = document.querySelector('#exits'); return e ? e.scrollHeight - e.clientHeight : -1; })(),
      overflowX: document.documentElement.scrollWidth - innerWidth,
      btnFont: getComputedStyle(document.querySelector('#exits button') || document.body).fontSize,
    }));
    check(g + ': logged in (9 exit cells)', r.exits === 9, r);
    check(g + ': minimap loaded', r.minimap);
    check(g + ': no horizontal overflow', r.overflowX <= 1, r.overflowX);
    check(g + ': exits area has no scrollbar', r.exitsScroll <= 0, r.exitsScroll);
    check(g + ': exit button font unchanged (10px)', r.btnFont === '10px', r.btnFont);
    await page.evaluate(() => document.querySelectorAll('#exits td')[4].click()); await page.waitForTimeout(400);
    check(g + ': minimap panel opens', await page.evaluate(() => !!document.querySelector('[data-mm=close]')));
    await page.evaluate(() => document.querySelector('[data-mm=close]')?.click());
    check(g + ': no welcome banner in the chat area', !/欢迎来到/.test(await page.evaluate(() => document.querySelector('div#chat')?.innerText || '')));
    if (g === 'zjmud') await zjmudExtras(page, ctx);
    if (g === 'zjrogue') {
      check('zjrogue: own game id (separate save)', (await page.evaluate(() => MudMiniMap.gameId)) === 'zjrogue');
      check('zjrogue: wiki data loads', await until(page, () => MudMiniMap.wikiReady(), 15000));
      await page.evaluate(() => MudWasm.sync());
      const ids = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('mudwasm', 1); q.onsuccess = () => { const t = q.result.transaction(q.result.objectStoreNames[0]).objectStore(q.result.objectStoreNames[0]).getAllKeys(); t.onsuccess = () => r(t.result); }; q.onerror = () => r([]); }));
      check('zjrogue: saved under its own key', ids.includes('zjrogue') && !ids.includes('zjmud'), ids);
      await zjrogueExtras(page);
    }
  } catch (e) { check(g + ': run', false, String(e).slice(0, 200)); }
  check(g + ': no page errors', !errs.length, errs);
  await ctx.close();
}

// ---------- zjmud only: wiki overlay, wiki map, routes from the wiki ----------
async function zjmudExtras(page, ctx) {
  for (const c of ['east', 'out', 'pianshu jhx', 'wash', 'born 扬州人氏']) { await send(page, c); await page.waitForTimeout(2000); }
  check('zjmud: born in 宝昌客栈', await waitRoom(page, '宝昌客栈', 8000), await room(page));
  check('zjmud: minimap has wiki data', await until(page, () => MudMiniMap.wikiReady(), 15000));
  const bar = await page.evaluate(() => [...document.querySelectorAll('#mudwasm-bar > button')].map((b) => [b.textContent, b.getBoundingClientRect().height]));
  check('zjmud: toolbar has 百科 and 存档 buttons of the same size', bar.length === 2 && bar[0][0] === '百科' && bar[0][1] === bar[1][1], bar);
  // semicolon command queue
  await send(page, 'west;south');
  check('zjmud: queued "west;south" arrives at 中央广场', await waitRoom(page, '中央广场', 10000), await room(page));
  await send(page, 'north;east');
  check('zjmud: queued "north;east" back to 宝昌客栈', await waitRoom(page, '宝昌客栈', 10000), await room(page));
  // wiki map mode: unvisited rooms are drawn and clickable
  await page.evaluate(() => document.querySelectorAll('#exits td')[4].click()); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-mm=wiki]')?.click()); await page.waitForTimeout(400);
  const cells = await page.evaluate(() => [...document.querySelectorAll('[data-mm=cell]')].map((b) => [b.title, b.style.borderStyle]));
  check('zjmud: wiki map shows unvisited rooms', cells.filter((c) => c[1] === 'dashed').length > 50, cells.length);
  const hit = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-mm=cell]')].find((x) => x.title === '中央广场'); if (b) b.click(); return !!b; });
  check('zjmud: wiki map click walks to 中央广场', hit && await waitRoom(page, '中央广场', 10000), await room(page));
  await page.evaluate(() => document.querySelector('[data-mm=wiki]')?.click());
  await page.evaluate(() => document.querySelector('[data-mm=close]')?.click());
  // in-game wiki: "wiki 名字" opens an overlay that lands on the npc page
  await send(page, 'wiki 平一指');
  const frameOk = await until(page, () => !!document.querySelector('[data-mm=wikiclose]'), 5000);
  let fr = null;
  for (let i = 0; i < 20 && !fr; i++) { fr = page.frames().find((f) => f.url().includes('/wiki/')); await page.waitForTimeout(250); }
  let h2 = '';
  for (let i = 0; i < 20 && fr && h2 !== '平一指'; i++) { h2 = await fr.evaluate(() => document.querySelector('main h2')?.textContent || '').catch(() => ''); await page.waitForTimeout(250); }
  check('zjmud: "wiki 平一指" opens the npc page in an overlay', frameOk && h2 === '平一指', h2);
  // 浮层打开时右上角工具栏要藏起来，不然压在「返回游戏」上
  const hid = await page.evaluate(() => getComputedStyle(document.getElementById('mudwasm-bar')).visibility);
  check('zjmud: toolbar hidden while the wiki overlay is open', hid === 'hidden', hid);
  // 带我去 inside the overlay: overlay closes, the game walks there
  if (fr) await fr.evaluate(() => document.querySelector('button[data-go]')?.click()).catch(() => {});
  await page.waitForTimeout(500);
  check('zjmud: 带我去 closes the overlay', !(await page.$('[data-mm=wikiclose]')));
  check('zjmud: 带我去 walks to 药铺', await waitRoom(page, '药铺', 15000), await room(page));
  // 查百科 button in the npc's action popup
  await page.evaluate(() => [...document.querySelectorAll('#obj button')].find((b) => b.textContent.includes('平一指'))?.click());
  const btn = await until(page, () => !!document.querySelector('[data-mm=wikibtn]'), 4000);
  check('zjmud: npc popup has 查百科', btn);
  if (btn) { await page.evaluate(() => document.querySelector('[data-mm=wikibtn]').click()); await page.waitForTimeout(800); }
  check('zjmud: 查百科 opens overlay', !!(await page.$('[data-mm=wikiclose]')));
  await page.evaluate(() => document.querySelector('[data-mm=wikiclose]')?.click());
  check('zjmud: toolbar back after closing the overlay', (await page.evaluate(() => getComputedStyle(document.getElementById('mudwasm-bar')).visibility)) === 'visible');
  // stand-alone wiki tab hands the route to the open game over BroadcastChannel
  const p2 = await ctx.newPage(), e2 = [];
  watch(p2, e2, 'wiki tab');
  await p2.goto(BASE + 'wiki/?g=zjmud#/room/' + encodeURIComponent('/d/city/guangchang'));
  await until(p2, () => !!document.querySelector('button[data-go]'), 10000);
  await p2.evaluate(() => document.querySelector('button[data-go]').click()); await p2.waitForTimeout(1000);
  check('zjmud: wiki tab gets the game\'s ack', /已交给游戏/.test(await p2.evaluate(() => document.querySelector('button[data-go]').textContent)));
  check('zjmud: game walks to 中央广场 from wiki tab', await waitRoom(page, '中央广场', 12000), await room(page));
  // 拜师条件对照：岳不群要悟性 ≥ 23，新角色悟性 20，应该显示还差 1 条
  await p2.evaluate((h) => { location.hash = h; }, '#/npc/' + encodeURIComponent('/kungfu/class/huashan/yue-buqun'));
  const rcOk = await until(p2, () => /还差 1 条/.test(document.getElementById('rcbox')?.innerText || ''), 8000);
  check('zjmud: wiki tab checks 拜师条件 against the character', rcOk, await p2.evaluate(() => document.getElementById('rcbox')?.innerText.slice(0, 80)));
  // 差的条件怎么补：岳不群差悟性，提示学读书写字
  check('zjmud: 拜师条件 says how to fix 悟性', /读书写字/.test(await p2.evaluate(() => document.getElementById('rcbox')?.innerText || '')));
  // 去拜师：被拒绝时把师父的原话显示出来
  await p2.evaluate(() => document.querySelector('button[data-then]').click());
  check('zjmud: 去拜岳不群 walks there and reports the refusal', await until(page, () => /没拜成。岳不群/.test(document.body.innerText), 60000));
  // 去拜师：条件都满足的裘万家收下新角色
  await p2.evaluate((h) => { location.hash = h; }, '#/npc/' + encodeURIComponent('/kungfu/class/gaibang/qiu-wanjia'));
  await until(p2, () => !!document.querySelector('button[data-then]'), 8000);
  await p2.evaluate(() => document.querySelector('button[data-then]').click());
  check('zjmud: 去拜裘万家 succeeds', await until(page, () => /拜师成功/.test(document.body.innerText), 60000));
  // 我的角色：读出当前角色，列出能拜的师父
  await p2.evaluate(() => { location.hash = '#/me'; });
  const meOk = await until(p2, () => /龙飞/.test(document.querySelector('main h2')?.textContent || '') && /条件都满足的师父/.test(document.querySelector('main').innerText) && /丐帮/.test(document.querySelector('main').innerText), 8000);
  check('zjmud: wiki 我的角色 shows the character and masters', meOk, await p2.evaluate(() => document.querySelector('main').innerText.slice(0, 80)));
  check('zjmud: wiki tab has no page errors', !e2.length, e2);
  await p2.close();
  // 「去 名字」：按人物找房间，走到药铺
  await send(page, '去平一指');
  check('zjmud: "去平一指" walks to 药铺', await waitRoom(page, '药铺', 15000), await room(page));
  // 特殊出入：全真教大门要先敲门（knock）才开东门；道童不让俗人进，队列应停下并说明原因
  await send(page, '去大堂一进');
  const qz = await waitRoom(page, '全真教大门', 30000);
  await page.waitForTimeout(6000);
  const said = await page.evaluate(() => document.body.innerText.includes('没走成'));
  check('zjmud: "去大堂一进" flies to 全真教大门 and knocks', qz && said, (await room(page)) + ' | ' + (await page.evaluate(() => (document.body.innerText.match(/【连续指令】[^【\n]*/g) || []).slice(-4).join(' / '))));
  // 动作带人走：百丈涧 zou tiesuo → 仙愁门（fly lj 落在百丈涧）
  await send(page, '去仙愁门');
  check('zjmud: "去仙愁门" uses zou tiesuo', await waitRoom(page, '仙愁门', 30000), await room(page));
  // 普通物品随存档保留：设为巫师后变出长剑、布衣、酒袋、帐篷，手持长剑、穿上布衣、包子放进帐篷，
  // 存档并刷新页面后这些东西都还在，长剑仍在手上
  await page.evaluate((id) => MudWasm.setWizard(id, 'admin'), page.charId).catch(() => {});
  await page.waitForTimeout(3000);
  await until(page, () => document.querySelectorAll('#exits td').length === 9, 180000);
  await page.waitForTimeout(3000);
  for (const c of ['clone /clone/weapon/changjian', 'clone /clone/cloth/cloth', 'clone /clone/food/jiudai', 'clone /clone/misc/sleepbag',
    'clone /clone/food/baozi', 'clone /clone/questob/letter', 'wield jian', 'wear cloth', 'put baozi in sleepbag']) { await send(page, c); await page.waitForTimeout(900); }
  await page.evaluate(async () => { await MudWasm.lpc('mudwasm_save', []); await new Promise((r) => setTimeout(r, 500)); await MudWasm.sync(); });
  await page.reload({ waitUntil: 'load' });
  await until(page, () => document.querySelectorAll('#exits td').length === 9, 180000);
  await page.waitForTimeout(3000);
  const outTxt = () => page.evaluate(() => [...document.querySelectorAll('#out')].map((e) => e.innerText).sort((a, b) => b.length - a.length)[0]);
  await send(page, 'i'); await page.waitForTimeout(1500);
  const inv = await page.evaluate(() => document.querySelector('div#hudong')?.innerText || '');
  await send(page, 'look jian'); await page.waitForTimeout(1200);
  const wielded = /放下 长剑|unwield/.test(await page.evaluate(() => document.body.innerHTML));
  await send(page, 'get baozi from sleepbag'); await page.waitForTimeout(1200);
  const tail = (await outTxt()).slice(-600);
  check('zjmud: items kept after reload (长剑 布衣 酒袋 帐篷, not 师门信件)', /长剑/.test(inv) && /布衣/.test(inv) && /酒袋/.test(inv) && /帐篷/.test(inv) && !/师门信件/.test(inv), inv.slice(0, 200));
  check('zjmud: 长剑 still wielded, 包子 still in 帐篷', wielded && /从帐篷中拿出/.test(tail), tail.slice(-160));
}

// ---------- zjrogue only: 江湖远征 P1 ----------
async function zjrogueExtras(page) {
  for (const c of ['east', 'out', 'pianshu jhx', 'wash', 'born 扬州人氏']) { await send(page, c); await page.waitForTimeout(2000); }
  check('zjrogue: born in 宝昌客栈', await waitRoom(page, '宝昌客栈', 8000), await room(page));
  // 新人找不到远征入口（原来藏在「系统」菜单里）：出生后顶栏先挂一条提示
  check('zjrogue: 新人顶栏提示开一局远征', await until(page, () => /点这里开一局/.test(document.getElementById('yzbar')?.textContent || ''), 15000),
    await page.evaluate(() => document.getElementById('yzbar')?.textContent || '(无顶栏)'));
  const text = () => page.evaluate(() => document.body.innerText);
  const out = () => page.evaluate(() => [...document.querySelectorAll('#out')].map((e) => e.innerText).sort((a, b) => b.length - a.length)[0] || '');
  const waitText = async (re, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (re.test(await text())) return true; await page.waitForTimeout(400); } return false; };
  const waitFor = async (re, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (re.test(await out())) return true; await page.waitForTimeout(400); } return false; };
  const cmd = async (c, re, ms = 20000) => { await send(page, c); return waitFor(re, ms); };
  // 先开巫师权限（会重连一次），再开始远征，否则临时状态会被这次重连冲掉
  await page.evaluate((id) => MudWasm.setWizard(id, 'admin'), page.charId).catch(() => {});
  await page.waitForTimeout(3000);
  await until(page, () => document.querySelectorAll('#exits td').length === 9, 180000);
  await page.waitForTimeout(2000);
  const stats = async () => JSON.parse(await page.evaluate(() => MudWasm.lpc('mudwasm_stats', [])));
  const st0 = await stats();
  await send(page, 'yuanzheng'); await page.waitForTimeout(1200);
  check('zjrogue: 远征菜单 opens', /江湖远征/.test(await text()) && /开始远征/.test(await page.evaluate(() => document.body.innerHTML)));
  await send(page, 'yuanzheng start'); await page.waitForTimeout(1500);
  const pick = await page.evaluate(() => document.body.innerHTML);
  check('zjrogue: 开局要先选流派', /剑客/.test(pick) && /拳师/.test(pick) && /刀客/.test(pick), pick.slice(0, 200));
  // 局外特权：买「命硬」和「名望」，验证开局多一条命、结算多两成声望
  await send(page, 'yuanzheng debugsp 200'); await page.waitForTimeout(1000);
  await send(page, 'yuanzheng shop'); await page.waitForTimeout(1200);
  check('zjrogue: 远征商店 lists perks', await waitText(/老练/, 8000) && /命硬/.test(await text()), (await text()).slice(-200));
  await send(page, 'yuanzheng buy 2'); await page.waitForTimeout(1200);
  check('zjrogue: 买下命硬', /换到了「命硬」/.test(await out()), await out());
  await send(page, 'yuanzheng buy 4'); await page.waitForTimeout(1200);
  check('zjrogue: 买下名望', /换到了「名望」/.test(await out()), await out());
  check('zjrogue: 买完商店还开着，能接着买', /远征商店（声望：\d+）/.test(await text()) && /名望（[^）]*已拥有）/.test(await text()), (await text()).slice(-200));
  await send(page, 'yuanzheng buy 4'); await page.waitForTimeout(1200);
  check('zjrogue: 重复买会提示已拥有并留在商店', /已经拥有了「名望」/.test(await text()) && /远征商店（声望/.test(await text()), (await text()).slice(-200));
  // 局外特权现在是三条线：还没买「磨砺」时，「眼力」只显示前置条件，没有购买入口
  await send(page, 'yuanzheng shop'); await page.waitForTimeout(1200);
  check('zjrogue: 二三级特权要先买前一级', /眼力（先买「磨砺」）/.test(await text()) && ! /buy 6/.test(await text()), (await text()).slice(-260));
  await send(page, 'yuanzheng start sword city'); await page.waitForTimeout(1500);
  await send(page, 'yuanzheng resume'); await page.waitForTimeout(1500);
  check('zjrogue: 中途可以接着打这一局', /接着打这一局/.test(await text()), (await text()).slice(-120));
  check('zjrogue: 命硬让开局有四条命', /4 条命/.test(await text()), await text());
  check('zjrogue: 剑客带着长剑开局', /长剑/.test(await out()), await out());
  check('zjrogue: 开局随机挑一座城', /这一趟去(扬州|苏州|杭州|泉州)/.test(await text()), (await text()).slice(-120));
  // 开局先出一张悬赏榜，三桩活儿自己挑先做哪桩
  {
    const t = await text();
    check('zjrogue: 开局先看悬赏榜', /悬赏榜/.test(t) && /先去哪一桩/.test(t), t.slice(-200));
    // 三桩活儿各有各的好处，榜单上就得写出来，不然选路等于没选
    check('zjrogue: 悬赏榜上写着各桩的好处', /攻击 \+10/.test(t) && /多捡 10 枚/.test(t) && /多 1 点天赋/.test(t), t.slice(-320));
  }
  await send(page, 'yuanzheng plan 1'); await page.waitForTimeout(2000);
  {
    // 往上翻着看记录时也看得见第几关、几条命
    const bar = await page.evaluate(() => { const e = document.getElementById('yzbar'); return e ? e.textContent : ''; });
    check('zjrogue: 顶上有常驻的远征简讯', /远征：一、剿匪/.test(bar) && /命 \d\/\d/.test(bar) && /钱 \d+/.test(bar), bar);
  }
  check('zjrogue: 挑了先做剿匪', /你决定先去一、剿匪/.test(await text()), (await text()).slice(-120));
  check('zjrogue: 目标地点会给出路径', /地点：.*（自动带路：去 \/d\//.test(await text()), (await text()).slice(-160));
  check('zjrogue: first target spawns right away', /目标已出现：恶汉/.test(await out()), await out());

  // 菜单里的「带我去目标」按提示里的房间路径自动走过去（普通玩家没有 goto）
  await send(page, 'yuanzheng'); await page.waitForTimeout(1200);
  check('zjrogue: 菜单里有「带我去目标」', /带我去目标/.test(await page.evaluate(() => document.body.innerHTML)));
  await send(page, '去 /d/city/guangchang');
  check('zjrogue: 自动带路走到了关卡地点', await waitRoom(page, '中央广场', 40000), await room(page));
  // 一、剿匪：走到广场打死恶汉
  await send(page, 'goto /d/city/guangchang'); await page.waitForTimeout(2500);
  // 连招提示要等第二拳才有，一刀秒掉就看不到；所以这里单独等一会再判过关
  check('zjrogue: stage 1 clear after killing 恶汉', await cmd('kill ehan', /一、剿匪 完成|匪首/, 90000), await out());
  // 剑客第二下起会喊「剑势连绵」；打得快时这句可能被后面的战况顶出可见区，所以这里放宽到整段
  check('zjrogue: 剑客连招会叠伤害', /剑势连绵|造成 \d+ 点/.test(await text()), (await text()).slice(-200));
  check('zjrogue: 过关后遇到一件随机事', /路上遇到：/.test(await text()), (await text()).slice(-160));
  // 遭遇弹窗被关掉以后，菜单里得有入口找回来，否则下一关一直不开
  await page.evaluate(() => { try { $('.ui-dialog-content').dialog('close'); } catch (e) { /* none */ } });
  await page.evaluate(() => document.getElementById('yzbar')?.click()); await page.waitForTimeout(1500);
  check('zjrogue: 点顶栏打开菜单，里面能找回遭遇', /yuanzheng event"/.test(await page.evaluate(() => document.body.innerHTML)));
  await send(page, 'yuanzheng event 1'); await page.waitForTimeout(1200);
  check('zjrogue: 处理完遭遇才轮到天赋', /选一个天赋/.test(await text()), (await text()).slice(-160));
  await send(page, 'yuanzheng stall'); await page.waitForTimeout(1200);
  check('zjrogue: 局内摊位摆出三件货', /路边的摊子/.test(await text()) && /钱）/.test(await text()) && /铜钱：\d+/.test(await text()), (await text()).slice(-200));
  await send(page, 'yuanzheng choose 1'); await page.waitForTimeout(1200);
  // 天赋三选一每次随机抽，第一张不再固定是「起手式」
  check('zjrogue: 选了一个天赋', /你选择了天赋【/.test(await text()), (await text()).slice(-200));

  // 二、夺宝：打死守卫拿宝物，回客店上交
  await send(page, 'goto /d/city/nandajie1'); await page.waitForTimeout(2500);
  // 守卫会喊帮手，但「倒下去」的只能是守卫本人：帮手被打倒不算过关，守卫也不该越喊越多
  {
    const t = await cmd('kill shouwei', /摸出.*宝物/, 90000);
    const log = await text();
    const helpers = (log.match(/狂喊「来人哪/g) || []).length;
    check('zjrogue: 守卫 drops a treasure', t, await out());
    check('zjrogue: 守卫喊来的帮手不会越喊越多', helpers <= 3, '来人哪 x' + helpers);
  }
  await send(page, 'goto /d/city/kedian'); await page.waitForTimeout(2500);
  check('zjrogue: 宝物 submitted at 宝昌客栈', await cmd('yuanzheng submit', /二、夺宝 完成/, 20000), await out());
  await send(page, 'yuanzheng event 1'); await page.waitForTimeout(1000);
  await send(page, 'yuanzheng choose 1'); await page.waitForTimeout(1000);

  // 三、寻访：问线人
  await send(page, 'goto /d/city/wumiao'); await page.waitForTimeout(2500);
  await send(page, 'yuanzheng debugrare'); await page.waitForTimeout(800);
  check('zjrogue: 线人 answers and stage 3 clears', await cmd('ask xianren about 远征', /三、寻访 完成/, 30000), await out());
  check('zjrogue: 线人会透露这局匪首是谁', /这回坐镇的是/.test(await text()), (await text()).slice(-200));
  await send(page, 'yuanzheng event 1'); await page.waitForTimeout(1000);
  check('zjrogue: 天赋里能抽到★稀有天赋', await until(page, () => /★/.test(document.body.innerText), 8000), (await text()).slice(-200));
  await send(page, 'yuanzheng choose 1'); await page.waitForTimeout(1000);
  // 流派专属遭遇：剑客能遇到「剑谱残页」，选了以后状态里记着流派心得
  await send(page, 'yuanzheng debugevent 10'); await page.waitForTimeout(1000);
  check('zjrogue: 剑客能遇到流派专属的「剑谱残页」', /剑谱残页/.test(await text()), (await text()).slice(-200));
  await send(page, 'yuanzheng event 1'); await page.waitForTimeout(1000);
  await send(page, 'yuanzheng status'); await page.waitForTimeout(1200);
  check('zjrogue: 状态里显示流派心得', /流派心得：剑谱残页/.test(await text()), (await text()).slice(-200));

  // 四、截杀副手（匪首在第四关打完时刷出，先把这局的匪首定成会喊人的啸山虎，打法和原来最接近）
  await send(page, 'yuanzheng debugboss 0'); await page.waitForTimeout(800);
  await send(page, 'goto /d/city/beimen'); await page.waitForTimeout(2500);
  // 副手血到三成会掉头跑，跑了这一关得重来；这里要么打死，要么认下「人跑了」这一手
  check('zjrogue: 副手 killed, stage 4 clears', await cmd('kill fushou', /四、截杀 完成|人跑了，这一关得重来/, 60000),
    await out());
  await send(page, 'yuanzheng event 1'); await page.waitForTimeout(1000);
  await send(page, 'yuanzheng choose 1'); await page.waitForTimeout(1000);

  // 五、终局：匪首每局随机一个，各有一手
  await send(page, 'goto /d/city/guangchang'); await page.waitForTimeout(2500);
  check('zjrogue: 终局匪首有名有姓（啸山虎）', /啸山虎/.test(await text()), (await text()).slice(-200));
  check('zjrogue: boss killed, all five stages clear', await cmd('kill feishou', /五、终局 完成/, 80000), await out());
  check('zjrogue: 匪首开场会提起夺宝关拿走的宝物', /是你拿的，我的副手也是你截的/.test(await text()), (await text()).slice(-300));
  // 打完还没结算时打开菜单：曾经在这里越界报错（Array index out of bounds）
  await send(page, 'yuanzheng'); await page.waitForTimeout(1500);
  check('zjrogue: 五关打完后菜单不报错', /五关已经全部通过/.test(await text()) && ! /Array index|未知错误/.test(await text()), (await text()).slice(-200));
  check('zjrogue: settle grants 远征声望', await cmd('yuanzheng settle', /获得远征声望 \d+ 点/, 20000), await out());
  check('zjrogue: 第一次通关点亮图鉴', /图鉴新点亮：扬州、剑客/.test(await text()), (await text()).slice(-300));
  await send(page, 'yuanzheng book'); await page.waitForTimeout(1200);
  check('zjrogue: 图鉴里扬州、剑客打了勾', /城（1\/4）：扬州✓/.test(await text()) && /流派（1\/3）：剑客✓/.test(await text()), (await text()).slice(-300));
  check('zjrogue: 结算后顶栏换成「再来一局」入口', await until(page, () => /再来一局/.test(document.getElementById('yzbar')?.textContent || ''), 8000),
    await page.evaluate(() => document.getElementById('yzbar')?.textContent || '(无顶栏)'));
  await waitText(/获得远征声望 \d+ 点/, 15000);
  {
    const m = /剩余 (\d+) 条命，获得远征声望 (\d+) 点/.exec(await text());
    // 这一趟只在前四关各选一次天赋，所以是 4 个
    const base = m ? 8 + 4 * 2 + ((+m[1]) - 1) * 3 : 0;
    check('zjrogue: settle shows 本局统计', await waitText(/本局用时 \d+/, 5000), (await text()).slice(-160));
  check('zjrogue: 打完五关带出战利品', await waitText(/带出了一件远征长剑/, 5000), (await text()).slice(-150));
    // 第一次通关还会点亮图鉴：城、流派、匪首、难度各 +5
    const fresh = ((/图鉴新点亮：([^（]*)/.exec(await text()) || [, ''])[1].split('、').filter(Boolean)).length;
  check('zjrogue: 名望让结算多两成', !!m && +m[2] === base + Math.floor(base / 5) + fresh * 5, m ? m[0] + ' 图鉴 ' + fresh : (await text()).slice(-120));
  check('zjrogue: 打通一局解锁下一档难度', /解锁新难度「险一」/.test(await text()), (await text()).slice(-160));
  }
  await send(page, 'yuanzheng status'); await page.waitForTimeout(1500);
  check('zjrogue: run cleared after settle', /尚未开始远征/.test(await out()), await out());
  check('zjrogue: 结算时局内兵器收走', /兵器已经还回去了/.test(await out()), await out());

  // 结算完立刻再开一局：上一局的兵器和临时状态不能挡住新的开始
  await send(page, 'yuanzheng'); await page.waitForTimeout(1500);
  check('zjrogue: 结算后菜单回到选流派', /先选一个流派/.test(await text()), (await text()).slice(-160));
  check('zjrogue: 面板记下通关与最好成绩', /已通关：1 局/.test(await text()) && /单局最高：\d+ 点/.test(await text()), (await text()).slice(-200));
  await send(page, 'yuanzheng start blade'); await page.waitForTimeout(2000);
  check('zjrogue: 第二局能正常开始', /你以刀客的身份踏上了江湖远征/.test(await text()), (await text()).slice(-200));
  check('zjrogue: 第二局默认用新解锁的难度', /难度「险一」/.test(await text()) && /远征·险一：/.test(await page.evaluate(() => document.getElementById('yzbar')?.textContent || '')), (await text()).slice(-200));
  await send(page, 'yuanzheng status'); await page.waitForTimeout(1200);
  check('zjrogue: 第二局从第一关开始', /一、剿匪/.test(await out()), await out());
  await send(page, 'yuanzheng start fist'); await page.waitForTimeout(1500);
  check('zjrogue: 打到一半再开一局会给按钮', /你还有一局远征没打完/.test(await text()) && /放弃这一局/.test(await text()), (await text()).slice(-160));
  // 远征途中照常做别的事：先把这一局按到只剩一条命，正常游玩的死亡不该拿远征的命来抵
  await send(page, 'yuanzheng life 1'); await page.waitForTimeout(1000);
  check('zjrogue: 巫师能把这一局按到一条命', /这一局还剩 1 条命/.test(await text()), (await text()).slice(-120));
  await send(page, 'yuanzheng status'); await page.waitForTimeout(1000);
  check('zjrogue: 只剩一条命时 status 会提醒', /1\/\d/.test(await text()) || /1 条命/.test(await text()), (await text()).slice(-160));
  // 局里的东西不能丢：宝物 no_drop，丢不出去就不会被扫街的收走
  check('zjrogue: 局内东西挂着不可丢弃', /局内的东西|借来的/.test(await text()), (await text()).slice(-100));
  // 只剩一条命时还是会照常判输赢，所以这里只看到底是「死在远征里」还是「死在别处」
  await send(page, 'goto /d/city/guangchang'); await page.waitForTimeout(2500);
  check('zjrogue: 正常游玩死了不扣远征的命', await cmd('kill ehan', /这一下不是远征里的打斗|还剩 1 条命|命都用完了|闷哼一声/, 90000), await out());
  await send(page, 'yuanzheng status'); await page.waitForTimeout(1200);
  {
    const t = await text();
    check('zjrogue: 那一局的进度没变', /一、剿匪|远征的 1 条命还在/.test(t) && ! /命都用完了/.test(t), t.slice(-200));
  }
  // 刷新页面：进度要已经写盘，重新进来顶栏直接挂着当前关卡（不用先点一下远征）
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'load' });
  await until(page, () => document.querySelectorAll('#exits td').length === 9, 180000);
  check('zjrogue: 刷新页面后顶栏接着显示远征进度', await until(page, () => /远征.*：.*命/.test(document.getElementById('yzbar')?.textContent || ''), 15000),
    await page.evaluate(() => document.getElementById('yzbar')?.textContent || '(无顶栏)'));
  // 远征途中照常做别的事：pause 把局里的目标收起来，进度留着
  await send(page, 'yuanzheng pause'); await page.waitForTimeout(1500);
  check('zjrogue: pause 把局里的东西先收走', /你决定先去|局里的事先撂下了/.test(await text()) && /局内的东西也先收走/.test(await text()), (await text()).slice(-150));
  await send(page, 'yuanzheng abandon'); await page.waitForTimeout(1500);
  check('zjrogue: 放弃远征要先确认', /真的放弃这一局/.test(await text()) && /远征.*：.*命/.test(await page.evaluate(() => document.getElementById('yzbar')?.textContent || '')), (await text()).slice(-150));
  await send(page, 'yuanzheng abandon yes'); await page.waitForTimeout(1500);
  // 天赋/临时技能都要还原，不然等于白送属性
  const st1 = await stats();
  const key = (x) => [x.a.con, x.a.dex, x.a.int, x.a.str, x.p.combat_exp].join('/');
  check('zjrogue: temporary bonuses removed after settle', key(st1) === key(st0), [key(st0), key(st1)]);
}

// ---------- stand-alone wiki pages ----------
{
  const ctx = await phone(), p = await ctx.newPage(), errs = [];
  watch(p, errs, 'wiki');
  await p.goto(BASE + 'wiki/?g=zjmud');
  check('wiki: home loads', await until(p, () => !!document.querySelector('.cards'), 20000));
  const pages = ['#/skills', '#/skill/huashan-sword', '#/npcs?f=teach', '#/npc/' + encodeURIComponent('/kungfu/class/wudang/zhang'),
    '#/items?f=秘籍', '#/fams', '#/fam/华山派', '#/rooms', '#/region/huashan', '#/room/' + encodeURIComponent('/d/huashan/qunxianguan')];
  for (const h of pages) {
    await p.evaluate((h) => { location.hash = h; }, h); await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({ ov: document.documentElement.scrollWidth - innerWidth, n: document.querySelector('main').textContent.length }));
    check('wiki ' + decodeURIComponent(h), r.ov <= 1 && r.n > 50, r);
  }
  const zs = await p.evaluate(() => { location.hash = '#/npc/' + encodeURIComponent('/kungfu/class/wudang/zhang'); return new Promise((r) => setTimeout(() => r(document.querySelector('main').innerText), 200)); });
  check('wiki: 张三丰 shows 拜师条件', /拜师条件/.test(zs) && /悟性 ≥ 32/.test(zs));
  await p.fill('#q', '独孤'); await p.waitForTimeout(600);
  check('wiki: search 独孤 finds 独孤九剑', /独孤九剑/.test(await p.textContent('main')));
  check('wiki: search box 16px (no iOS zoom)', (await p.evaluate(() => getComputedStyle(document.querySelector('#q')).fontSize)) === '16px');
  await p.evaluate(() => { location.hash = '#/room/' + encodeURIComponent('/d/quanzhen/damen'); }); await p.waitForTimeout(500);
  check('wiki: room page lists 特殊出入 (knock)', /特殊出入[\s\S]*knock/.test(await p.textContent('main')));
  check('wiki: no page errors', !errs.length, errs);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
