// minimap.js -- 小地图（指间 MUD 单机版附加功能）
//
// 不改服务端：客户端在你走动时记下「从哪个房间往哪个方向到了哪个房间」，
// 自己拼出地图，存在本机（每个游戏一份）。走过的地方逐渐点亮，没去过的是空白。
//
// 入口：方向按钮九宫格中间那格（当前房间名），点一下展开，再点一次或点空白处关闭。
// 展开后以当前位置为中心显示 5×5 范围（＋／－ 切换 5×5、7×7、9×9）；
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
      if (ev === 'stream') { if (!autoSending && route) stopRoute('你自己输入了指令，自动走路已停止。'); noteCmd(data); }
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
  // 服务端说走不了
  function onText(str) {
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
  let panel = null;
  const ZOOMS = [2, 3, 4]; // 半径：5×5 / 7×7 / 9×9
  let R = 2;
  try { const z = +(window.zjStore && zjStore.getItem('minimap_r')); if (ZOOMS.includes(z)) R = z; } catch (e) { /* default */ }

  function close() { if (panel) { panel.remove(); panel = null; } }

  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    const out = document.getElementById('out') || document.getElementById('mright');
    if (!out) return;
    const r = out.getBoundingClientRect();
    if (!panel) {
      panel = el('div', 'position:fixed;z-index:900;overflow:hidden;background:rgba(0,0,0,.88);' +
        'border:1px solid rgba(150,150,150,.5);border-radius:3px;font-size:10px;line-height:1.2;color:#ccc;' +
        'box-sizing:border-box;touch-action:manipulation;-webkit-user-select:none;user-select:none');
      panel.addEventListener('click', (e) => { if (e.target === panel || e.target.dataset.bg) close(); });
      document.body.appendChild(panel);
    }
    panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
    panel.style.width = r.width + 'px'; panel.style.height = r.height + 'px';
    panel.textContent = '';

    const W = r.width, H = r.height;
    const head = el('div', 'position:absolute;left:6px;right:90px;top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ddd',
      '小地图 · ' + (roomTitle || '未知'));
    const btn = (right, text, fn) => {
      const b = el('div', 'position:absolute;top:0;width:28px;height:22px;text-align:center;line-height:22px;color:#aaa;cursor:pointer;font-size:13px', text);
      b.style.right = right + 'px';
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    const zoom = (k) => {
      const i = ZOOMS.indexOf(R) + k;
      if (i < 0 || i >= ZOOMS.length) return;
      R = ZOOMS[i];
      try { zjStore.setItem('minimap_r', String(R)); } catch (e) { /* ignore */ }
      render();
    };
    const zi = ZOOMS.indexOf(R);
    const zOut = btn(62, '－', () => zoom(1)), zIn = btn(32, '＋', () => zoom(-1));
    zOut.dataset.mm = 'zoomout'; zIn.dataset.mm = 'zoomin';
    if (zi === ZOOMS.length - 1) zOut.style.color = '#555';
    if (zi === 0) zIn.style.color = '#555';
    panel.append(head, zOut, zIn, btn(2, '✕', close));

    const cur = S.cur, here = curCell();
    const foot = el('div', 'position:absolute;left:6px;right:6px;bottom:5px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    if (!cur || !here) {
      foot.textContent = '还没有记录，走几步就会显示。';
      panel.append(foot);
      return;
    }

    // 网格大小：N 格 + (N-1) 段连线，尽量填满，又不超出
    const N = R * 2 + 1;
    const top = 24, bottom = 40;
    const gw = W - 12, gh = H - top - bottom;
    const gap = Math.max(5, Math.min(16, Math.floor(Math.min(gw, gh) / (N * 4.4))));
    const cw = Math.floor((gw - gap * (N - 1)) / N);
    const ch = Math.min(Math.floor((gh - gap * (N - 1)) / N), Math.max(16, Math.floor(cw * 0.55)));
    const ox = 6 + Math.floor((gw - (cw * N + gap * (N - 1))) / 2), oy = top + Math.floor((gh - (ch * N + gap * (N - 1))) / 2);
    panel.style.fontSize = R >= 4 ? '9px' : '10px';
    const cx = (i) => ox + (i + R) * (cw + gap), cy = (j) => oy + (j + R) * (ch + gap);
    const bg = el('div', 'position:absolute;left:0;top:0;right:0;bottom:0'); bg.dataset.bg = 1;
    panel.append(bg);

    // 连线（画在房间框下面）
    const line = (x1, y1, x2, y2, dim) => {
      const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const l = el('div', 'position:absolute;height:1px;transform-origin:0 0;pointer-events:none;background:' + (dim ? 'rgba(150,150,150,.35)' : 'rgba(150,150,150,.8)'));
      l.style.left = x1 + 'px'; l.style.top = y1 + 'px'; l.style.width = len + 'px'; l.style.transform = 'rotate(' + ang + 'deg)';
      panel.append(l);
    };
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const c = cellAt(cur.seg, cur.x + i, cur.y + j, cur.z);
      if (!c) continue;
      for (const d in c.e) {
        const v = D[d];
        if (!v || v[2] !== 0) continue;
        const [nx, ny, nz] = stepKey(cur.seg, k3(cur.x + i, cur.y + j, cur.z), d).split(',').map(Number);
        if (nz !== cur.z) continue;
        const ni = nx - cur.x, nj = ny - cur.y;
        if (Math.abs(ni) > R || Math.abs(nj) > R) continue;
        line(cx(i) + cw / 2, cy(j) + ch / 2, cx(ni) + cw / 2, cy(nj) + ch / 2, !cellAt(cur.seg, cur.x + ni, cur.y + nj, cur.z));
      }
    }

    // 房间
    const box = (i, j, text, kind, dir, badge, far) => {
      const b = el('div', 'position:absolute;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' +
        'text-align:center;border-radius:3px;padding:0 2px;cursor:' + (dir || far ? 'pointer' : 'default') + ';' +
        (kind === 'here' ? 'background:#448EF3;color:#fff;border:1px solid #9cf;' :
         kind === 'near' ? 'background:rgba(200,200,200,.18);color:#eee;border:1px solid #8c8;' :
         kind === 'ghost' ? 'background:transparent;color:#888;border:1px dashed #666;' :
         kind === 'target' ? 'background:rgba(255,190,80,.25);color:#fff;border:1px solid #fc6;' :
         'background:rgba(200,200,200,.1);color:#bbb;border:1px solid rgba(150,150,150,.4);'), text);
      b.style.left = cx(i) + 'px'; b.style.top = cy(j) + 'px'; b.style.width = cw + 'px'; b.style.height = ch + 'px';
      b.style.lineHeight = (ch - 2) + 'px';
      if (badge) b.title = badge;
      b.dataset.mm = 'cell'; b.dataset.ij = i + ',' + j;
      if (dir) b.addEventListener('click', (e) => { e.stopPropagation(); go(dir); });
      else if (far) b.addEventListener('click', (e) => { e.stopPropagation(); startRoute(far); });
      panel.append(b);
      if (badge) {
        const s = el('div', 'position:absolute;font-size:9px;line-height:9px;color:#fc6;pointer-events:none', badge);
        s.style.left = (cx(i) + cw - 9) + 'px'; s.style.top = (cy(j) + 1) + 'px';
        panel.append(s);
      }
    };
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
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const c = cellAt(cur.seg, cur.x + i, cur.y + j, cur.z);
      const dir = near[i + ',' + j];
      const ud = c ? ((Object.keys(c.e).some((d) => D[d] && D[d][2] > 0) ? '↑' : '') + (Object.keys(c.e).some((d) => D[d] && D[d][2] < 0) ? '↓' : '')) : '';
      if (i === 0 && j === 0) box(0, 0, here.t, 'here', null, ud);
      else if (c) {
        const pos = { seg: cur.seg, x: cur.x + i, y: cur.y + j, z: cur.z };
        const isT = route && samePos(route.target, pos);
        box(i, j, c.t, isT ? 'target' : dir ? 'near' : 'seen', dir, ud, dir ? null : pos);
      }
      else if (dir) box(i, j, plain(here.e[dir]) || '？', 'ghost', dir, '');
    }

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
    } else foot.textContent = '点去过的房间就会走过去，点空白处关闭。';
    panel.append(foot);
  }

  function toggle() { if (panel) close(); else render(); }
  window.MudMiniMap = { toggle, close, walkTo: startRoute, stop: () => stopRoute(null), state: () => ({ cur: S.cur, route, R }), findPath, reset: () => { S = { segs: {}, next: 1, cur: null }; save(); if (panel) render(); } };

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
