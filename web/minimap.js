// minimap.js -- 小地图（指间 MUD 单机版附加功能）
//
// 不改服务端：客户端在你走动时记下「从哪个房间往哪个方向到了哪个房间」，
// 自己拼出地图，存在本机（每个游戏一份）。走过的地方逐渐点亮，没去过的是空白。
//
// 入口：方向按钮九宫格中间那格（当前房间名），点一下展开，再点一次或点空白处关闭。
// 展开后以当前位置为中心显示 5×5 范围；点相邻房间直接走过去。
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
    S.segs[seg][k3(x, y, z)] = { t: roomTitle, e: Object.assign({}, roomExits) };
    S.cur = { seg, x, y, z };
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

    if (dir && D[dir] && prev && prev.pos) {
      const p = prev.pos, v = D[dir];
      put(p.seg, p.x + v[0], p.y + v[1], p.z + v[2]);
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
    sock.emit = function (ev, data) { if (ev === 'stream') noteCmd(data); return origEmit.apply(this, arguments); };
  }
  function go(dir) { if (window.sock) sock.emit('stream', dir + '\n'); }

  // ---------- panel ----------
  let panel = null;
  const R = 2; // 半径：5×5

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
    const head = el('div', 'position:absolute;left:6px;right:30px;top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ddd',
      '小地图 · ' + (roomTitle || '未知'));
    const x = el('div', 'position:absolute;right:4px;top:1px;width:24px;height:20px;text-align:center;line-height:20px;color:#aaa;cursor:pointer', '✕');
    x.addEventListener('click', close);
    panel.append(head, x);

    const cur = S.cur, here = curCell();
    const foot = el('div', 'position:absolute;left:6px;right:6px;bottom:5px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    if (!cur || !here) {
      foot.textContent = '还没有记录，走几步就会显示。';
      panel.append(foot);
      return;
    }

    // 网格大小：5 格 + 4 段连线，尽量填满，又不超出
    const top = 24, bottom = 40;
    const gw = W - 12, gh = H - top - bottom;
    const gap = Math.max(8, Math.min(16, Math.floor(Math.min(gw, gh) / 22)));
    const cw = Math.floor((gw - gap * 4) / 5), ch = Math.min(Math.floor((gh - gap * 4) / 5), Math.max(22, Math.floor(cw * 0.55)));
    const ox = 6 + Math.floor((gw - (cw * 5 + gap * 4)) / 2), oy = top + Math.floor((gh - (ch * 5 + gap * 4)) / 2);
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
        const ni = i + v[0], nj = j + v[1];
        if (Math.abs(ni) > R || Math.abs(nj) > R) continue;
        line(cx(i) + cw / 2, cy(j) + ch / 2, cx(ni) + cw / 2, cy(nj) + ch / 2, !cellAt(cur.seg, cur.x + ni, cur.y + nj, cur.z));
      }
    }

    // 房间
    const box = (i, j, text, kind, dir, badge) => {
      const b = el('div', 'position:absolute;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;' +
        'text-align:center;border-radius:3px;padding:0 2px;cursor:' + (dir ? 'pointer' : 'default') + ';' +
        (kind === 'here' ? 'background:#448EF3;color:#fff;border:1px solid #9cf;' :
         kind === 'near' ? 'background:rgba(200,200,200,.18);color:#eee;border:1px solid #8c8;' :
         kind === 'ghost' ? 'background:transparent;color:#888;border:1px dashed #666;' :
         'background:rgba(200,200,200,.1);color:#bbb;border:1px solid rgba(150,150,150,.4);'), text);
      b.style.left = cx(i) + 'px'; b.style.top = cy(j) + 'px'; b.style.width = cw + 'px'; b.style.height = ch + 'px';
      b.style.lineHeight = (ch - 2) + 'px';
      if (badge) b.title = badge;
      if (dir) b.addEventListener('click', (e) => { e.stopPropagation(); go(dir); });
      panel.append(b);
      if (badge) {
        const s = el('div', 'position:absolute;font-size:9px;line-height:9px;color:#fc6;pointer-events:none', badge);
        s.style.left = (cx(i) + cw - 9) + 'px'; s.style.top = (cy(j) + 1) + 'px';
        panel.append(s);
      }
    };
    // 当前房间能直接走到的格子
    const near = {};
    for (const d in here.e) { const v = D[d]; if (v && v[2] === 0) near[v[0] + ',' + v[1]] = d; }
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const c = cellAt(cur.seg, cur.x + i, cur.y + j, cur.z);
      const dir = near[i + ',' + j];
      const ud = c ? ((Object.keys(c.e).some((d) => D[d] && D[d][2] > 0) ? '↑' : '') + (Object.keys(c.e).some((d) => D[d] && D[d][2] < 0) ? '↓' : '')) : '';
      if (i === 0 && j === 0) box(0, 0, here.t, 'here', null, ud);
      else if (c) box(i, j, c.t, dir ? 'near' : 'seen', dir, ud);
      else if (dir) box(i, j, plain(here.e[dir]) || '？', 'ghost', dir, '');
    }

    // 上下楼、out/enter 这类不在平面上的出口放在底部（房间里的动作按钮，比如「浇花」，不算出口）
    const MOVES = ['out', 'enter', 'in'];
    const extra = Object.keys(here.e).filter((d) => (D[d] && D[d][2] !== 0) || MOVES.includes(d));
    if (extra.length) {
      foot.textContent = '';
      for (const d of extra) {
        const a = el('span', 'display:inline-block;margin-right:8px;color:#9cf;cursor:pointer',
          (D[d] ? (D[d][2] > 0 ? '↑' : '↓') : '») ') + (plain(here.e[d]) || d));
        a.addEventListener('click', (e) => { e.stopPropagation(); go(d); });
        foot.append(a);
      }
    } else foot.textContent = '点相邻的房间直接走过去，点空白处关闭。';
    panel.append(foot);
  }

  function toggle() { if (panel) close(); else render(); }
  window.MudMiniMap = { toggle, close, reset: () => { S = { segs: {}, next: 1, cur: null }; save(); if (panel) render(); } };

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
