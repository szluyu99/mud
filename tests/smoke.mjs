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
  const text = () => page.evaluate(() => document.body.innerText);
  // 先开巫师权限（会重连一次），再开始远征，否则临时状态会被这次重连冲掉
  await page.evaluate((id) => MudWasm.setWizard(id, 'admin'), page.charId).catch(() => {});
  await page.waitForTimeout(3000);
  await until(page, () => document.querySelectorAll('#exits td').length === 9, 180000);
  await page.waitForTimeout(2000);
  await send(page, 'yuanzheng'); await page.waitForTimeout(1200);
  check('zjrogue: 远征菜单 opens', /江湖远征/.test(await text()) && /开始远征/.test(await page.evaluate(() => document.body.innerHTML)));
  await send(page, 'yuanzheng start'); await page.waitForTimeout(1200);
  check('zjrogue: 远征 starts with three lives', /三条命/.test(await text()));
  await send(page, 'yuanzheng complete'); await page.waitForTimeout(1000);
  check('zjrogue: 任务 requires the right room', /你还没有到地方/.test(await text()));
  await send(page, 'goto /d/city/guangchang'); await page.waitForTimeout(1500);
  await send(page, 'yuanzheng complete'); await page.waitForTimeout(1000);
  await send(page, 'yuanzheng choose 1'); await page.waitForTimeout(1000);
  check('zjrogue: first talent is 铁骨 (max qi +120)', /天赋【铁骨】/.test(await text()));
  // 刷新后远征进度还在（局内状态存在角色身上，先存一次档）
  await page.evaluate(async () => { await MudWasm.lpc('mudwasm_save', []); await new Promise((r) => setTimeout(r, 500)); await MudWasm.sync(); });
  await page.reload({ waitUntil: 'load' });
  await until(page, () => document.querySelectorAll('#exits td').length === 9, 180000);
  await page.waitForTimeout(3000);
  await page.waitForTimeout(3000);
  await send(page, 'yuanzheng status'); await page.waitForTimeout(2500);
  const stResume = (await page.evaluate(() => document.querySelector('div#out')?.innerText || '')).slice(-160);
  check('zjrogue: run survives a page reload', /第2\/5个任务/.test(stResume), stResume);
  const stats = async () => { try { return JSON.parse(await page.evaluate(() => MudWasm.lpc('mudwasm_stats', []))); } catch (e) { return null; } };
  const st0 = (await stats()) || {};
  for (const [room, n] of [['/d/city/wumiao', '2'], ['/d/city/kedian', '3'], ['/d/city/beimen', '1'], ['/d/city/dangpu', '']]) {
    await send(page, 'goto ' + room); await page.waitForTimeout(1200);
    await send(page, 'yuanzheng complete'); await page.waitForTimeout(1000);
    if (n) { await send(page, 'yuanzheng choose ' + n); await page.waitForTimeout(800); }
  }
  const st1 = (await stats()) || {};
  // 第三个任务后选的是「根骨」(+2 con)，属性要真的涨在角色身上
  check('zjrogue: 根骨 talent raises con by 2 in game', st0.a && st1.a && st1.a.con === st0.a.con + 2, [st0.a, st1.a]);
  check('zjrogue: all five tasks done', /五项远征任务全部完成/.test(await text()));
  await send(page, 'yuanzheng settle'); await page.waitForTimeout(1200);
  check('zjrogue: settle grants 远征声望', /获得远征声望 \d+ 点/.test(await text()));
  const st2 = (await stats()) || {};
  check('zjrogue: talents removed again after settle', st2.a && st2.a.con === st0.a.con && st2.a.dex === st0.a.dex, [st0.a, st2.a]);
  await send(page, 'yuanzheng status'); await page.waitForTimeout(1000);
  check('zjrogue: run cleared after settle', /尚未开始远征/.test((await page.evaluate(() => [...document.querySelectorAll('#out')].map((e) => e.innerText).sort((a, b) => b.length - a.length)[0]) || '').slice(-200)));
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
