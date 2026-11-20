// minimap.js -- 小地图（指间 MUD 单机版附加功能）
//
// 不改服务端：客户端在你走动时记下「从哪个房间往哪个方向到了哪个房间」，
// 自己拼出地图，存在本机（每个游戏一份）。走过的地方逐渐点亮，没去过的是空白。
//
// 入口：方向按钮九宫格中间那格（当前房间名），点一下展开，再点一次或点空白处关闭。
// 展开后以当前位置为中心；单指拖动查看别处，双指捏合（电脑上滚轮）或 ＋／－ 缩放，「全图」显示整张图；
// 点相邻房间直接走一步；点远处去过的房间，按记下的出口找最短路一步步自动走过去，
// 走不了（没出路、被拦、对不上地图、5 秒没动静）或你自己输入指令时自动停下。
//
// 定位方式：
//   - 往东南西北等方向走一步，就在网格上挪一格；
//   - 方向不明（服务端替你走的、out/enter 之类的出口）时，用出口上的房间名推断：
//     上一个房间往哪个方向的出口写着新房间的名字，就是往那边走了；
//     或者新房间哪个方向的出口写着上一个房间的名字，就是从那边来的；
//   - 飞行、传送等推断不出来时，按「房间名 + 出口方向」在已记下的地图里找，
//     找到唯一一个就回到那里，找不到就另起一张新图。
(function () {
  'use strict';
  if (typeof window.writeToST !== 'function' || typeof window.writeToEX !== 'function') return;

  // ---------- directions ----------
  const D = {
    north: [0, -1, 0], south: [0, 1, 0], east: [1, 0, 0], west: [-1, 0, 0],
    northeast: [1, -1, 0], northwest: [-1, -1, 0], southeast: [1, 1, 0], southwest: [-1, 1, 0],
    up: [0, 0, 1], down: [0, 0, -1],
  };
  for (const b of ['north', 'south', 'east', 'west']) {
    D[b + 'up'] = [D[b][0], D[b][1], 1];
    D[b + 'down'] = [D[b][0], D[b][1], -1];
  }
  const ABBR = { n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest',
    se: 'southeast', sw: 'southwest', u: 'up', d: 'down' };
  const opposite = (d) => {
    const v = D[d];
    if (!v) return null;
    for (const k in D) if (D[k][0] === -v[0] && D[k][1] === -v[1] && D[k][2] === -v[2]) return k;
    return null;
  };

  const GAME_ID = (location.pathname.match(/([^/]+)\/(?:index\.html)?$/) || [])[1] || '';

  // ---------- 百科地图：游戏百科（../wiki/<游戏>.json）里有全部房间和出口 ----------
  // 认出自己在百科里的哪个房间（房间名 + 出口方向；同名的靠上一个房间和走的方向区分），
  // 就能把没去过的房间也画出来，点哪里都能走：连得上就一步步走，连不上就先 fly 再走。
  let W = null, wTried = false, wCur = null, wMode = false, wLast = null, wLastAt = 0;
  const dirKey = (e) => Object.keys(e || {}).filter((d) => D[d]).sort().join(',');
  function wLoad() {
    if (W || wTried || !GAME_ID) return;
    wTried = true;
    fetch('../wiki/' + encodeURIComponent(GAME_ID) + '.json').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j || !j.rooms) return;
      const byT = {};
      for (const f in j.rooms) (byT[j.rooms[f].s] ||= []).push(f);
      const names = new Set();
      for (const k in j.npcs || {}) names.add(j.npcs[k].name);
      for (const k in j.items || {}) names.add(j.items[k].name);
      W = { rooms: j.rooms, byT, fly: j.fly || [], names, npcs: j.npcs || {}, items: j.items || {} };
      wLocate();
      if (panel) render();
    }).catch(() => { /* no wiki for this game, or offline and not cached */ });
  }
  function wLocate() {
    if (!W || !roomTitle) return;
    const all = W.byT[roomTitle] || [], want = dirKey(roomExits);
    let cands = all.filter((f) => dirKey(W.rooms[f].e) === want);
    if (!cands.length) cands = all;              // 出口和百科对不上（门关着之类），只按名字
    const was = wCur && W.rooms[wCur];
    let f = null;
    if (was && wLast && Date.now() - wLastAt < 8000 && cands.includes(was.e[wLast])) f = was.e[wLast];
    if (!f && was && wLast && Date.now() - wLastAt < 25000) {   // 敲门后进门、钻洞、上船到岸
      const x = (was.x || []).find((y) => (y.d ? y.d === wLast : y.c === wLast) && cands.includes(y.t));
      if (x) f = x.t;
    }
    if (!f && wCur && cands.includes(wCur)) f = wCur;
    if (!f && was) { const t = Object.values(was.e).filter((x) => cands.includes(x)); if (t.length === 1) f = t[0]; }
    if (!f && wLast && /^fly\s/.test(wLast)) { const p = W.fly.find((x) => 'fly ' + x.key === wLast); if (p && cands.includes(p.room)) f = p.room; }
    if (!f && cands.length === 1) f = cands[0];
    if (!f && wCur && cands.length > 1) {
      const reg = wCur.split('/')[2], same = cands.filter((x) => x.split('/')[2] === reg);
      if (same.length === 1) f = same[0];
    }
    wCur = f;
  }
  // 百科图里从 from 到 to 的最短出口序列
  // 房间的所有走法：普通出口 [[方向], 目标]，加上百科从源码读出的特殊动作（敲门、钻洞、上船）
  // 特殊动作 x={c,d?,t}：有 d 的是「先 c 开门，再往 d 走」，没有 d 的是「c 直接把人带过去」
  function wEdges(r) {
    const out = Object.keys(r.e).map((d) => [[d], r.e[d]]);
    for (const x of r.x || []) out.push([x.d ? [x.c, x.d] : [x.c], x.t]);
    return out;
  }
  function wPath(from, to) {
    if (!W || !from || from === to) return from === to ? [] : null;
    const back = { [from]: null }, q = [from];
    for (let h = 0; h < q.length && q.length < 6000; h++) {
      const r = W.rooms[q[h]];
      if (!r) continue;
      for (const [cmd, t] of wEdges(r)) {
        if (t in back || !W.rooms[t]) continue;
        back[t] = [q[h], cmd];
        if (t === to) { const p = []; for (let k = to; back[k]; k = back[k][0]) p.unshift(...back[k][1]); return p; }
        q.push(t);
      }
    }
    return null;
  }
  // 最近的室外房间（fly 只能在室外用）
  function wOutdoor(from) {
    if (!from || !W.rooms[from]) return null;
    if (W.rooms[from].o) return [];
    const back = { [from]: null }, q = [from];
    for (let h = 0; h < q.length && h < 400; h++) {
      const r = W.rooms[q[h]];
      for (const [cmd, t] of wEdges(r)) {
        if (t in back || !W.rooms[t]) continue;
        back[t] = [q[h], cmd];
        if (W.rooms[t].o) { const p = []; for (let k = t; back[k]; k = back[k][0]) p.unshift(...back[k][1]); return p; }
        q.push(t);
      }
    }
    return null;
  }
  function wPlan(to) {
    const r = W.rooms[to];
    if (!r) return null;
    if (commitTimer) { clearTimeout(commitTimer); commit(); }   // 刚到一个房间还没记下来：先记，免得按上一个房间算路
    let p = wPath(wCur, to);
    if (p && r.go && p.length > r.go.steps.length + 12) p = null;   // 远：先 fly 更快
    if (!p && r.go) {
      const out = wCur ? wOutdoor(wCur) : [];
      p = (out || []).concat(['fly ' + r.go.fly], r.go.steps);
    }
    return p;
  }
  // 「去 名字」：名字可以是地点、人物或物品，走到最近的一处
  function wTargets(name) {
    const out = new Map();   // 房间 → 说明
    const add = (f, why) => { if (W.rooms[f] && !out.has(f)) out.set(f, why); };
    for (const f of W.byT[name] || []) add(f, '');
    for (const k in W.npcs) { const n = W.npcs[k]; if (n.name === name) for (const f of n.at || []) add(f, n.name + '在这里'); }
    for (const k in W.items) {
      const it = W.items[k];
      if (it.name !== name) continue;
      for (const f of it.found || []) add(f, it.name + '在地上');
      for (const nf of it.sold || []) for (const f of (W.npcs[nf] && W.npcs[nf].at) || []) add(f, W.npcs[nf].name + '卖' + it.name);
      for (const nf of it.carried || []) for (const f of (W.npcs[nf] && W.npcs[nf].at) || []) add(f, W.npcs[nf].name + '身上有');
    }
    return out;
  }
  // 从当前房间算到每个房间要几步（只走路，不飞）
  function wDist(from, limit) {
    const dist = { [from]: 0 }, q = [from];
    for (let h = 0; h < q.length && q.length < limit; h++) {
      const r = W.rooms[q[h]];
      if (!r) continue;
      for (const [cmd, t] of wEdges(r)) if (!(t in dist) && W.rooms[t]) { dist[t] = dist[q[h]] + cmd.length; q.push(t); }
    }
    return dist;
  }
  function wGoto(name) {
    let ts = wTargets(name);
    if (!ts.size) {   // 没有完全同名的，再试名字里包含这几个字的（只有一种名字时才用）
      const like = new Set();
      for (const t in W.byT) if (t.includes(name)) like.add(t);
      for (const k in W.npcs) if (W.npcs[k].name.includes(name)) like.add(W.npcs[k].name);
      if (like.size === 1) { const n = [...like][0]; ts = wTargets(n); name = n; }
      else if (like.size > 1) { note('「' + name + '」有好几个：' + [...like].slice(0, 8).join('、') + (like.size > 8 ? '…' : '') + '。说全名。'); return; }
    }
    if (!ts.size) {
      const known = Object.values(W.npcs).some((n) => n.name === name) || Object.values(W.items).some((it) => it.name === name);
      note(known ? '「' + name + '」不在固定的房间里（会到处走、任务才出现，或者要自己做出来），没法直接带你去。'
        : '百科里没有叫「' + name + '」的地点、人物或物品。');
      return;
    }
    if (!wCur) { note('还没认出你现在在哪个房间，走一步再试。'); return; }
    const dist = wDist(wCur, 8000), outd = wOutdoor(wCur);
    let best = null, bestCost = Infinity;
    for (const [f, why] of ts) {
      let c = f in dist ? dist[f] : Infinity;
      const g = W.rooms[f].go;
      if (g && outd) c = Math.min(c, outd.length + 12 + g.steps.length);
      if (c < bestCost) { bestCost = c; best = [f, why]; }
    }
    if (!best || bestCost === Infinity) { note('知道「' + name + '」在哪，但百科里找不到走过去的路。'); return; }
    if (best[0] === wCur) { note('「' + name + '」就在这里。'); return; }
    note('去' + W.rooms[best[0]].s + (best[1] ? '（' + best[1] + '）' : '') + (ts.size > 1 ? '，' + ts.size + ' 处里最近的一处' : '') + '。');
    wWalk(best[0]);
  }
  function wWalk(to) {
    const r = W.rooms[to];
    if (!r) return;
    stopRoute(null);
    const p = wPlan(to);
    if (!p) { flash('去不了「' + r.s + '」：百科里没有找到路。'); return; }
    if (!p.length) return;
    runQueue(p);
    queue.wTarget = to;
    const fi = p.findIndex((c) => /^fly /.test(c));
    flash('去「' + r.s + '」：' + (fi < 0 ? p.length + ' 步' : (fi ? '先走 ' + fi + ' 步到室外，' : '') + p[fi] + ' 再走 ' + (p.length - fi - 1) + ' 步') + '。');
  }
  // 以当前房间为中心摆坐标（只看平面方向；上下楼、进出门摆在旁边空格）
  function wLayout(center, limit) {
    const pos = { [center]: [0, 0] }, used = { '0,0': center }, edges = [], q = [center];
    const free = (x, y) => {
      if (!used[x + ',' + y]) return [x, y];
      for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !used[(x + dx) + ',' + (y + dy)]) return [x + dx, y + dy];
      }
      return null;
    };
    for (let h = 0; h < q.length && q.length < limit; h++) {
      const f = q[h], r = W.rooms[f], [x, y] = pos[f];
      if (!r) continue;
      for (const d of Object.keys(r.e).sort((a, b) => (D[b] && !D[b][2] ? 1 : 0) - (D[a] && !D[a][2] ? 1 : 0))) {
        const t = r.e[d];
        if (!W.rooms[t]) continue;
        if (t in pos) { edges.push([f, t]); continue; }
        const v = D[d] || [0, 0, 0];
        const sp = free(x + v[0], y + v[1] + (v[0] || v[1] ? 0 : 1));
        if (!sp) continue;
        pos[t] = sp; used[sp[0] + ',' + sp[1]] = t; edges.push([f, t]); q.push(t);
      }
    }
    return { pos, edges };
  }
  const WV = 'minimap_wv';
  let wSeen = new Set();
  try { wSeen = new Set(JSON.parse((window.zjStore && zjStore.getItem(WV)) || '[]')); } catch (e) { /* none */ }
  let wSeenTimer = 0;
  function markSeen(f) {
    if (!f || wSeen.has(f)) return;
    wSeen.add(f);
    clearTimeout(wSeenTimer);
    wSeenTimer = setTimeout(() => { try { zjStore.setItem(WV, JSON.stringify([...wSeen])); } catch (e) { /* full */ } }, 1000);
  }

  // ---------- state ----------
  const KEY = 'minimap';
  const MAX_CELLS = 4000;
  let S = { segs: {}, next: 1, cur: null };
  try {
    const raw = window.zjStore && zjStore.getItem(KEY);
    if (raw) { const j = JSON.parse(raw); if (j && j.segs) S = j; }
  } catch (e) { /* start fresh */ }
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        let n = 0; const ids = Object.keys(S.segs).map(Number).sort((a, b) => a - b);
        for (const id of ids) n += Object.keys(S.segs[id]).length;
        // 太大就丢掉最早的图（当前这张不丢）
        while (n > MAX_CELLS && ids.length > 1) {
          const id = ids.shift();
          if (S.cur && S.cur.seg === id) { ids.push(id); continue; }
          n -= Object.keys(S.segs[id]).length; delete S.segs[id];
        }
        zjStore.setItem(KEY, JSON.stringify(S));
      } catch (e) { /* storage full: keep going in memory */ }
    }, 800);
  }
  const k3 = (x, y, z) => x + ',' + y + ',' + z;
  const cellAt = (seg, x, y, z) => (S.segs[seg] || {})[k3(x, y, z)];
  const curCell = () => S.cur && cellAt(S.cur.seg, S.cur.x, S.cur.y, S.cur.z);

  const plain = (s) => String(s || '').replace(/\x1b\[[0-9;]*m/g, '').replace(/<[^>]*>/g, '')
    .replace(/\$br#/g, '').replace(/[\r\n]/g, '').trim();

  // ---------- what the client is told about the current room ----------
  let roomTitle = null;      // 当前房间名（服务端刚发来的）
  let roomExits = {};        // dir -> 出口上写的名字（目的地房间名）
  let prev = null;           // 上一个房间：{ title, exits, pos }
  let lastDir = null, lastDirAt = 0;
  let commitTimer = 0;

  function noteCmd(data) {
    let c = String(data || '').trim().toLowerCase();
    if (c.startsWith('go ')) c = c.slice(3).trim();
    c = ABBR[c] || c;
    if (D[c]) { lastDir = c; lastDirAt = Date.now(); }
    wLast = c; wLastAt = Date.now();
  }

  function sameExits(a, b) {
    const ka = Object.keys(a).filter((d) => D[d]).sort().join(','), kb = Object.keys(b).filter((d) => D[d]).sort().join(',');
    return ka === kb;
  }

  function newSeg() { const id = S.next++; S.segs[id] = {}; return id; }

  function put(seg, x, y, z) {
    S.segs[seg] = S.segs[seg] || {};
    const key = k3(x, y, z), old = S.segs[seg][key];
    S.segs[seg][key] = { t: roomTitle, e: Object.assign({}, roomExits) };
    if (old && old.t === roomTitle && old.l) S.segs[seg][key].l = old.l;
    S.cur = { seg, x, y, z };
  }
  // 从某格往 d 走到哪一格：有记下的连接（地图不方正时）就用它，否则按方向挪一格
  function stepKey(seg, key, d) {
    const c = (S.segs[seg] || {})[key];
    if (c && c.l && c.l[d]) return c.l[d];
    const v = D[d];
    if (!v) return null;
    const [x, y, z] = key.split(',').map(Number);
    return k3(x + v[0], y + v[1], z + v[2]);
  }
  function link(seg, fromKey, d, toKey) {
    const c = (S.segs[seg] || {})[fromKey];
    if (!c) return;
    const v = D[d], [x, y, z] = fromKey.split(',').map(Number);
    if (v && k3(x + v[0], y + v[1], z + v[2]) === toKey) { if (c.l) delete c.l[d]; return; }
    (c.l = c.l || {})[d] = toKey;
  }
  // 房间该放的那格被别的房间占了：放到最近的空格（街道常有同名房间，不按名字合并）
  function placeNear(seg, x, y, z) {
    const g = S.segs[seg] || {};
    for (let r = 1; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!g[k3(x + dx, y + dy, z)]) return [x + dx, y + dy, z];
    }
    return null;
  }

  // 新房间的名字和出口都到齐了：把它放到地图上
  function commit() {
    commitTimer = 0;
    if (!roomTitle) return;
    const here = curCell();
    let dir = null;

    if (prev && prev.pos) {
      // 1) 刚才自己点了方向，而且上一个房间那个方向的出口通向这里
      if (lastDir && Date.now() - lastDirAt < 4000 && prev.exits[lastDir] !== undefined &&
          (!prev.exits[lastDir] || plain(prev.exits[lastDir]) === roomTitle)) dir = lastDir;
      // 2) 上一个房间哪个方向的出口写着这个房间的名字
      if (!dir) {
        const c = Object.keys(prev.exits).filter((d) => D[d] && plain(prev.exits[d]) === roomTitle);
        if (c.length === 1) dir = c[0];
        else if (c.length > 1 && c.includes(lastDir)) dir = lastDir;
      }
      // 3) 这个房间哪个方向的出口写着上一个房间的名字：从那边来的
      if (!dir) {
        const c = Object.keys(roomExits).filter((d) => D[d] && plain(roomExits[d]) === prev.title);
        if (c.length === 1) dir = opposite(c[0]);
      }
    }

    let spot = null;
    const ex = route && route.expect, exCell = ex && cellAt(ex.seg, ex.x, ex.y, ex.z);
    if (exCell && exCell.t === roomTitle && prev && prev.pos && S.cur && S.cur.seg === ex.seg) {
      // 自动走路时按地图走的这一步：到的就是地图上那个房间
      spot = [ex.seg, ex.x, ex.y, ex.z];
      put(...spot);
      link(ex.seg, ex.from, ex.d, k3(ex.x, ex.y, ex.z));
    } else if (dir && D[dir] && prev && prev.pos) {
      const p = prev.pos, pk = k3(p.x, p.y, p.z);
      const tk = stepKey(p.seg, pk, dir), [tx, ty, tz] = tk.split(',').map(Number);
      const there = cellAt(p.seg, tx, ty, tz);
      if (!there || there.t === roomTitle) spot = [p.seg, tx, ty, tz];
      else {
        // MUD 的地图不一定方正：那一格已经记着另一个房间，不覆盖它，放到旁边并记下这条连接
        const v = D[dir], alt = placeNear(p.seg, p.x + v[0], p.y + v[1], p.z + v[2]);
        if (alt) spot = [p.seg, ...alt];
      }
      if (spot) {
        put(...spot);
        const nk = k3(spot[1], spot[2], spot[3]);
        link(p.seg, pk, dir, nk);
        const back = opposite(dir);
        if (back && roomExits[back] !== undefined && (!roomExits[back] || plain(roomExits[back]) === prev.title)) link(p.seg, nk, back, pk);
      }
    }
    if (spot) {
      // 已放好
    } else if (here && here.t === roomTitle && sameExits(here.e, roomExits)) {
      // 原地刷新（look、出口变化等）
      here.e = Object.assign({}, roomExits);
    } else {
      // 4) 推断不出来（飞行、传送、out/enter）：在记下的地图里找同名、出口一样的房间
      const hits = [];
      for (const seg in S.segs) for (const key in S.segs[seg]) {
        const c = S.segs[seg][key];
        if (c.t === roomTitle && sameExits(c.e, roomExits)) hits.push([+seg, key]);
      }
      if (hits.length === 1) {
        const [seg, key] = hits[0], [x, y, z] = key.split(',').map(Number);
        put(seg, x, y, z);
      } else put(newSeg(), 0, 0, 0);
    }
    wLocate();
    lastDir = null;
    save();
    routeArrived();
    if (panel) render();
  }
  function scheduleCommit() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 60); }

  // ---------- hook the client ----------
  const origST = window.writeToST, origEX = window.writeToEX, origRM = window.removeEXIT;
  window.writeToST = function (str) {
    if (commitTimer) { clearTimeout(commitTimer); commit(); }
    const c = curCell();
    prev = roomTitle ? { title: roomTitle, exits: roomExits, pos: S.cur ? Object.assign({}, S.cur) : null } : null;
    if (prev && !c) prev.pos = null;
    roomTitle = plain(str);
    roomExits = {};
    scheduleCommit();
    if (queue && queue.move) {
      const next = queue.special && queue.cmds[1];
      // 特殊动作：落到中转房间（船舱）时继续等，直到出现下一条指令能用的房间或超时
      if (queue.special && queue.expectT && plain(str) !== queue.expectT) { /* still travelling */ }
      else { queue.move = false; queue.cmds.shift(); queue.retry = 0; clearTimeout(queue.timer); queue.timer = setTimeout(qNext, next ? 600 : 300); }
    }
    return origST.apply(this, arguments);
  };
  window.writeToEX = function (str) {
    for (const part of String(str || '').split('$zj#')) {
      const f = part.split(':');
      if (f.length < 2 || !f[0]) continue;
      roomExits[f[0]] = f[1];
    }
    scheduleCommit();
    return origEX.apply(this, arguments);
  };
  if (typeof origRM === 'function') {
    window.removeEXIT = function (str) {
      const id = plain(str);
      for (const d in roomExits) if (d === id) delete roomExits[d];
      scheduleCommit();
      return origRM.apply(this, arguments);
    };
  }
  if (window.sock && typeof sock.emit === 'function') {
    const origEmit = sock.emit;
    sock.emit = function (ev, data) {
      if (ev === 'stream' && !autoSending) {
        const wq = String(data).trim().match(/^(?:wiki|百科)(?:\s+(.*))?$/i);
        if (wq && W) { openWiki(wq[1] || ''); return; }
        const gq = String(data).trim().match(/^去\s*(.+)$/);
        if (gq && W) { stopRoute(null); stopQueue(null); wGoto(gq[1].trim()); return; }
        const parts = String(data).split(/[;；]/).map((x) => x.trim()).filter(Boolean);
        if (route) stopRoute('你自己输入了指令，自动走路已停止。');
        if (queue) stopQueue(null);
        if (parts.length > 1) { runQueue(parts); return; }
      }
      if (ev === 'stream') noteCmd(data);
      return origEmit.apply(this, arguments);
    };
  }
  let autoSending = false;
  function go(dir) {
    if (route) stopRoute(null);
    if (window.sock) sock.emit('stream', dir + '\n');
  }
  function sendAuto(dir) { autoSending = true; try { if (window.sock) sock.emit('stream', dir + '\n'); } finally { autoSending = false; } }

  // ---------- 自动走路：点地图上去过的远处房间，按记下的出口一步步走过去 ----------
  let route = null; // { path:[dir], target:{seg,x,y,z}, title, expect, timer, retry }
  const samePos = (a, b) => !!(a && b && a.seg === b.seg && a.x === b.x && a.y === b.y && a.z === b.z);

  // 在当前这张图里按出口找最短路（只走有坐标的方向，out/enter 这类出口不走）
  function findPath(from, to) {
    if (!from || !to || from.seg !== to.seg) return null;
    const seg = S.segs[from.seg] || {};
    const start = k3(from.x, from.y, from.z), goal = k3(to.x, to.y, to.z);
    if (start === goal) return [];
    const back = { [start]: null }, q = [start];
    for (let h = 0; h < q.length; h++) {
      const key = q[h], c = seg[key];
      if (!c) continue;
      for (const d of Object.keys(c.e).sort()) {
        if (!D[d]) continue;
        const label = plain(c.e[d]);
        let nk = stepKey(from.seg, key, d);
        // 那个方向其实通向别的房间（地图不方正），或那格没记录：
        // 按出口名找一个同名、而且反方向出口写着本房间名字的房间（唯一才算）
        if (!nk || !seg[nk] || (label && label !== seg[nk].t)) nk = label ? guessLink(seg, c.t, d, label) : null;
        if (!nk || nk in back || !seg[nk]) continue;
        back[nk] = [key, d];
        if (nk === goal) {
          const path = [];
          for (let k = goal; back[k]; k = back[k][0]) path.unshift({ d: back[k][1], k });
          return path;
        }
        q.push(nk);
      }
    }
    return null;
  }

  function guessLink(seg, fromTitle, d, label) {
    const back = opposite(d);
    if (!back) return null;
    let hit = null;
    for (const k in seg) {
      const c = seg[k];
      if (c.t !== label || plain(c.e[back]) !== fromTitle) continue;
      if (hit) return null;
      hit = k;
    }
    return hit;
  }
  function startRoute(to) {
    stopRoute(null);
    const path = findPath(S.cur, to);
    const c = to && cellAt(to.seg, to.x, to.y, to.z);
    if (!path) { flash('走不到「' + (c ? c.t : '那里') + '」：记下的地图里没有连过去的路。'); return; }
    if (!path.length) return;
    route = { path, target: to, title: c ? c.t : '', expect: null, timer: 0, retry: 0 };
    nextStep();
  }
  function nextStep() {
    if (!route) return;
    clearTimeout(route.timer);
    if (!route.path.length) { const t = route.title; route = null; flash('已到达「' + t + '」。'); return; }
    const step = route.path[0], d = step.d, c = S.cur;
    const [ex, ey, ez] = step.k.split(',').map(Number);
    route.expect = { seg: c.seg, x: ex, y: ey, z: ez, from: k3(c.x, c.y, c.z), d };
    route.timer = setTimeout(() => stopRoute('走了 5 秒还没到下一个房间，自动走路已停止。'), 5000);
    sendAuto(d);
    if (panel) render();
  }
  function routeArrived() {
    if (!route || !route.expect) return;
    if (samePos(S.cur, route.expect)) {
      route.path.shift(); route.expect = null; route.retry = 0;
      clearTimeout(route.timer);
      route.timer = setTimeout(nextStep, 250);
    } else stopRoute('走到的地方和地图对不上，自动走路已停止。');
  }
  function stopRoute(msg) {
    if (!route) return;
    clearTimeout(route.timer); route = null;
    if (msg) flash(msg); else if (panel) render();
  }
  // ---------- 用分号连起来的多条指令（百科里复制的路线 fly xx;north;east…）----------
  // 一条条发：走路的等进了下一个房间再发下一条，fly 等落地，别的指令隔 0.8 秒。
  let queue = null; // { cmds, timer, retry, move, fly }
  function runQueue(cmds) { stopQueue(null); queue = { cmds, timer: 0, retry: 0, move: false, fly: false }; qNext(); }
  function qNext() {
    if (!queue) return;
    clearTimeout(queue.timer);
    if (!queue.cmds.length) { queue = null; note('指令都执行完了。'); return; }
    const c = queue.cmds[0];
    queue.fly = /^fly\s/.test(c);
    // 特殊动作（百科里记的 x.c 不带方向的那种）也会换房间，按走路等
    const sx = !queue.fly && W && wCur && W.rooms[wCur] && (W.rooms[wCur].x || []).find((x) => x.c === c && !x.d);
    queue.special = !!sx;
    queue.expectT = sx && W.rooms[sx.t] ? W.rooms[sx.t].s : null;
    queue.move = !queue.fly && (queue.special || !!roomExits[c] || !!D[c] || /^go\s/.test(c));
    sendAuto(c);
    if (panel && wMode) render();
    if (queue.bai && /^apprentice /.test(c)) { queue.bai.sent = true; queue.timer = setTimeout(finishBai, 3000); return; }
    if (queue.fly) queue.timer = setTimeout(() => stopQueue('飞了 15 秒还没落地，后面的指令不发了。'), 15000);
    else if (queue.move) {
      // 上船之类会先进船舱再过几秒到岸：第一次换房间不算，等到岸（最多 20 秒）
      const wait = queue.special ? 20000 : 5000;
      queue.timer = setTimeout(() => stopQueue('「' + c + '」' + (queue.special ? '过了 20 秒还没到' : '走了 5 秒还没到') + '，后面的指令不发了。'), wait);
    }
    else queue.timer = setTimeout(() => { if (!queue) return; queue.cmds.shift(); qNext(); }, 800);
  }
  function stopQueue(msg) {
    if (!queue) return;
    clearTimeout(queue.timer); queue = null;
    if (msg) note(msg);
  }
  // 地图开着就在地图底部提示，没开就打到主屏幕上
  function note(m) {
    if (panel) { flash(m); return; }
    if (typeof window.writeToScreen === 'function') window.writeToScreen('\x1b[33m【连续指令】' + m + '\x1b[0m');
  }
  // 拜师结果：apprentice 发出后 3 秒内的输出
  function finishBai() {
    if (!queue || !queue.bai) return;
    const b = queue.bai, all = b.lines.join('\n');
    queue = null;
    const said = b.lines.filter((l) => /说道|说：|「/.test(l) && !/想要拜|磕头|恭喜/.test(l)).slice(0, 2).map((l) => l.slice(0, 60));
    if (/恭喜您成为|决定拜.*为师/.test(all)) note('拜师成功！' + ((all.match(/恭喜您成为[^\n。]*/) || [''])[0]));
    else if (/磕头请安/.test(all)) note((b.who || '他') + '已经是你的师父了。');
    else if (/你想拜谁为师/.test(all)) note('到了以后没看到' + (b.who || '师父') + '，可能出门了，过一会再来。');
    else if (/判师|叛师/.test(all)) note('你已经有别的门派了，' + (b.who || '他') + '不收。');
    else if (/还没有答应/.test(all)) note((b.who || '他') + '还没答应。');
    else note('没拜成。' + (said.length ? said.join(' ') : '没看到' + (b.who || '师父') + '的回答，看看上面的输出。'));
  }
  function onQueueText(t) {
    if (queue.bai && queue.bai.sent) { if (t) queue.bai.lines.push(t); if (/恭喜您成为/.test(t)) { clearTimeout(queue.timer); queue.timer = setTimeout(finishBai, 300); } return; }
    if (queue.fly && /终于赶到了/.test(t)) { queue.fly = false; queue.cmds.shift(); clearTimeout(queue.timer); queue.timer = setTimeout(qNext, 600); return; }
    if (t === '什么？') { stopQueue('「' + queue.cmds[0] + '」不是有效的指令，后面的不发了。'); return; }
    if (!queue.move && !queue.fly) return;
    if (queue.fly && /不能乱跑/.test(t) && !queue.outRetry && W) {
      // 以为在室外其实在屋里（位置没认出来）：按名字再认一次，先走到室外再飞
      queue.outRetry = true;
      if (!wCur) { const c = W.byT[roomTitle] || []; if (c.length === 1) wCur = c[0]; }
      const out = wCur && wOutdoor(wCur);
      if (out && out.length) { queue.fly = false; clearTimeout(queue.timer); queue.cmds.unshift(...out); note('在屋里飞不了，先走到室外：' + out.join(';')); queue.timer = setTimeout(qNext, 600); return; }
    }
    if (queue.fly && /正在战斗|正躺着|做牢|不能乱跑|有点古怪|没有这个城市|无法驾驭|不对劲|负荷|还没有住房|正在飞行中/.test(t)) {
      stopQueue('fly 没飞成：' + t.slice(0, 30)); return;
    }
    if (/动作还没有完成|正忙着|忙着呢|还在飞/.test(t)) {
      if (++queue.retry > 8) { stopQueue('一直在忙，后面的指令不发了。'); return; }
      queue.move = false; clearTimeout(queue.timer); queue.timer = setTimeout(qNext, 1200);
    } else if (/逃跑失败|拦在面前|想走？|这个方向没有出路|你过不去|动弹不得|哪里也去不了|拦住|挡住|不能离开|无法离开|请回|不接待|不准|不许|闲杂人等|什么？/.test(t)) {
      stopQueue('「' + queue.cmds[0] + '」没走成：' + t.slice(0, 30));
    }
  }

  // 服务端说走不了
  function onText(str) {
    if (queue) onQueueText(plain(str));
    if (!route || !route.expect) return;
    const t = plain(str);
    if (/动作还没有完成|正忙着|忙着呢/.test(t)) {
      if (++route.retry > 5) { stopRoute('一直在忙，自动走路已停止。'); return; }
      clearTimeout(route.timer);
      route.timer = setTimeout(nextStep, 1200); // 等忙完再走这一步
    } else if (/逃跑失败|拦在面前|想走？/.test(t)) {
      stopRoute('正在战斗，走不开，自动走路已停止。');
    } else if (/这个方向没有出路|你过不去|动弹不得|哪里也去不了|拦住|挡住|不能离开|无法离开/.test(t)) {
      stopRoute('路被挡住了：' + t.slice(0, 30));
    }
  }
  if (typeof window.writeToScreen === 'function') {
    const origWS = window.writeToScreen;
    window.writeToScreen = function (str) { try { onText(str); } catch (e) { /* ignore */ } return origWS.apply(this, arguments); };
  }
  let flashMsg = '', flashAt = 0;
  function flash(m) { flashMsg = m; flashAt = Date.now(); if (panel) render(); }

  // ---------- panel ----------
  // 缩放用房间框的宽度 cw（像素）表示；拖动偏移 panX/panY 为 0 时以当前房间为中心。
  // 单指拖动平移，双指捏合缩放，电脑上滚轮缩放；＋／－ 按钮，「全图」把这张图整个放进来。
  let panel = null, layerEl = null;
  const CW_MIN = 10, CW_MAX = 64;
  const clampCw = (v) => Math.max(CW_MIN, Math.min(CW_MAX, v));
  let cw = 34, panX = 0, panY = 0, vpW = 0, vpH = 0;
  try { const z = +(window.zjStore && zjStore.getItem('minimap_cw')); if (z >= CW_MIN && z <= CW_MAX) cw = z; } catch (e) { /* default */ }
  function saveZoom() { try { zjStore.setItem('minimap_cw', String(Math.round(cw * 10) / 10)); } catch (e) { /* ignore */ } }
  const pitchX = (w) => w * 1.34, pitchY = (w) => w * 0.94, cellH = (w) => w * 0.6;
  let followKey = null;   // 当前房间一变就回到以它为中心
  let suppressClick = 0;  // 刚拖动/捏合过，吞掉随后的那次点击

  function close() { if (panel) { panel.remove(); panel = null; layerEl = null; } }

  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // 以 (mx,my)（视口内坐标）为不动点缩放
  function zoomAt(f, mx, my) {
    const ncw = clampCw(cw * f), s = ncw / cw;
    const cX = vpW / 2 + panX, cY = vpH / 2 + panY;
    panX = mx + (cX - mx) * s - vpW / 2; panY = my + (cY - my) * s - vpH / 2;
    cw = ncw; saveZoom(); render();
  }
  function fitAll() {
    const cur = wMode ? { x: 0, y: 0, z: 0 } : S.cur;
    const g = wMode ? (wLayoutCache ? Object.fromEntries(Object.values(wLayoutCache.pos).map(([x, y]) => [x + ',' + y + ',0', 1])) : null) : cur && S.segs[cur.seg];
    if (!g) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const key in g) {
      const [x, y, z] = key.split(',').map(Number);
      if (z !== cur.z) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x0 === Infinity) return;
    const cols = x1 - x0, rows = y1 - y0;
    cw = clampCw(Math.min((vpW - 10) / (1.34 * cols + 1), (vpH - 10) / (0.94 * rows + 0.6), 40));
    panX = -(((x0 + x1) / 2 - cur.x) * pitchX(cw)); panY = -(((y0 + y1) / 2 - cur.y) * pitchY(cw));
    saveZoom(); render();
  }

  // ---------- 手势 ----------
  const ptrs = new Map();
  let g0 = null;
  const rel = (e) => { const b = panel.querySelector('[data-mm=vp]').getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  function gStart() {
    const p = [...ptrs.values()];
    if (!p.length) { g0 = null; return; }
    const m = p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0];
    const d = p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
    g0 = { m, d, n: p.length, cw, panX, panY, moved: false, s: 1, m1: m };
  }
  function gMove() {
    if (!g0 || !layerEl) return;
    const p = [...ptrs.values()];
    const m1 = p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0];
    let s = 1;
    if (p.length > 1 && g0.d > 0) s = clampCw(g0.cw * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / g0.d) / g0.cw;
    if (!g0.moved && Math.hypot(m1.x - g0.m.x, m1.y - g0.m.y) < 6 && Math.abs(s - 1) < 0.04) return;
    g0.moved = true; g0.s = s; g0.m1 = m1;
    layerEl.style.transform = 'translate(' + (m1.x - g0.m.x * s) + 'px,' + (m1.y - g0.m.y * s) + 'px) scale(' + s + ')';
  }
  function gEnd() {
    if (!g0) return;
    if (g0.moved) {
      const s = g0.s, m1 = g0.m1;
      const cX = vpW / 2 + g0.panX, cY = vpH / 2 + g0.panY;
      cw = g0.cw * s;
      panX = m1.x + (cX - g0.m.x) * s - vpW / 2; panY = m1.y + (cY - g0.m.y) * s - vpH / 2;
      if (s !== 1) saveZoom();
      suppressClick = Date.now();
      g0 = null; render();
    } else g0 = null;
  }
  function onDown(e) {
    if (!e.target.closest || !e.target.closest('[data-mm=vp]')) return;
    if (g0) gEnd();
    ptrs.set(e.pointerId, rel(e)); gStart();
  }
  function onMove(e) { if (!ptrs.has(e.pointerId) || !panel) return; ptrs.set(e.pointerId, rel(e)); gMove(); }
  function onUp(e) {
    if (!ptrs.has(e.pointerId)) return;
    gEnd(); ptrs.delete(e.pointerId);
    if (ptrs.size && panel) gStart();
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function render() {
    const out = document.getElementById('out') || document.getElementById('mright');
    if (!out) return;
    const r = out.getBoundingClientRect();
    if (!panel) {
      panel = el('div', 'position:fixed;z-index:900;overflow:hidden;background:rgba(0,0,0,.88);' +
        'border:1px solid rgba(150,150,150,.5);border-radius:3px;font-size:10px;line-height:1.2;color:#ccc;' +
        'box-sizing:border-box;touch-action:none;-webkit-user-select:none;user-select:none');
      panel.addEventListener('click', (e) => {
        // 只吞地图区域里紧跟拖动/捏合的那次点击，按钮不受影响
        if (Date.now() - suppressClick < 400 && e.target.closest && e.target.closest('[data-mm=vp]')) { e.stopPropagation(); e.preventDefault(); }
      }, true);
      panel.addEventListener('click', (e) => { if (e.target === panel || e.target.dataset.bg) close(); });
      panel.addEventListener('pointerdown', onDown);
      panel.addEventListener('wheel', (e) => {
        if (!e.target.closest('[data-mm=vp]')) return;
        e.preventDefault();
        const p = rel(e);
        zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
      }, { passive: false });
      panel.addEventListener('gesturestart', (e) => e.preventDefault());
      document.body.appendChild(panel);
    }
    panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
    panel.style.width = r.width + 'px'; panel.style.height = r.height + 'px';
    panel.textContent = '';

    const cur = S.cur, here = curCell();
    wLoad();
    if (wCur) markSeen(wCur);
    const ck = wMode ? 'w:' + wCur : cur ? cur.seg + ':' + k3(cur.x, cur.y, cur.z) : null;
    if (ck !== followKey) { followKey = ck; panX = panY = 0; }

    const head = el('div', 'position:absolute;left:6px;top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ddd',
      '小地图 · ' + (roomTitle || '未知'));
    const btns = [];
    const btn = (text, mm, fn, dim) => {
      const b = el('div', 'flex:none;min-width:26px;height:22px;padding:0 3px;box-sizing:border-box;text-align:center;line-height:22px;cursor:pointer;' +
        'font-size:' + (text.length > 1 ? '11px' : '13px') + ';color:' + (dim ? '#555' : '#aaa'), text);
      b.dataset.mm = mm;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      btns.push(b);
    };
    if (panX || panY) btn('定位', 'center', () => { panX = panY = 0; render(); });
    if (W) btn(wMode ? '我的图' : '百科图', 'wiki', () => { wMode = !wMode; panX = panY = 0; render(); });
    btn('全图', 'fit', fitAll);
    btn('－', 'zoomout', () => zoomAt(1 / 1.3, vpW / 2, vpH / 2), cw <= CW_MIN);
    btn('＋', 'zoomin', () => zoomAt(1.3, vpW / 2, vpH / 2), cw >= CW_MAX);
    btn('✕', 'close', close);
    const bar = el('div', 'position:absolute;right:2px;top:0;display:flex');
    bar.append(...btns);
    head.style.right = (btns.length * 30 + 6) + 'px';
    panel.append(head, bar);

    const foot = el('div', 'position:absolute;left:6px;right:6px;bottom:5px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    if (wMode && !wCur) {
      foot.textContent = '百科里没认出你在哪个房间（同名的房间太多），走一步再看。';
      panel.append(foot);
      return;
    }
    if (!wMode && (!cur || !here)) {
      foot.textContent = '还没有记录，走几步就会显示。';
      panel.append(foot);
      return;
    }

    // 视口：标题栏和底栏之间
    const top = 24, bottom = 40;
    vpW = r.width; vpH = r.height - top - bottom;
    const vp = el('div', 'position:absolute;left:0;right:0;top:' + top + 'px;bottom:' + bottom + 'px;overflow:hidden');
    vp.dataset.bg = 1; vp.dataset.mm = 'vp';
    const layer = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0');
    layer.dataset.bg = 1;
    vp.append(layer); layerEl = layer;
    panel.append(vp);

    const px = pitchX(cw), py = pitchY(cw), ch = cellH(cw);
    const cX = vpW / 2 + panX, cY = vpH / 2 + panY;
    const sx = (dx) => cX + dx * px, sy = (dy) => cY + dy * py;  // 房间中心在视口里的位置
    // 多画一圈视口外的，拖动时边上不至于一片空白
    const vis = (dx, dy) => { const x = sx(dx), y = sy(dy); return x > -vpW && x < vpW * 2 && y > -vpH && y < vpH * 2; };
    const fs = cw >= 40 ? 10 : cw >= 26 ? 9 : cw >= 18 ? 8 : 0;
    const seg = (!wMode && S.segs[cur.seg]) || {};

    const line = (x1, y1, x2, y2, dim) => {
      const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const l = el('div', 'position:absolute;height:1px;transform-origin:0 0;pointer-events:none;background:' + (dim ? 'rgba(150,150,150,.35)' : 'rgba(150,150,150,.8)'));
      l.style.left = x1 + 'px'; l.style.top = y1 + 'px'; l.style.width = len + 'px'; l.style.transform = 'rotate(' + ang + 'deg)';
      layer.append(l);
    };
    const shown = [];
    for (const key in seg) {
      const [x, y, z] = key.split(',').map(Number);
      if (wMode || z !== cur.z || !vis(x - cur.x, y - cur.y)) continue;
      shown.push([key, x - cur.x, y - cur.y, seg[key]]);
    }
    for (const [key, dx, dy, c] of (wMode ? [] : shown)) {
      for (const d in c.e) {
        const v = D[d];
        if (!v || v[2] !== 0) continue;
        const [nx, ny, nz] = stepKey(cur.seg, key, d).split(',').map(Number);
        if (nz !== cur.z) continue;
        line(sx(dx), sy(dy), sx(nx - cur.x), sy(ny - cur.y), !cellAt(cur.seg, nx, ny, nz));
      }
    }

    const box = (dx, dy, text, kind, dir, badge, far) => {
      const b = el('div', 'position:absolute;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' +
        'text-align:center;border-radius:' + (cw < 18 ? 2 : 3) + 'px;padding:0 1px;cursor:' + (dir || far ? 'pointer' : 'default') + ';' +
        (kind === 'here' ? 'background:#448EF3;color:#fff;border:1px solid #9cf;' :
         kind === 'near' ? 'background:rgba(200,200,200,.18);color:#eee;border:1px solid #8c8;' :
         kind === 'ghost' ? 'background:transparent;color:#888;border:1px dashed #666;' :
         kind === 'target' ? 'background:rgba(255,190,80,.25);color:#fff;border:1px solid #fc6;' :
         'background:rgba(200,200,200,.1);color:#bbb;border:1px solid rgba(150,150,150,.4);'), fs ? text : '');
      b.style.left = (sx(dx) - cw / 2) + 'px'; b.style.top = (sy(dy) - ch / 2) + 'px';
      b.style.width = cw + 'px'; b.style.height = ch + 'px';
      b.style.fontSize = (fs || 8) + 'px'; b.style.lineHeight = Math.max(0, ch - 2) + 'px';
      b.title = text;
      b.dataset.mm = 'cell'; b.dataset.ij = dx + ',' + dy;
      if (dir) b.addEventListener('click', (e) => { e.stopPropagation(); go(dir); });
      else if (far) b.addEventListener('click', (e) => { e.stopPropagation(); if (typeof far === 'string') wWalk(far); else startRoute(far); });
      layer.append(b);
      if (badge && cw >= 22) {
        const s = el('div', 'position:absolute;font-size:9px;line-height:9px;color:#fc6;pointer-events:none', badge);
        s.style.left = (sx(dx) + cw / 2 - 9) + 'px'; s.style.top = (sy(dy) - ch / 2 + 1) + 'px';
        layer.append(s);
      }
    };
    if (wMode) { renderWiki(layer, line, box, sx, sy, vis, foot); panel.append(foot); return; }
    // 当前房间能直接走到的格子
    const near = {};
    for (const d in here.e) {
      const v = D[d];
      if (!v || v[2] !== 0) continue;
      const [nx, ny, nz] = stepKey(cur.seg, k3(cur.x, cur.y, cur.z), d).split(',').map(Number);
      if (nz !== cur.z) continue;
      // 出口上写的名字和那格记着的房间对不上：那个方向其实通向别处，不当相邻格
      const there = cellAt(cur.seg, nx, ny, nz), label = plain(here.e[d]);
      if (there && label && there.t !== label) continue;
      near[(nx - cur.x) + ',' + (ny - cur.y)] = d;
    }
    const upDown = (c) => (Object.keys(c.e).some((d) => D[d] && D[d][2] > 0) ? '↑' : '') + (Object.keys(c.e).some((d) => D[d] && D[d][2] < 0) ? '↓' : '');
    for (const [, dx, dy, c] of shown) {
      if (!dx && !dy) continue;
      const dir = near[dx + ',' + dy];
      const pos = { seg: cur.seg, x: cur.x + dx, y: cur.y + dy, z: cur.z };
      const isT = route && samePos(route.target, pos);
      box(dx, dy, c.t, isT ? 'target' : dir ? 'near' : 'seen', dir, upDown(c), dir ? null : pos);
    }
    for (const k in near) {
      const [dx, dy] = k.split(',').map(Number);
      if (!cellAt(cur.seg, cur.x + dx, cur.y + dy, cur.z)) box(dx, dy, plain(here.e[near[k]]) || '？', 'ghost', near[k], '');
    }
    box(0, 0, here.t, 'here', null, upDown(here));

    // 上下楼、out/enter 这类不在平面上的出口放在底部（房间里的动作按钮，比如「浇花」，不算出口）
    const MOVES = ['out', 'enter', 'in'];
    const extra = Object.keys(here.e).filter((d) => (D[d] && D[d][2] !== 0) || MOVES.includes(d));
    if (route) {
      foot.textContent = '';
      foot.style.color = '#fc6';
      foot.append('正在走向「' + route.title + '」，还有 ' + route.path.length + ' 步　');
      const st = el('span', 'display:inline-block;color:#9cf;cursor:pointer;padding:0 6px', '停止');
      st.dataset.mm = 'stop';
      st.addEventListener('click', (e) => { e.stopPropagation(); stopRoute('已停止。'); });
      foot.append(st);
    } else if (flashMsg && Date.now() - flashAt < 6000) {
      foot.textContent = flashMsg;
      foot.style.color = '#fc6';
      const left = 6100 - (Date.now() - flashAt);
      setTimeout(() => { if (panel && !route && Date.now() - flashAt >= 6000) render(); }, left);
    } else if (extra.length) {
      foot.textContent = '';
      for (const d of extra) {
        const a = el('span', 'display:inline-block;margin-right:8px;color:#9cf;cursor:pointer',
          (D[d] ? (D[d][2] > 0 ? '↑' : '↓') : '») ') + (plain(here.e[d]) || d));
        a.addEventListener('click', (e) => { e.stopPropagation(); go(d); });
        foot.append(a);
      }
    } else foot.textContent = '拖动查看，双指或 ＋－ 缩放，点房间走过去。';
    panel.append(foot);
  }

  function renderWiki(layer, line, box, sx, sy, vis, foot) {
    const L = wLayout(wCur, 900), here = W.rooms[wCur];
    wLayoutCache = L;
    for (const [a, b] of L.edges) {
      const p = L.pos[a], q = L.pos[b];
      if (vis(p[0], p[1]) || vis(q[0], q[1])) line(sx(p[0]), sy(p[1]), sx(q[0]), sy(q[1]), !(wSeen.has(a) && wSeen.has(b)));
    }
    const near = {};
    for (const d in here.e) near[here.e[d]] = d;
    const tgt = queue && queue.wTarget;
    for (const f in L.pos) {
      if (f === wCur) continue;
      const [x, y] = L.pos[f];
      if (!vis(x, y)) continue;
      const r = W.rooms[f], d = near[f];
      box(x, y, r.s, f === tgt ? 'target' : d ? 'near' : wSeen.has(f) ? 'seen' : 'ghost', d && D[d] ? d : null, '', d && D[d] ? null : f);
    }
    box(0, 0, here.s, 'here', null, '');
    if (queue) {
      foot.textContent = '';
      foot.style.color = '#fc6';
      foot.append('按百科路线走，还剩 ' + queue.cmds.length + ' 条指令　');
      const st = el('span', 'display:inline-block;color:#9cf;cursor:pointer;padding:0 6px', '停止');
      st.dataset.mm = 'stop';
      st.addEventListener('click', (e) => { e.stopPropagation(); stopQueue('已停止。'); render(); });
      foot.append(st);
    } else if (flashMsg && Date.now() - flashAt < 6000) {
      foot.textContent = flashMsg; foot.style.color = '#fc6';
      setTimeout(() => { if (panel && Date.now() - flashAt >= 6000) render(); }, 6100 - (Date.now() - flashAt));
    } else foot.textContent = '百科图：实线框是去过的，虚线框没去过。点哪里就走过去，远的先 fly。';
  }
  let wLayoutCache = null;

  function toggle() { if (panel) close(); else render(); }
  window.MudMiniMap = { toggle, close, walkTo: startRoute, stop: () => { stopRoute(null); stopQueue(null); }, state: () => ({ cur: S.cur, route, cw, panX, panY, wCur, queue: queue && queue.cmds.slice() }), findPath, reset: () => { S = { segs: {}, next: 1, cur: null }; save(); if (panel) render(); } };

  // 百科「带我去」：百科页面把路线（fly xx;north;…）交过来，按连续指令走。
  // 百科嵌在游戏页面里时用 postMessage；单独开的百科用同源 BroadcastChannel，收到后回执。
  function takeRoute(d) {
    if (!d || d.type !== 'wiki-go' || !Array.isArray(d.cmds)) return false;
    const cmds = d.cmds.map((c) => String(c).trim()).filter(Boolean).slice(0, 200);
    if (!cmds.length) return false;
    stopRoute(null);
    closeWiki();
    // 游戏这边知道自己在哪：按百科地图重新规划（近的直接走，在室内先走到室外再 fly）
    const then = typeof d.then === 'string' && /^apprentice [a-z][\w -]{0,40}$/i.test(d.then) ? d.then : '';
    const plan = d.file && W && W.rooms[d.file] && wPlan(d.file);
    if (then) {
      // 一键拜师：走到师父那里，发 apprentice，几秒内看师父怎么回
      const q = (plan || cmds.filter((c) => !/^apprentice /.test(c))).concat([then]);
      runQueue(q);
      if (queue) queue.bai = { who: String(d.who || '').slice(0, 20), lines: [] };
      note('去拜' + (d.who || '师') + '：' + (q.length > 1 ? '先走 ' + (q.length - 1) + ' 条指令，' : '') + '到了发 ' + then + '。');
      return true;
    }
    if (plan) { if (!plan.length) { note('已经在这里了。'); return true; } wWalk(d.file); note('按百科路线走：' + plan.length + ' 条指令。'); return true; }
    runQueue(cmds);
    note('按百科路线走：' + cmds.length + ' 条指令。');
    return true;
  }
  // 百科问「我现在的属性、技能」：游戏里调 LPC 的 mudwasm_stats，拿到就回给百科（拜师条件逐条比对用）
  function giveStats(d, reply) {
    if (!d || d.type !== 'wiki-stats' || !window.MudWasm || !MudWasm.lpc) return false;
    MudWasm.lpc('mudwasm_stats', []).then((t) => {
      let st = null;
      try { st = JSON.parse(t); } catch (e) { /* not ready */ }
      if (st) reply({ type: 'wiki-stats-reply', id: d.id, stats: st });
    }).catch(() => {});
    return true;
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (!giveStats(e.data, (m) => e.source && e.source.postMessage(m, location.origin))) takeRoute(e.data);
  });
  try {
    const ch = new BroadcastChannel('mudwasm-' + GAME_ID);
    ch.onmessage = (e) => {
      if (giveStats(e.data, (m) => ch.postMessage(m))) return;
      if (takeRoute(e.data) && e.data.id) ch.postMessage({ type: 'wiki-go-ack', id: e.data.id });
    };
  } catch (e) { /* no BroadcastChannel */ }
  window.MudMiniMap.runQueue = runQueue;

  // ---------- 游戏里查百科：输入「wiki 名字」，或在人物/物品的动作框里点「查百科」 ----------
  let wikiBox = null;
  function openWiki(q) {
    closeWiki();
    const url = '../wiki/?g=' + encodeURIComponent(GAME_ID) + '&embed=1#/' + (q ? 'search/' + encodeURIComponent(q) : '');
    wikiBox = el('div', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:9500;background:#111;display:flex;flex-direction:column;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)');
    const bar = el('div', 'flex:none;display:flex;align-items:center;height:36px;padding:0 8px;background:#222;color:#ccc;font:14px sans-serif');
    bar.append(el('div', 'flex:1', '百科' + (q ? '：' + q : '')));
    const x = el('div', 'padding:0 10px;line-height:36px;color:#9cf;cursor:pointer', '返回游戏');
    x.dataset.mm = 'wikiclose';
    x.addEventListener('click', closeWiki);
    bar.append(x);
    const fr = document.createElement('iframe');
    fr.src = url; fr.style.cssText = 'flex:1;width:100%;border:0;background:#111';
    wikiBox.append(bar, fr);
    document.body.appendChild(wikiBox);
  }
  function closeWiki() { if (wikiBox) { wikiBox.remove(); wikiBox = null; } }
  window.MudMiniMap.wiki = (q) => { wLoad(); if (!GAME_ID) return false; openWiki(q || ''); return true; };
  window.MudMiniMap.wikiReady = () => !!W;
  // main.js 直接按名字调用 writeToPop，包一层 window.writeToPop 拦不住；改为看 #hudong 里的内容：
  // 弹出的是人物/物品的动作按钮（cmdsa / cmdsc），而标题是百科里有的名字，就补一个「查百科」按钮。
  function addWikiBtn() {
    const hd = document.getElementById('hudong');
    if (!W || !hd || hd.querySelector('[data-mm=wikibtn]') || !hd.querySelector('button[onclick^="cmdsa"], button[onclick^="cmdsc"]')) return;
    const name = plain(window.dialog_title).replace(/^[「『【\[(（].*?[」』】\])）]/, '').trim();
    if (!name || !W.names.has(name)) return;
    // 和弹窗里原有的动作按钮长得一样（同宽同高同对齐），排在最后一格
    const like = hd.querySelector('button[onclick^="cmdsa"], button[onclick^="cmdsc"]');
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '查百科';
    b.dataset.mm = 'wikibtn';
    b.style.cssText = like.style.cssText;
    b.style.color = '#9cf';
    b.addEventListener('click', () => { try { $('#hudong').dialog('close'); } catch (e) { /* ignore */ } openWiki(name); });
    hd.appendChild(b);
  }
  { const hd = document.getElementById('hudong'); if (hd && window.MutationObserver) new MutationObserver(addWikiBtn).observe(hd, { childList: true }); }
  setTimeout(wLoad, 2500);
  window.MudMiniMap.gameId = GAME_ID;

  // 九宫格中间那格（当前房间名）：点一下打开/关闭
  document.addEventListener('click', (e) => {
    const td = e.target.closest && e.target.closest('#exits td');
    if (!td) return;
    const tr = td.parentElement, tbody = tr && tr.parentElement;
    if (!tbody || Array.prototype.indexOf.call(tbody.children, tr) !== 1 || Array.prototype.indexOf.call(tr.children, td) !== 1) return;
    if (td.querySelector('button')) return; // 那格放的是按钮（少数游戏）就不抢
    toggle();
  });
  window.addEventListener('resize', () => { if (panel) render(); });

  // 提示这格能点：只加虚线下划线，不改字号和尺寸
  const css = document.createElement('style');
  css.textContent = '#exits tr:nth-child(2) td:nth-child(2){cursor:pointer;text-decoration:underline dotted rgba(150,150,150,.7);text-underline-offset:3px}';
  document.head.appendChild(css);
})();
