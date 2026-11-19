// Offline wiki data generator.
// Boots the game's mudlib inside the wasm driver (no network, no player), loads every
// skill / npc / room / item file through web/wiki/wikid.c and turns what the game itself
// reports into one compact JSON object for the wiki page.
//
//   import { genWiki } from './wiki/gen.mjs';
//   const data = await genWiki({ driverDir, mudlibDir, config: 'config.zj' });
import fs from 'node:fs';
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
const norm = (f) => (typeof f === 'string' ? f.replace(/\.c$/, '') : '');
const num = (v) => (typeof v === 'number' ? v : 0);

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
    rooms[f] = { s: plain(r.s), e: ex, n: Object.keys(r.n || {}).map(norm), nf: r.nf ? 1 : 0 };
  }
  // where each npc / item stands
  const npcAt = {}, itemAt = {};
  for (const [f, r] of Object.entries(rooms)) for (const o of r.n) (npcAt[o] ||= []).push(f), (itemAt[o] ||= []).push(f);

  // shortest walk from a fly point to every room
  const fly = flyPoints(mudlibDir).filter((p) => rooms[p.room]);
  const route = {};
  {
    const q = [];
    for (const p of fly) if (!route[p.room]) { route[p.room] = { from: p.key, prev: null, d: null, len: 0 }; q.push(p.room); }
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      for (const [d, to] of Object.entries(rooms[cur].e)) {
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
    for (let c = f; route[c] && route[c].prev; c = route[c].prev) steps.push(route[c].d);
    return { fly: r.from, steps: steps.reverse() };
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

  return { title, made: new Date().toISOString().slice(0, 10), fly, skills, npcs, items, rooms: roomOut, fams, regions };
}
