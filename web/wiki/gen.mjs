// Offline wiki data generator.
// Boots the game's mudlib inside the wasm driver (no network, no player), loads every
// skill / npc / room / item file through web/wiki/wikid.c and turns what the game itself
// reports into one compact JSON object for the wiki page.
//
//   import { genWiki } from './wiki/gen.mjs';
//   const data = await genWiki({ driverDir, mudlibDir, config: 'config.zj' });
import fs from 'node:fs';
import { recruitInfo } from './recruit.mjs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const MOUNT = '/mudlib';

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { out.push([p, true]); walk(p, out); } else out.push([p, false]);
  }
  return out;
}

async function dump({ driverDir, mudlibDir, config }) {
  const createFluffOS = require(path.resolve(driverDir, 'fluffos.js'));
  const wikid = fs.readFileSync(path.join(HERE, 'wikid.c'));
  const M = await createFluffOS({
    print: () => {}, printErr: () => {},
    locateFile: (f) => path.resolve(driverDir, f),
    preRun: [(m) => {
      m.FS.mkdir(MOUNT);
      for (const [p, dir] of walk(mudlibDir)) {
        const v = MOUNT + '/' + path.relative(mudlibDir, p);
        if (dir) m.FS.mkdir(v); else m.FS.writeFile(v, fs.readFileSync(p));
      }
      m.FS.writeFile(MOUNT + '/adm/daemons/wikid.c', wikid);
      const pre = MOUNT + '/adm/etc/preload';
      m.FS.writeFile(pre, m.FS.readFile(pre, { encoding: 'utf8' }).trimEnd() + '\n/adm/daemons/wikid\n');
    }],
  });
  M.FS.chdir(MOUNT);
  M.fluffos = { onOutput: () => {}, onDisconnect: () => {}, handlers: {}, _lpcPending: {} };
  if (M.ccall('fluffos_boot', 'number', ['string'], [config]) !== 0) throw new Error('wiki: driver boot failed');
  const tick = () => M.ccall('fluffos_tick', 'number', ['number'], [performance.now()]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50; i++) { tick(); await sleep(5); }
  async function lpc(name, args) {
    let text = null;
    const id = M.ccall('fluffos_lpc_call', 'number', ['string', 'string'], [name, JSON.stringify(args)]);
    if (id < 0) throw new Error('wiki: lpc call ' + name + ' failed (is wikid preloaded?)');
    M.fluffos._lpcPending[id] = { resolve: (t) => { text = t; }, reject: (e) => { text = { err: e }; } };
    for (let i = 0; i < 5000 && text === null; i++) { tick(); if (i % 20 === 19) await sleep(1); }
    if (text === null || text.err) throw new Error('wiki: ' + name + ' gave no result');
    return text;
  }
  const out = {};
  for (const kind of ['skill', 'item', 'npc', 'room']) {
    await lpc('wiki_start', [kind]);
    const rows = [];
    for (let guard = 0; guard < 100000; guard++) {
      const o = JSON.parse(await lpc('wiki_fetch', [400]));
      rows.push(...o.lines);
      if (o.done) break;
    }
    out[kind] = rows;
  }
  return out;
}

// ---------- cleaning ----------
const plain = (s) => (typeof s === 'string'
  ? s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\d{3}/g, '').replace(/\$(br|zj|z2)#/g, '').trim()
  : '');
// 去掉 .c，补上开头的 /（有的房间写成 "d/gaibang/..."，游戏里一样能走）
const norm = (f) => (typeof f === 'string' ? f.replace(/\.c$/, '').replace(/^(?=[^/])/, '/') : '');
const num = (v) => (typeof v === 'number' ? v : 0);

// 不是师父也肯教的人（recognize_apprentice）：1 = 谁都教；2 = 有条件（交学费、做过任务等）
function learnOpen(mudlibDir, f) {
  let src = '';
  try { src = fs.readFileSync(path.join(mudlibDir, f + '.c'), 'utf8'); } catch (e) { return 2; }
  const m = src.match(/int\s+recognize_apprentice\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  return m && /^\s*return\s+1\s*;\s*$/.test(m[1].replace(/\/\/[^\n]*/g, '')) ? 1 : 2;
}
// 谁会改你的身份：源码里 ->set("class", "bonze") 之类（拜师时改、剃度时改）
function classGivers(mudlibDir, npcFiles) {
  const out = {};
  for (const f of npcFiles) {
    let src = '';
    try { src = fs.readFileSync(path.join(mudlibDir, f + '.c'), 'utf8'); } catch (e) { continue; }
    for (const m of src.matchAll(/(?:me|ob|who)->set\(\s*"class"\s*,\s*"(\w+)"\s*\)/g)) (out[m[1]] ||= []).includes(f) || out[m[1]].push(f);
  }
  return out;
}

// 房间里 add_action 出来的进出方式。只认两种写法：
//   函数里 set("exits/<方向>", 目标)  → 先发这条指令，再往那个方向走
//   函数里 ->move(目标)               → 这条指令直接把人挪过去
// 同一条指令能去好几个地方的（迷阵、随机传送）不算；会伤人或退出的也不算。
const XDENY = /^(sheshen|kickout|wudou|bed|sleep|suicide|quit|jump\s+ya)/;
const XBAD = /^\/d\/(wizard|death|fuben|pk|register)\//;   // 巫师房、阴间、副本、PK 场、注册房
function actionEdges(mudlibDir, rooms) {
  const resolveTo = (f, expr) => {
    let m;
    if ((m = /^__DIR__\s*"([^"]+)"$/.exec(expr))) return path.posix.normalize(path.posix.dirname(f) + '/' + m[1]).replace(/\.c$/, '');
    if ((m = /^"(\/[^"]+)"$/.exec(expr))) return m[1].replace(/\.c$/, '');
    return null;
  };
  const body = (src, name) => {
    const i = src.search(new RegExp('\\b' + name + '\\s*\\([^)]*\\)\\s*\\{'));
    if (i < 0) return '';
    const j = src.indexOf('{', i);
    for (let k = j, d = 0; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(j, k + 1); }
    return '';
  };
  const out = {};
  const cond = { n: 0 };
  for (const f of Object.keys(rooms)) {
    if (XBAD.test(f)) continue;
    let src;
    try { src = fs.readFileSync(path.join(mudlibDir, f + '.c'), 'utf8'); } catch { continue; }
    const got = [];
    for (const a of src.matchAll(/add_action\s*\(\s*"(\w+)"\s*,\s*"([^"]+)"/g)) {
      const b = body(src, a[1]);
      if (!b) continue;
      const ts = [];
      // 指令参数取离「开出口 / 挪人」最近的那个 arg 判断（同一个函数里可能按参数分好几支）
      const cmdAt = (at) => {
        let arg = null, ai = 0;
        for (const m of b.slice(0, at).matchAll(/arg\s*(?:!=|==)\s*"([^"]+)"/g)) { arg = m[1]; ai = m.index; }
        // 这一支还要看之前做过什么（比如梅庄敲门要按顺序敲四次）：不收
        if (/query_temp\s*\(/.test(b.slice(ai, at))) return null;
        // 要看你是哪个门派、练到多少级的（丐帮弟子才钻得进狗洞之类）：不收，路线里不能当成谁都能走
        if (/family_name|query_skill\s*\(|query\s*\(\s*"(?:combat_exp|shen|class|gender|age|max_neili|neili)"/.test(b.slice(0, at))) { cond.n++; return null; }
        const c = a[2] + (arg ? ' ' + arg : '');
        return XDENY.test(c) ? null : c;
      };
      for (const m of b.matchAll(/set\s*\(\s*"exits\/(\w+)"\s*,\s*(__DIR__\s*"[^"]+"|"\/[^"]+")\s*\)/g)) {
        const t = resolveTo(f, m[2]), c = cmdAt(m.index);
        if (c && t && rooms[t] && t !== f && !XBAD.test(t)) ts.push({ c, d: m[1], t });
      }
      // room = find_object(X) / load_object(X)，之后 me->move(room)
      const vars = {};
      for (const m of b.matchAll(/(\w+)\s*=\s*(?:find_object|load_object)\s*\(\s*(__DIR__\s*"[^"]+"|"\/[^"]+")\s*\)/g)) vars[m[1]] = m[2];
      for (const m of b.matchAll(/->move\s*\(\s*(__DIR__\s*"[^"]+"|"\/[^"]+"|\w+)\s*\)/g)) {
        const e = /^\w+$/.test(m[1]) ? vars[m[1]] : m[1];
        const t = e && resolveTo(f, e), c = cmdAt(m.index);
        if (c && t && rooms[t] && t !== f && !XBAD.test(t)) ts.push({ c, t });
      }
      if (new Set(ts.map((x) => x.t)).size === 1 && !got.some((x) => x.c === ts[0].c)) got.push(ts[0]);
    }
    if (got.length) out[f] = got;
  }
  out.__skipped = cond.n;
  return out;
}

// fly 指令的落脚点：从 cmds/usr/fly.c 里读出「简称 → 房间」
function flyPoints(mudlibDir) {
  const f = path.join(mudlibDir, 'cmds/usr/fly.c');
  if (!fs.existsSync(f)) return [];
  const src = fs.readFileSync(f, 'utf8');
  const seen = new Map();
  for (const m of src.matchAll(/"([a-z0-9]+)"\s*:\s*"(\/d\/[^"]+)"/g)) {
    const room = norm(m[2]);
    if (!seen.has(room) || m[1].length < seen.get(room).length) seen.set(room, m[1]);
  }
  return [...seen].map(([room, key]) => ({ key, room }));
}

function regionNames(mudlibDir) {
  const f = path.join(mudlibDir, 'adm/daemons/mapd.c');
  const names = {};
  if (fs.existsSync(f)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/"([a-z0-9_]+)"\s*:\s*"([^"]+)"/g)) names[m[1]] ??= m[2];
  return names;
}

export async function genWiki({ driverDir, mudlibDir, config = 'config.zj', title = '' }) {
  const raw = await dump({ driverDir, mudlibDir, config });
  const regionName = regionNames(mudlibDir);

  // rooms
  const rooms = {};
  for (const r of raw.room) {
    const f = norm(r.f);
    const ex = {};
    for (const [d, to] of Object.entries(r.e || {})) ex[d] = norm(to);
    rooms[f] = { s: plain(r.s), e: ex, n: Object.keys(r.n || {}).map(norm), nf: r.nf ? 1 : 0, o: r.o ? 1 : 0 };
  }
  // where each npc / item stands
  const npcAt = {}, itemAt = {};
  for (const [f, r] of Object.entries(rooms)) for (const o of r.n) (npcAt[o] ||= []).push(f), (itemAt[o] ||= []).push(f);

  // 特殊进出：房间源码里 add_action 的指令会开出口（knock gate → 开 east）或直接把人挪走（enter dong）
  const xe = actionEdges(mudlibDir, rooms);
  const xSkipped = xe.__skipped; delete xe.__skipped;
  for (const f in xe) rooms[f].x = xe[f];

  // shortest walk from a fly point to every room
  const fly = flyPoints(mudlibDir).filter((p) => rooms[p.room]);
  const route = {};
  {
    const q = [];
    for (const p of fly) if (!route[p.room]) { route[p.room] = { from: p.key, prev: null, d: null, len: 0 }; q.push(p.room); }
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      const edges = Object.entries(rooms[cur].e).map(([d, to]) => [[d], to]);
      for (const x of rooms[cur].x || []) edges.push([x.d ? [x.c, x.d] : [x.c], x.t]);
      for (const [d, to] of edges) {
        if (!rooms[to] || route[to]) continue;
        route[to] = { from: route[cur].from, prev: cur, d, len: route[cur].len + 1 };
        q.push(to);
      }
    }
  }
  const pathTo = (f) => {
    const r = route[f];
    if (!r) return null;
    const steps = [];
    for (let c = f; route[c] && route[c].prev; c = route[c].prev) steps.unshift(...route[c].d);
    return { fly: r.from, steps };
  };

  // npcs
  const npcs = {};
  for (const n of raw.npc) {
    const f = norm(n.f);
    const sk = {};
    for (const [k, v] of Object.entries(n.sk || {})) if (typeof v === 'number') sk[k] = v;
    npcs[f] = {
      name: plain(n.name), id: (n.ids || [])[0] || '', nick: plain(n.nick), title: plain(n.title),
      gender: typeof n.gender === 'string' ? n.gender : '', age: num(n.age), exp: num(n.exp), qi: num(n.qi), neili: num(n.neili),
      shen: num(n.shen), long: plain(n.long),
      fam: n.fam && typeof n.fam.n === 'string' ? { n: plain(n.fam.n), g: num(n.fam.g), t: plain(n.fam.t) } : null,
      sk, map: n.map && typeof n.map === 'object' ? n.map : {}, teach: n.teach ? 1 : 0,
      lt: n.lt ? learnOpen(mudlibDir, f) : 0,
      sell: (n.sell || []).filter((x) => typeof x === 'string').map(norm),
      inv: (n.inv || []).map(norm),
      at: npcAt[f] || [],
    };
  }
  // items
  const items = {};
  for (const it of raw.item) {
    const f = norm(it.f);
    const book = it.skill && typeof it.skill === 'object' && typeof it.skill.name === 'string' ? it.skill : null;
    items[f] = {
      name: plain(it.name), unit: plain(it.unit), value: num(it.value), w: num(it.w), long: plain(it.long),
      book: book ? { s: book.name, min: num(book.min_skill), max: num(book.max_skill), exp: num(book.exp_required) } : null,
      wp: it.wp && typeof it.wp === 'object' ? it.wp : null, ap: it.ap && typeof it.ap === 'object' ? it.ap : null,
      skt: typeof it.skt === 'string' ? it.skt : '', at: typeof it.at === 'string' ? it.at : '',
      food: num(it.food), water: it.water && typeof it.water === 'object' ? 1 : 0,
      sold: [], carried: [], found: itemAt[f] || [],
    };
  }
  for (const [nf, n] of Object.entries(npcs)) {
    for (const s of n.sell) if (items[s]) items[s].sold.push(nf);
    for (const s of n.inv) if (items[s] && !items[s].carried.includes(nf)) items[s].carried.push(nf);
  }
  // skills
  const skills = {};
  for (const s of raw.skill) {
    skills[s.id] = {
      name: plain(s.name) || s.id, type: s.type, enable: s.enable || [],
      pfm: (s.pfm || []).map((p) => { const w = p.split(/[\t ]/); return { id: w[0], name: plain(w.slice(1, -1).join('')), k: w[w.length - 1] }; }),
      teach: [], know: 0, books: [],
    };
  }
  for (const [nf, n] of Object.entries(npcs)) for (const k of Object.keys(n.sk)) {
    if (!skills[k]) continue;
    skills[k].know++;
    if (n.teach && n.fam) skills[k].teach.push([nf, n.sk[k]]);
  }
  for (const s of Object.values(skills)) s.teach.sort((a, b) => b[1] - a[1]);
  for (const [f, it] of Object.entries(items)) if (it.book && skills[it.book.s]) skills[it.book.s].books.push(f);

  // 拜师条件（静态解析源码）
  const skName = (k) => (skills[k] && skills[k].name) || k;
  for (const [nf, n] of Object.entries(npcs)) if (n.teach) {
    const rc = recruitInfo(mudlibDir, nf, skName);
    if (rc && (rc.req.length || rc.said.length || rc.daily)) n.rc = rc;
  }

  // families
  const fams = {};
  for (const [nf, n] of Object.entries(npcs)) if (n.fam) (fams[n.fam.n] ||= []).push(nf);

  // regions
  const regions = {};
  for (const f of Object.keys(rooms)) {
    const k = f.split('/')[2];
    (regions[k] ||= { name: regionName[k] || k, rooms: [] }).rooms.push(f);
  }
  const roomOut = {};
  for (const [f, r] of Object.entries(rooms)) roomOut[f] = { ...r, go: pathTo(f) };

  // 谁会给你改身份（出家、入道、当乞丐…），拜师条件里「身份必须是 X」时用
  const cls = classGivers(mudlibDir, Object.keys(npcs));

  return { title, made: new Date().toISOString().slice(0, 10), fly, skills, npcs, items, rooms: roomOut, fams, regions, cls };
}
