// Offline wiki page: one shared page, data per game in <game>.json (made by web/wiki/gen.mjs).
// Routes live in location.hash so the page works offline from the service-worker cache.
(function () {
  'use strict';
  const GAMES = window.WIKI_GAMES || [];
  const qs = new URLSearchParams(location.search);
  let game = qs.get('g') || (GAMES[0] && GAMES[0].id);
  let D = null;
  const $ = (s) => document.querySelector(s);
  const main = $('main');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const enc = encodeURIComponent;
  const link = (kind, key, text) => '<a href="#/' + kind + '/' + enc(key) + '">' + esc(text) + '</a>';

  // ---------- names ----------
  const skName = (id) => (D.skills[id] ? D.skills[id].name : id);
  const npcName = (f) => (D.npcs[f] ? D.npcs[f].name : f.split('/').pop());
  const itemName = (f) => (D.items[f] ? D.items[f].name : f.split('/').pop());
  const roomName = (f) => (D.rooms[f] ? D.rooms[f].s : f.split('/').pop());
  const regionOf = (f) => f.split('/')[2] || '';
  const regionName = (k) => (D.regions[k] ? D.regions[k].name : k);
  const roomLabel = (f) => regionName(regionOf(f)) + '·' + roomName(f);
  const skLink = (id) => (D.skills[id] ? link('skill', id, skName(id)) : esc(id));
  const npcLink = (f) => (D.npcs[f] ? link('npc', f, npcName(f)) : esc(npcName(f)));
  const itemLink = (f) => (D.items[f] ? link('item', f, itemName(f)) : esc(itemName(f)));
  const roomLink = (f) => (D.rooms[f] ? link('room', f, roomLabel(f)) : esc(f));
  const money = (v) => {
    if (!v) return '—';
    const g = Math.floor(v / 10000), s = Math.floor((v % 10000) / 100), c = v % 100;
    return (g ? g + '两黄金' : '') + (s ? s + '两白银' : '') + (c && !g ? c + '文铜钱' : '') || '—';
  };
  const TYPE = { martial: '武功', knowledge: '知识', art: '技艺' };
  const DIRS = { north: '北', south: '南', east: '东', west: '西', northeast: '东北', northwest: '西北', southeast: '东南', southwest: '西南',
    up: '上', down: '下', enter: '进', out: '出', northup: '北上', southup: '南上', eastup: '东上', westup: '西上',
    northdown: '北下', southdown: '南下', eastdown: '东下', westdown: '西下' };

  // ---------- search ----------
  let IDX = null;
  function buildIndex() {
    IDX = [];
    for (const [k, s] of Object.entries(D.skills)) IDX.push(['skill', k, s.name, k, s.name + ' ' + k]);
    for (const [k, n] of Object.entries(D.npcs)) IDX.push(['npc', k, n.name, (n.fam ? n.fam.n + ' ' : '') + (n.at[0] ? roomLabel(n.at[0]) : ''), n.name + ' ' + n.id + ' ' + n.nick + ' ' + n.title]);
    for (const [k, i] of Object.entries(D.items)) IDX.push(['item', k, i.name, money(i.value), i.name + ' ' + k.split('/').pop()]);
    for (const [k, r] of Object.entries(D.rooms)) IDX.push(['room', k, r.s, regionName(regionOf(k)), r.s + ' ' + regionName(regionOf(k))]);
    for (const k of Object.keys(D.fams)) IDX.push(['fam', k, k, D.fams[k].length + ' 人', k]);
  }
  const KIND = { skill: '武功', npc: '人物', item: '物品', room: '地点', fam: '门派' };
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const res = [];
    for (const e of IDX) {
      const hay = e[4].toLowerCase(), name = e[2].toLowerCase();
      const i = hay.indexOf(q);
      if (i < 0) continue;
      res.push([name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3, e]);
    }
    res.sort((a, b) => a[0] - b[0] || a[1][2].length - b[1][2].length);
    return res.map((r) => r[1]);
  }

  // ---------- rendering helpers ----------
  const rows = (items, more) => items.join('') + (more ? '<a class="more" href="' + more + '">更多…</a>' : '');
  const row = (href, title, right, sub) => '<a class="row" href="' + href + '">' + (right ? '<span class="r">' + esc(right) + '</span>' : '') +
    '<b>' + esc(title) + '</b>' + (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</a>';
  const section = (t, body) => (body ? '<h3>' + esc(t) + '</h3>' + body : '');
  const kv = (pairs) => '<div class="kv">' + pairs.filter((p) => p[1] !== '' && p[1] != null && p[1] !== 0).map((p) => '<div>' + esc(p[0]) + '</div><div>' + p[1] + '</div>').join('') + '</div>';
  function goBox(f) {
    const r = D.rooms[f];
    if (!r || !r.go) return '<div class="go muted">从飞行点走不到这里（可能要特殊方式进入）。</div>';
    const cmds = ['fly ' + r.go.fly].concat(r.go.steps);
    const txt = r.go.steps.map((d) => DIRS[d] || d).join(' → ');
    return '<div class="go">先 <code>fly ' + esc(r.go.fly) + '</code>（' + esc(roomLabel((D.fly.find((p) => p.key === r.go.fly) || {}).room || '')) + '）' +
      (r.go.steps.length ? '，再走 ' + r.go.steps.length + ' 步：<br><code>' + esc(txt) + '</code>' : '，就在落脚点。') +
      '<br><button data-file="' + esc(f) + '" data-go="' + esc(cmds.join(';')) + '">带我去</button> <button data-copy="' + esc(cmds.join(';')) + '">复制指令</button></div>';
  }
  function showWhere(fs) {
    if (!fs.length) return '';
    return fs.slice(0, 6).map((f) => '<div style="margin-bottom:8px">' + roomLink(f) + goBox(f) + '</div>').join('') +
      (fs.length > 6 ? '<div class="muted">另有 ' + (fs.length - 6) + ' 处</div>' : '');
  }
  const skillTable = (sk, map) => {
    const ks = Object.keys(sk).sort((a, b) => sk[b] - sk[a]);
    if (!ks.length) return '';
    return '<table>' + ks.map((k) => '<tr><td>' + skLink(k) + (map && Object.values(map).includes(k) ? '' : '') + '</td><td class="n">' + sk[k] + ' 级</td></tr>').join('') + '</table>';
  };
  // ---------- pages ----------
  const PAGE = 60;
  function listPage(entries, base, page, mk) {
    const n = entries.length, end = Math.min(n, (page + 1) * PAGE);
    return '<div class="muted">' + n + ' 条</div>' + rows(entries.slice(0, end).map(mk), end < n ? base + (base.includes('?') ? '&' : '?') + 'p=' + (page + 1) : '');
  }
  const chips = (opts, cur, base) => '<div class="chips">' + opts.map(([v, t]) => '<a class="' + (v === cur ? 'on' : '') + '" href="' + base + (v ? (base.includes('?') ? '&' : '?') + 'f=' + enc(v) : '') + '">' + esc(t) + '</a>').join('') + '</div>';
  const byName = (a, b) => a[1].name.localeCompare(b[1].name, 'zh');

  function home() {
    const c = (h, t, n) => '<a href="' + h + '"><b>' + t + '</b><span>' + n + '</span></a>';
    return '<div class="home"><h2>' + esc(D.title) + ' 百科</h2><p>数据直接从游戏文件里读出来，离线也能查。点人物、物品、地点之间的链接可以互相跳转；地点页给出从最近的飞行点走过去的路线，可以一键复制成指令。</p>' +
      '<div class="cards">' + c('#/skills', '武功', Object.keys(D.skills).length + ' 种') + c('#/fams', '门派', Object.keys(D.fams).length + ' 个') +
      c('#/npcs', '人物', Object.keys(D.npcs).length + ' 个') + c('#/items', '物品', Object.keys(D.items).length + ' 件') +
      c('#/rooms', '地点', Object.keys(D.rooms).length + ' 处') + '</div><p class="muted">数据生成于 ' + esc(D.made) + '</p></div>';
  }

  function skills(f, page) {
    const types = [['', '全部'], ['martial', '武功'], ['knowledge', '知识'], ['basic', '基本功夫'], ['pfm', '有绝招']];
    let es = Object.entries(D.skills);
    if (f === 'basic') es = es.filter(([, s]) => !s.enable.length && s.type === 'martial');
    else if (f === 'pfm') es = es.filter(([, s]) => s.pfm.length);
    else if (f) es = es.filter(([, s]) => s.type === f);
    es.sort(byName);
    return chips(types, f, '#/skills') + listPage(es, '#/skills' + (f ? '?f=' + f : ''), page, ([k, s]) =>
      row('#/skill/' + enc(k), s.name, s.teach.length ? s.teach.length + ' 位师父' : '', (TYPE[s.type] || s.type) + (s.enable.length ? ' · 可当 ' + s.enable.map(skName).join('、') : '')));
  }
  function skill(id) {
    const s = D.skills[id];
    if (!s) return notFound();
    const fams = {};
    for (const [f] of s.teach) { const n = D.npcs[f]; if (n && n.fam) fams[n.fam.n] = 1; }
    return '<h2>' + esc(s.name) + '</h2><div class="muted">' + esc(id) + ' · ' + esc(TYPE[s.type] || s.type) + '</div>' +
      section('门派', Object.keys(fams).length ? '<div class="tags">' + Object.keys(fams).map((n) => link('fam', n, n).replace('<a ', '<a class="tag" ')).join('') + '</div>' : '') +
      section('可以激发为', s.enable.length ? '<div class="tags">' + s.enable.map((e) => skLink(e).replace('<a ', '<a class="tag" ')).join('') + '</div>' : '') +
      section('绝招', s.pfm.length ? '<table>' + s.pfm.map((p) => '<tr><td>' + esc(p.name || p.id) + '</td><td class="n"><code>' + esc(p.k + ' ' + (s.enable.find((e) => e !== 'parry') || '') + '.' + p.id) + '</code></td></tr>').join('') + '</table>' : '') +
      section('哪里学（能收徒的师父，按等级）', s.teach.length ? '<table>' + s.teach.slice(0, 40).map(([f, lv]) => {
        const n = D.npcs[f];
        return '<tr><td>' + npcLink(f) + (n && n.fam ? ' <span class="muted">' + esc(n.fam.n) + '</span>' : '') + (n && n.at[0] ? '<br><span class="muted">' + roomLink(n.at[0]) + '</span>' : '') + '</td><td class="n">' + lv + ' 级</td></tr>';
      }).join('') + '</table>' : '') +
      section('秘籍', s.books.length ? '<table>' + s.books.map((b) => { const it = D.items[b]; return '<tr><td>' + itemLink(b) + '</td><td class="n">' + (it && it.book ? it.book.min + '→' + it.book.max + ' 级' : '') + '</td></tr>'; }).join('') + '</table>' : '') +
      '<p class="muted">会这门功夫的人物共 ' + s.know + ' 个。</p>';
  }

  function npcs(f, page) {
    const opts = [['', '全部'], ['teach', '能拜师'], ['sell', '卖东西'], ['fam', '有门派']];
    let es = Object.entries(D.npcs);
    if (f === 'teach') es = es.filter(([, n]) => n.teach && n.fam);
    else if (f === 'sell') es = es.filter(([, n]) => n.sell.length);
    else if (f === 'fam') es = es.filter(([, n]) => n.fam);
    es.sort((a, b) => b[1].exp - a[1].exp);
    return chips(opts, f, '#/npcs') + '<div class="muted">按经验从高到低</div>' + listPage(es, '#/npcs' + (f ? '?f=' + f : ''), page, ([k, n]) =>
      row('#/npc/' + enc(k), n.name + (n.nick ? '「' + n.nick + '」' : ''), n.fam ? n.fam.n : '', n.at[0] ? roomLabel(n.at[0]) : n.title));
  }
  // 拜师条件逐条比对。c = [键, 运算, 值]，含义是「玩家的这项 运算 值 时师父拒绝」。
  function statOf(st, k) {
    if (k === 'gender' || k === 'class' || k === 'fam') return st[k] || '';
    const [g, x] = k.split(':');
    return ((st[g] || {})[x]) || 0;
  }
  function refused(st, c) {
    const v = statOf(st, c[0]), w = c[2];
    switch (c[1]) {
      case '<': return v < w; case '<=': return v <= w; case '>': return v > w; case '>=': return v >= w;
      case '==': return v === w; case '!=': return v !== w;
    }
    return false;
  }
  function reqOk(st, r) {
    if (r.any) return r.any.some((c) => c && !refused(st, c));
    if (r.c) return !refused(st, r.c);
    return null;
  }
  const CLASS_CN = { bonze: '和尚', taoist: '道士', beggar: '乞丐', dancer: '舞者', eunach: '太监', scholar: '书生', lama: '喇嘛', fighter: '武士',
    swordsman: '剑客', huanxi: '欢喜佛', officer: '官员', alchemist: '炼丹', yaoshi: '药师' };
  // ---------- 差的条件怎么补 ----------
  // 从你现在的房间走过去要多远（只走路；远的按 fly 落脚点再走算）
  let DIST = null, DISTFROM = null;
  function distFrom(from) {
    if (DISTFROM === from && DIST) return DIST;
    const d = {};
    if (from && D.rooms[from]) {
      d[from] = 0;
      const q = [from];
      for (let h = 0; h < q.length; h++) {
        const r = D.rooms[q[h]];
        const nx = Object.values(r.e || {}).concat((r.x || []).map((x) => x.t));
        for (const t of nx) if (D.rooms[t] && !(t in d)) { d[t] = d[q[h]] + 1; q.push(t); }
      }
    }
    DIST = d; DISTFROM = from;
    return d;
  }
  // [花费, 说明]：花费只用来排序，fly 一次按 12 步算
  function costTo(f, st) {
    const d = st && st.room ? distFrom(st.room) : {};
    const g = D.rooms[f] && D.rooms[f].go;
    const walk = f in d ? d[f] : Infinity, fly = g ? 12 + g.steps.length : Infinity;
    if (walk === 0) return [0, '就在这里'];
    if (walk <= fly) return walk === Infinity ? [Infinity, ''] : [walk, '走 ' + walk + ' 步'];
    return [fly, 'fly ' + g.fly + (g.steps.length ? ' 再走 ' + g.steps.length + ' 步' : '')];
  }
  function npcCost(nf, st) {
    let best = [Infinity, ''];
    for (const f of D.npcs[nf].at || []) { const c = costTo(f, st); if (c[0] < best[0]) best = c; }
    return best;
  }
  // 谁能教你这门技能到 need 级
  function teachersOf(s, need, st, target) {
    const fam = (st && st.fam) || (target && target.fam && target.fam.n) || '';
    const out = [];
    for (const [nf, m] of Object.entries(D.npcs)) {
      if (target && m === target) continue;
      const lv = (m.sk || {})[s] || 0;
      if (lv < need || !(m.at || []).length) continue;
      let how, rank;
      if (m.lt === 1) { how = '谁都教'; rank = 0; }
      else if (m.teach && m.fam && m.fam.n === fam) {
        if (st && st.fam) { how = '本门'; rank = 0; }
        else { const b = canJoin(m, st || {}); how = b === 0 ? '拜他为师后能学，条件都满足' : b > 0 ? '拜他为师后能学，他还有 ' + b + ' 条拜师条件你不满足' : '拜他为师后能学'; rank = b === 0 ? 1 : 2; }
      } else if (m.lt === 2) { how = '有条件才教（交学费或做过任务）'; rank = 3; }
      else continue;
      out.push({ nf, lv, how, rank, cost: npcCost(nf, st) });
    }
    out.sort((a, b) => a.rank - b.rank || a.cost[0] - b.cost[0] || a.lv - b.lv);
    return out;
  }
  function booksOf(s, cur) {
    return (D.skills[s] ? D.skills[s].books : []).filter((f) => D.items[f] && D.items[f].book && D.items[f].book.max > cur)
      .map((f) => [f, D.items[f]]).sort((a, b) => a[1].book.min - b[1].book.min);
  }
  const listTeachers = (ts) => '<ul class="how">' + ts.slice(0, 5).map((t) => '<li>' + npcLink(t.nf) + ' <span class="muted">' +
    t.lv + ' 级 · ' + esc(t.how) + (t.cost[1] ? ' · ' + esc(t.cost[1]) : '') + '</span></li>').join('') +
    (ts.length > 5 ? '<li class="muted">另有 ' + (ts.length - 5) + ' 人</li>' : '') + '</ul>';
  const listBooks = (bs) => '<ul class="how">' + bs.slice(0, 3).map(([f, it]) => '<li>秘籍 ' + itemLink(f) + ' <span class="muted">' +
    it.book.min + '~' + it.book.max + ' 级能读' + ((it.sold || []).length ? ' · ' + esc(npcName(it.sold[0])) + '在卖' : '') + '</span></li>').join('') + '</ul>';
  // 一个比较式 c = [键, 运算, 值]（玩家「运算 值」时被拒）→ { short, html }
  const BASIC_ATTR = { int: ['literate', 10, '学「读书写字」，每 10 级悟性 +1'], con: ['force', 10, '练「基本内功」，每 10 级根骨 +1'],
    dex: ['dodge', 10, '练「基本轻功」，每 10 级身法 +1'] };
  function hintC(c, st, target) {
    const [k, op, w] = c, [g, x] = k.split(':'), cur = statOf(st, k);
    const no = (why) => ({ short: why, html: '<div class="how no">' + esc(why) + '</div>' });
    const box = (txt, extra) => ({ short: txt.split('。')[0], html: '<div class="how">' + esc(txt) + (extra || '') + '</div>' });
    if (g === 'b' || g === 'e') {
      const need = op === '<' ? w : op === '<=' ? w + 1 : 0;
      if (!need) return no('这门武功练得太高了，师父不收，没法降回去。');
      const base = (st.b || {})[x] || 0;
      const ts = teachersOf(x, need, st, target), bs = booksOf(x, base);
      const nm = D.skills[x] ? D.skills[x].name : x;
      let txt = '要把「' + nm + '」练到 ' + need + ' 级，现在 ' + (g === 'e' ? '有效 ' + cur : base) + ' 级。';
      if (g === 'e') txt += '有效等级 = 基本等级 + 激发到它上面的高级武功等级，学一门能激发成它的武功也算。';
      if (!ts.length && !bs.length) txt += target && target.fam && !(st && st.fam) ? '先拜入' + target.fam.n + '，跟本门师父学。' : '百科里没找到能教到这个等级的人。';
      const t0 = ts[0];
      const r = box(txt, (ts.length ? listTeachers(ts) : '') + (bs.length ? listBooks(bs) : ''));
      if (t0) r.short = '找' + npcName(t0.nf) + '学' + nm + (t0.cost[1] ? '（' + t0.cost[1] + '）' : '');
      else if (bs.length) r.short = '读' + bs[0][1].name;
      return r;
    }
    if (g === 'a') {
      const diff = op === '<' ? w - cur : op === '<=' ? w + 1 - cur : 0;
      if (diff <= 0) return no('这项太高了，补不了。');
      if (x === 'per' || x === 'kar') return no((x === 'per' ? '容貌' : '福缘') + '是先天属性，补不了。');
      if (x === 'str') return box('膂力还差 ' + diff + ' 点。拳脚类基本功（基本拳法、掌法、指法、手法、爪法、扑击格斗）每 30 级膂力 +1，几门加在一起算。');
      const [sk, per, how] = BASIC_ATTR[x];
      const lv = ((st.b || {})[sk] || 0) + diff * per;
      const ts = teachersOf(sk, lv, st, target);
      const r = box((ATTR.find((a) => a[0] === x) || [x, x])[1] + '还差 ' + diff + ' 点。' + how + '，要练到 ' + lv + ' 级。', ts.length ? listTeachers(ts) : '');
      r.short = how.split('，')[0] + '到 ' + lv + ' 级';
      return r;
    }
    if (g === 'p') {
      const need = op === '<' ? w - cur : op === '>' ? cur - w : 0;
      switch (x) {
        case 'combat_exp': return op === '>' ? no('经验太高了，这位师父只收新手，补不了。') : box('经验还差 ' + need + '。经验靠打架和做任务涨（师门任务、自动师门）。');
        case 'shen': return op === '<' ? box('正气还差 ' + need + '。正气靠杀坏人、邪派人物，做正派的任务涨。')
          : box('要邪气（神在 ' + w + ' 以下），还差 ' + need + '。邪气靠杀好人、正派人物涨。');
        case 'max_neili': return box('内力上限还差 ' + need + '。靠打坐（dazuo，可以用自动修炼）涨，基本内功越高，上限能练得越高。');
        case 'max_jingli': return box('精力上限还差 ' + need + '。靠吐纳（tuna）涨。');
        case 'age': return op === '<' ? box('年龄还差 ' + need + ' 岁，在线时间长了自然会长。') : no('年纪太大了，补不了。');
        case 'per': case 'kar': case 'int': case 'str': case 'con': case 'dex': return no('这是出生时定下的先天属性，补不了。');
      }
      return box('「' + x + '」还差 ' + need + '。');
    }
    if (k === 'gender') return no('性别改不了，补不了。');
    if (k === 'class') {
      if (op === '==') return no('已经是这个身份的不收，补不了。');
      const gv = ((D.cls || {})[w] || []).filter((f) => D.npcs[f] && D.npcs[f] !== target && (D.npcs[f].at || []).length);
      const nm = CLASS_CN[w] || w;
      const ts = gv.map((nf) => ({ nf, lv: 0, how: D.npcs[nf].fam ? D.npcs[nf].fam.n : '', rank: 0, cost: npcCost(nf, st) })).sort((a, b) => a.cost[0] - b.cost[0]);
      const r = box('要先变成' + nm + '。下面这些人收你（拜师或剃度）时会改你的身份：', ts.length ? '<ul class="how">' + ts.slice(0, 5).map((t) => '<li>' + npcLink(t.nf) +
        ' <span class="muted">' + esc(t.how) + (t.cost[1] ? ' · ' + esc(t.cost[1]) : '') + '</span></li>').join('') + '</ul>' : '');
      if (ts[0]) r.short = '先找' + npcName(ts[0].nf) + '变成' + nm;
      return r;
    }
    if (k === 'fam') {
      if (op === '==') return no('不收' + w + '的人，补不了。');
      if (st.fam && st.fam !== w) return no('你已经是' + st.fam + '的人了，要改投' + w + '只能先叛师（会被记过）。');
      const ms = (D.fams[w] || []).filter((f) => D.npcs[f].teach && (D.npcs[f].at || []).length).map((nf) => ({ nf, bad: canJoin(D.npcs[nf], st), cost: npcCost(nf, st) }))
        .filter((m) => m.bad === 0 || m.bad === -1).sort((a, b) => (a.bad === 0 ? 0 : 1) - (b.bad === 0 ? 0 : 1) || D.npcs[a.nf].exp - D.npcs[b.nf].exp);
      const r = box('要先拜入' + w + '的低辈分师父。你现在就能拜的：', ms.length ? '<ul class="how">' + ms.slice(0, 5).map((m) => '<li>' + npcLink(m.nf) +
        ' <span class="muted">第 ' + D.npcs[m.nf].fam.g + ' 代' + (m.bad === -1 ? ' · 没读出条件' : '') + (m.cost[1] ? ' · ' + esc(m.cost[1]) : '') + '</span></li>').join('') + '</ul>' : '<div class="muted">没找到条件都满足的。</div>');
      if (ms[0]) r.short = '先拜' + npcName(ms[0].nf);
      return r;
    }
    return { short: '', html: '' };
  }
  function howTo(r, st, target) {
    if (r.c) return hintC(r.c, st, target);
    if (r.any) {
      const hs = r.any.filter((c) => c && refused(st, c)).map((c) => hintC(c, st, target));
      return { short: hs[0] ? hs[0].short : '', html: '<div class="muted">满足其中一项就行：</div>' + hs.map((h) => h.html).join('') };
    }
    return { short: '', html: '' };
  }
  function failing(n, st) { return ((n.rc && n.rc.req) || []).filter((r) => reqOk(st, r) === false); }
  function mark(ok) { return ok === null ? '' : ok ? '<b class="ok">✓</b> ' : '<b class="no">✗</b> '; }
  function recruitBox(n, st, f) {
    const rc = n.rc || { req: [], said: [], daily: 0 };
    let bad = 0, known = 0;
    const li = rc.req.map((r) => {
      let t = esc(r.t);
      if (r.s && D.skills[r.s]) { const nm = esc(D.skills[r.s].name); t = t.replace(nm, skLink(r.s)); }
      const ok = st ? reqOk(st, r) : null;
      if (ok !== null) { known++; if (!ok) bad++; }
      return '<li>' + mark(ok) + t + (ok === false ? howTo(r, st, n).html : '') + '</li>';
    });
    if (rc.daily) li.push('<li>每天收徒有名额，满了要第二天再来</li>');
    let famOk = null;
    if (st) {
      famOk = !st.fam || st.fam === n.fam.n;
      known++; if (!famOk) bad++;
    }
    li.push('<li class="muted">' + mark(famOk) + '通用：没有拜过别的门派' + (st && st.fam ? '（你现在是' + esc(st.fam) + '）' : '') + '、没有叛过师</li>');
    const verdict = !st ? '<div class="muted" id="rcwho">打开游戏并登录后，这里会逐条对照你的角色。</div>'
      : '<div class="rcv ' + (bad ? 'no' : 'ok') + '">' + esc(st.name || '你') + '：' +
        (bad ? '还差 ' + bad + ' 条' : known ? '读得出的条件都满足了，可以去拜师' : '没有读出可比对的条件') + '</div>';
    if (st && st.fam && st.fam !== n.fam.n) li[li.length - 1] += '<div class="how no">已经入了别的门派，要拜这位师父只能先叛师。</div>';
    return verdict + baiBtn(f, n, st, bad) + '<ul class="rc">' + li.join('') + '</ul>' +
      (!rc.req.length ? '<div class="muted">源码里没有读出具体的属性要求' + (rc.said.length ? '，下面是师父拒绝时说的话' : '') + '。</div>' : '') +
      (rc.said.length ? '<div class="said">' + rc.said.map((s) => '<div>「' + esc(s) + '」</div>').join('') + '</div>' : '');
  }
  // 「去拜师」：走到师父那里发 apprentice <id>，结果在游戏里显示
  function baiBtn(f, n, st, bad) {
    if (!f || !n.id) return '';
    if (!(n.at || []).length) return '<div class="muted">不知道这位师父在哪个房间，没法带你去拜师。</div>';
    if (st && st.master && st.master === n.id && st.fam === n.fam.n) return '<div class="muted">已经是你的师父了。</div>';
    const r = D.rooms[n.at[0]];
    const cmds = r && r.go ? ['fly ' + r.go.fly].concat(r.go.steps) : [];
    return '<div class="go"><button data-file="' + esc(n.at[0]) + '" data-then="apprentice ' + esc(n.id) + '" data-who="' + esc(n.name) + '" data-go="' +
      esc(cmds.concat(['apprentice ' + n.id]).join(';')) + '">去拜师</button>' +
      (bad ? ' <span class="muted">还有 ' + bad + ' 条不满足，去了多半会被拒绝</span>' : ' <span class="muted">走到' + esc(n.name) + '那里发 <code>apprentice ' + esc(n.id) + '</code></span>') + '</div>';
  }
  function npc(f) {
    const n = D.npcs[f];
    if (!n) return notFound();
    const shen = n.shen > 0 ? '正 ' + n.shen : n.shen < 0 ? '邪 ' + -n.shen : '';
    return '<h2>' + esc(n.name) + (n.nick ? ' <span class="muted">「' + esc(n.nick) + '」</span>' : '') + '</h2>' +
      '<div class="muted">' + esc(n.title) + (n.id ? ' · ' + esc(n.id) : '') + '</div>' +
      kv([['门派', n.fam ? link('fam', n.fam.n, n.fam.n) + ' 第 ' + n.fam.g + ' 代' + (n.fam.t ? ' ' + esc(n.fam.t) : '') : ''],
        ['收徒', n.teach && n.fam ? '可以拜师（apprentice ' + esc(n.id) + '）' : ''], ['性别', esc(n.gender)], ['年龄', n.age],
        ['经验', n.exp.toLocaleString()], ['气血', n.qi], ['内力', n.neili], ['神', shen]]) +
      (n.teach && n.fam ? section('拜师条件', '<div id="rcbox">' + recruitBox(n, STATS, f) + '</div>') : '') +
      (n.long ? '<h3>描述</h3><div class="long">' + esc(n.long) + '</div>' : '') +
      section('在哪', showWhere(n.at)) +
      section('武功', skillTable(n.sk, n.map)) +
      section('出售', n.sell.length ? '<table>' + n.sell.map((i) => '<tr><td>' + itemLink(i) + '</td><td class="n">' + money(D.items[i] ? D.items[i].value : 0) + '</td></tr>').join('') + '</table>' : '') +
      section('身上带着', n.inv.length ? '<div class="tags">' + [...new Set(n.inv)].map((i) => itemLink(i).replace('<a ', '<a class="tag" ')).join('') + '</div>' : '');
  }

  function itemKind(i) {
    if (i.book) return '秘籍';
    if (i.wp) return '武器';
    if (i.ap) return '防具';
    if (i.food || i.water) return '食物';
    return '';
  }
  function items(f, page) {
    const opts = [['', '全部'], ['秘籍', '秘籍'], ['武器', '武器'], ['防具', '防具'], ['食物', '食物'], ['sold', '有卖']];
    let es = Object.entries(D.items);
    if (f === 'sold') es = es.filter(([, i]) => i.sold.length);
    else if (f) es = es.filter(([, i]) => itemKind(i) === f);
    es.sort(byName);
    return chips(opts, f, '#/items') + listPage(es, '#/items' + (f ? '?f=' + enc(f) : ''), page, ([k, i]) =>
      row('#/item/' + enc(k), i.name, itemKind(i), (i.value ? money(i.value) : '') + (i.sold.length ? ' · ' + npcName(i.sold[0]) + '有卖' : '')));
  }
  const propList = (p) => Object.entries(p || {}).filter(([, v]) => typeof v === 'number' && v).map(([k, v]) => '<span class="tag">' + esc((D.skills[k] ? skName(k) : PROP[k] || k) + ' ' + (v > 0 ? '+' : '') + v) + '</span>').join('');
  const PROP = { damage: '伤害', armor: '防御', dodge: '躲闪', parry: '招架', attack: '命中' };
  function item(f) {
    const i = D.items[f];
    if (!i) return notFound();
    return '<h2>' + esc(i.name) + '</h2><div class="muted">' + esc(itemKind(i) || '物品') + (i.skt ? ' · ' + esc(skName(i.skt)) : '') + (i.at ? ' · ' + esc(i.at) : '') + '</div>' +
      kv([['价格', i.value ? money(i.value) : ''], ['重量', i.w ? i.w + '' : ''], ['食物', i.food ? '可吃 ' + i.food : ''], ['饮水', i.water ? '可以喝' : '']]) +
      (i.book ? section('秘籍', kv([['武功', skLink(i.book.s)], ['等级', i.book.min + ' → ' + i.book.max], ['需要经验', i.book.exp ? i.book.exp.toLocaleString() : '']])) : '') +
      section('属性', (i.wp || i.ap) ? '<div class="tags">' + propList(i.wp) + propList(i.ap) + '</div>' : '') +
      (i.long ? '<h3>描述</h3><div class="long">' + esc(i.long) + '</div>' : '') +
      section('谁在卖', i.sold.length ? '<table>' + i.sold.map((n) => '<tr><td>' + npcLink(n) + '</td><td class="n">' + (D.npcs[n] && D.npcs[n].at[0] ? roomLink(D.npcs[n].at[0]) : '') + '</td></tr>').join('') + '</table>' : '') +
      section('谁身上有', i.carried.length ? '<div class="tags">' + i.carried.slice(0, 30).map((n) => npcLink(n).replace('<a ', '<a class="tag" ')).join('') + '</div>' : '') +
      section('地上能捡到', showWhere(i.found)) +
      (!i.sold.length && !i.carried.length && !i.found.length ? '<p class="muted">没找到固定的获得途径，可能是任务奖励或要特殊方式得到。</p>' : '');
  }

  function roomsPage() {
    const rs = Object.entries(D.regions).sort((a, b) => b[1].rooms.length - a[1].rooms.length);
    return '<div class="muted">按区域</div>' + rows(rs.map(([k, r]) => row('#/region/' + enc(k), r.name, r.rooms.length + ' 处', k)));
  }
  function region(k, page) {
    const r = D.regions[k];
    if (!r) return notFound();
    const es = r.rooms.map((f) => [f, D.rooms[f]]).sort((a, b) => a[1].s.localeCompare(b[1].s, 'zh'));
    return '<h2>' + esc(r.name) + '</h2>' + listPage(es, '#/region/' + enc(k), page, ([f, rm]) =>
      row('#/room/' + enc(f), rm.s, rm.go ? rm.go.steps.length + ' 步' : '', rm.n.filter((o) => D.npcs[o]).map(npcName).join('、')));
  }
  function room(f) {
    const r = D.rooms[f];
    if (!r) return notFound();
    const ex = Object.entries(r.e);
    const who = r.n.filter((o) => D.npcs[o]), what = r.n.filter((o) => D.items[o]);
    return '<h2>' + esc(r.s) + '</h2><div class="muted">' + link('region', regionOf(f), regionName(regionOf(f))) + (r.nf ? ' · 禁止战斗' : '') + '</div>' +
      section('怎么去', goBox(f)) +
      section('出口', ex.length ? '<div class="exits">' + ex.map(([d, to]) => esc(DIRS[d] || d) + ' ' + roomLink(to)).join('<br>') + '</div>' : '') +
      section('特殊出入', (r.x || []).length ? '<div class="exits">' + r.x.map((x) => '<code>' + esc(x.c) + '</code>' + (x.d ? ' 后往' + esc(DIRS[x.d] || x.d) : '') + ' → ' + roomLink(x.t)).join('<br>') + '</div>' : '') +
      section('人物', who.length ? '<div class="tags">' + [...new Set(who)].map((o) => npcLink(o).replace('<a ', '<a class="tag" ')).join('') + '</div>' : '') +
      section('物品', what.length ? '<div class="tags">' + [...new Set(what)].map((o) => itemLink(o).replace('<a ', '<a class="tag" ')).join('') + '</div>' : '');
  }

  function famsPage() {
    const es = Object.entries(D.fams).sort((a, b) => b[1].length - a[1].length);
    return rows(es.map(([k, l]) => row('#/fam/' + enc(k), k, l.length + ' 人', l.filter((f) => D.npcs[f].teach).length + ' 位可拜师')));
  }
  function fam(k) {
    const l = D.fams[k];
    if (!l) return notFound();
    const ns = l.map((f) => [f, D.npcs[f]]).sort((a, b) => a[1].fam.g - b[1].fam.g || b[1].exp - a[1].exp);
    const sks = {};
    for (const [, n] of ns) if (n.teach) for (const s of Object.keys(n.sk)) if (D.skills[s] && D.skills[s].enable.length) sks[s] = Math.max(sks[s] || 0, n.sk[s]);
    return '<h2>' + esc(k) + '</h2>' +
      section('门派武功（师父会的特殊武功）', Object.keys(sks).length ? '<div class="tags">' + Object.keys(sks).sort((a, b) => sks[b] - sks[a]).map((s) => skLink(s).replace('<a ', '<a class="tag" ')).join('') + '</div>' : '') +
      section('人物（按辈分）', rows(ns.map(([f, n]) => row('#/npc/' + enc(f), n.name, '第 ' + n.fam.g + ' 代' + (n.teach ? ' · 收徒' : ''), n.at[0] ? roomLabel(n.at[0]) : n.fam.t))));
  }

  function searchPage(q, page) {
    const res = search(q);
    if (!res.length) return '<p class="muted">没有找到「' + esc(q) + '」。</p>';
    return listPage(res, '#/search/' + enc(q), page, (e) => row('#/' + e[0] + '/' + enc(e[1]), e[2], KIND[e[0]], e[3]));
  }
  const notFound = () => '<p class="muted">没有这个条目。</p>';

  // ---------- router ----------
  // 「我的角色」：打开游戏并登录后，从游戏里读出当前角色，和百科数据对照
  const ATTR = [['int', '悟性'], ['str', '膂力'], ['con', '根骨'], ['dex', '身法'], ['per', '容貌'], ['kar', '福缘']];
  function canJoin(n, st) {
    if (!n.teach || !n.fam) return null;
    if (st.fam && st.fam !== n.fam.n) return null;            // 已经有别的门派
    let bad = 0, known = 0;
    for (const r of (n.rc && n.rc.req) || []) { const ok = reqOk(st, r); if (ok !== null) known++; if (ok === false) bad++; }
    return known ? bad : -1;                                   // -1：源码里没读出可比对的条件
  }
  function mePage() {
    const st = STATS;
    if (!st) return '<h2>我的角色</h2><div class="muted" id="mewait">' + (statsAt && Date.now() - statsAt > 2500
      ? '没连上游戏。先打开游戏页面并登录角色，再回到这里（或在游戏里点「百科」）。'
      : '正在向游戏读取角色…') + '</div>';
    const s = st.s || {}, p = st.p || {};
    const master = st.master && Object.entries(D.npcs).find(([, n]) => n.id === st.master && n.fam && n.fam.n === st.fam);
    const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '';
    let h = '<h2>' + esc(st.name || '') + (st.nick ? ' <span class="muted">「' + esc(st.nick) + '」</span>' : '') + '</h2>' +
      (st.title ? '<div class="muted">' + esc(st.title) + '</div>' : '') +
      kv([['门派', st.fam ? esc(st.fam) + (s['family/generation'] ? '第 ' + s['family/generation'] + ' 代' : '') : '无门无派'],
        ['师父', master ? npcLink(master[0]) : st.master ? esc(st.master) : ''],
        ['身份', st.class ? esc(CLASS_CN[st.class] || st.class) : ''], ['性别', esc(st.gender || '')], ['年龄', p.age ? p.age + ' 岁' : ''],
        ['所在', st.room && D.rooms[st.room] ? roomLink(st.room) : ''],
        ['经验', p.combat_exp], ['潜能', s.potential != null ? Math.max(0, s.potential - (s.learned_points || 0)) : ''],
        ['神', p.shen > 0 ? '正 ' + p.shen : p.shen < 0 ? '邪 ' + -p.shen : '0'],
        ['气血', s.qi + ' / ' + s.eff_qi + ' / ' + s.max_qi], ['精神', s.jing + ' / ' + s.eff_jing + ' / ' + s.max_jing],
        ['内力', (s.neili || 0) + ' / ' + (p.max_neili || 0)], ['精力', (s.jingli || 0) + ' / ' + (p.max_jingli || 0)],
        ['食物', s.food], ['饮水', s.water], ['存款', s.balance ? money(s.balance) : '']]);
    h += section('天赋', kv(ATTR.map(([k, t]) => [t, (st.a || {})[k]])));
    const ks = Object.keys(st.b || {}).sort((a, b) => st.b[b] - st.b[a]);
    const used = {};
    for (const [base, sk] of Object.entries(st.map || {})) (used[sk] ||= []).push(base);
    h += section('武功（' + ks.length + ' 种）', ks.length ? '<table>' + ks.map((k) => '<tr><td>' + (D.skills[k] ? skLink(k) : esc(k)) +
      (used[k] ? ' <span class="muted">激发为 ' + used[k].map((b) => D.skills[b] ? esc(D.skills[b].name) : esc(b)).join('、') + '</span>' : '') +
      '</td><td class="n">' + st.b[k] + ' 级' + (st.e && st.e[k] !== st.b[k] ? ' <span class="muted">（有效 ' + st.e[k] + '）</span>' : '') + '</td></tr>').join('') + '</table>' : '<div class="muted">还没有学会任何武功。</div>');
    // 能拜的师父：门派对得上，读得出的条件按满足的条数排
    const cands = [];
    for (const [f, n] of Object.entries(D.npcs)) {
      if (master && f === master[0]) continue;
      const bad = canJoin(n, st);
      if (bad === null) continue;
      cands.push([f, n, bad]);
    }
    // 经验低的师父排前面：新手先看得到够得着的
    cands.sort((a, b) => a[1].exp - b[1].exp);
    const ok = cands.filter((c) => c[2] === 0), near = cands.filter((c) => c[2] === 1), unk = cands.filter((c) => c[2] === -1);
    const line = ([f, n, bad]) => {
      let sub = n.at[0] ? roomLabel(n.at[0]) : '不知道在哪';
      if (bad === 1) { const r = failing(n, st)[0], h = r ? howTo(r, st, n) : null; sub = '差：' + (r ? r.t : '') + (h && h.short ? '。' + h.short : ''); }
      const a = row('#/npc/' + enc(f), n.name, n.fam.n + ' 第 ' + n.fam.g + ' 代', sub);
      return bad === 1 ? a : '<div class="rowb">' + a + baiBtn(f, n, st, 0).replace(/ <span class="muted">.*<\/span><\/div>$/, '</div>') + '</div>';
    };
    const more = (l, n) => (l.length > n ? '<div class="muted">按经验从低到高，只列前 ' + n + ' 位。</div>' : '');
    h += section((st.fam ? '本门' : '') + '条件都满足的师父（' + ok.length + '）',
      ok.length ? rows(ok.slice(0, 30).map(line)) + more(ok, 30) : '<div class="muted">没有。</div>') +
      (near.length ? section('只差一条的师父（' + near.length + '）', rows(near.slice(0, 20).map(line)) + more(near, 20)) : '') +
      (unk.length ? section('没读出条件的师父（' + unk.length + '）', rows(unk.slice(0, 20).map(line)) + more(unk, 20)) : '') +
      '<div class="muted">只按源码里读得出的条件判断。师父可能还有别的要求（比如先找低辈分的弟子拜师），点进去看原话。</div>';
    return h + '<p class="muted">数据在你打开这一页时从游戏里读出；<a href="#/me" data-reload="1">刷新</a>。</p>';
  }

  const TABS = { '': '首页', me: '我的角色', skills: '武功', fams: '门派', npcs: '人物', items: '物品', rooms: '地点' };
  const TAB_OF = { skill: 'skills', fam: 'fams', npc: 'npcs', item: 'items', room: 'rooms', region: 'rooms' };
  function route() {
    if (!D) return;
    const h = location.hash.replace(/^#\/?/, '');
    const [p, query] = h.split('?');
    const prm = new URLSearchParams(query || '');
    const f = prm.get('f') || '', page = +prm.get('p') || 0;
    const slash = p.indexOf('/');
    const kind = slash < 0 ? p : p.slice(0, slash), key = slash < 0 ? '' : decodeURIComponent(p.slice(slash + 1));
    let html;
    switch (kind) {
      case 'skills': html = skills(f, page); break;
      case 'skill': html = skill(key); break;
      case 'npcs': html = npcs(f, page); break;
      case 'npc': html = npc(key); { const n = D.npcs[key]; if (n && n.teach && n.fam) setTimeout(() => refreshRecruit(key), 0); } break;
      case 'items': html = items(f, page); break;
      case 'item': html = item(key); break;
      case 'rooms': html = roomsPage(); break;
      case 'region': html = region(key, page); break;
      case 'room': html = room(key); break;
      case 'fams': html = famsPage(); break;
      case 'me':
        html = mePage();
        askStats(() => { if (/^#\/me\b/.test(location.hash)) main.innerHTML = mePage(); }, true);
        setTimeout(() => { const w = document.getElementById('mewait'); if (w && !STATS) main.innerHTML = mePage(); }, 2800);
        break;
      case 'fam': html = fam(key); break;
      case 'search': {
        // 名字正好对上唯一一条（游戏里点「查百科」时常见）：直接打开那一页
        const exact = search(key).filter((e) => e[2] === key.trim());
        if (exact.length === 1 && !page) { location.replace('#/' + exact[0][0] + '/' + enc(exact[0][1])); return; }
      }
        html = searchPage(key, page); if ($('#q').value !== key) $('#q').value = key; break;
      default: html = home();
    }
    const tab = TABS[kind] !== undefined ? kind : TAB_OF[kind] || (kind === 'search' ? 'x' : '');
    for (const a of document.querySelectorAll('nav a')) a.classList.toggle('on', a.dataset.t === tab);
    main.innerHTML = html;
    if (!page) window.scrollTo(0, 0);
    document.title = (D.title || '') + ' 百科';
  }

  // 「带我去」：把路线交给游戏去走。
  // 在游戏里打开的百科（嵌在游戏页面里）直接交给外层页面；单独打开的百科，通过同源的
  // BroadcastChannel 交给已经开着的游戏页面；游戏没开着就退回到复制指令。
  const EMBED = /[?&]embed=1\b/.test(location.search);
  // 向打开着的游戏要当前角色的属性和技能（嵌在游戏里用 postMessage，单独的百科页用 BroadcastChannel）
  let STATS = null, statsAt = 0;
  function askStats(done, force) {
    if (!force && Date.now() - statsAt < 3000) return;
    statsAt = Date.now();
    const id = Math.random().toString(36).slice(2);
    const take = (d) => { if (d && d.type === 'wiki-stats-reply' && d.id === id && d.stats) { STATS = d.stats; done(); } };
    if (EMBED && window.parent !== window) {
      const h = (e) => { if (e.origin === location.origin) take(e.data); };
      window.addEventListener('message', h);
      setTimeout(() => window.removeEventListener('message', h), 3000);
      window.parent.postMessage({ type: 'wiki-stats', id }, location.origin);
      return;
    }
    let ch;
    try { ch = new BroadcastChannel('mudwasm-' + game); } catch (e) { return; }
    ch.onmessage = (e) => take(e.data);
    ch.postMessage({ type: 'wiki-stats', id });
    setTimeout(() => ch.close(), 3000);
  }
  function refreshRecruit(f) {
    askStats(() => {
      const box = document.getElementById('rcbox');
      const n = D.npcs[f];
      if (box && n && location.hash.includes(enc(f))) box.innerHTML = recruitBox(n, STATS, f);
    });
  }

  function sendGo(b) {
    const cmds = b.dataset.go.split(';'), file = b.dataset.file || '';
    const then = b.dataset.then || '', who = b.dataset.who || '', label = b.textContent;
    const say = (t) => { b.textContent = t; setTimeout(() => { b.textContent = label; }, 3000); };
    if (EMBED && window.parent !== window) { window.parent.postMessage({ type: 'wiki-go', cmds, file, then, who }, location.origin); return; }
    let ch = null;
    try { ch = new BroadcastChannel('mudwasm-' + game); } catch (e) { /* old browser */ }
    const fallback = () => {
      const txt = cmds.join(';');
      const done = () => say('游戏没打开，已复制指令');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => prompt('游戏没打开，复制下面的指令到游戏里发送', txt));
      else prompt('游戏没打开，复制下面的指令到游戏里发送', txt);
    };
    if (!ch) { fallback(); return; }
    const id = Math.random().toString(36).slice(2);
    let acked = false;
    ch.onmessage = (e) => { if (e.data && e.data.type === 'wiki-go-ack' && e.data.id === id) { acked = true; say('已交给游戏，切到游戏页面看'); ch.close(); } };
    ch.postMessage({ type: 'wiki-go', cmds, file, then, who, id });
    setTimeout(() => { if (!acked) { ch.close(); fallback(); } }, 700);
  }

  function setup() {
    $('nav').innerHTML = Object.entries(TABS).map(([k, t]) => '<a data-t="' + k + '" href="#/' + k + '">' + t + '</a>').join('');
    const sel = $('#game');
    sel.innerHTML = GAMES.map((g) => '<option value="' + g.id + '"' + (g.id === game ? ' selected' : '') + '>' + esc(g.title) + '</option>').join('');
    sel.style.display = GAMES.length > 1 ? '' : 'none';
    sel.onchange = () => { location.href = '?g=' + enc(sel.value); };
    const play = $('#play');
    if (play) play.href = '../' + enc(game) + '/';
    let t = 0;
    $('#q').addEventListener('input', (e) => {
      clearTimeout(t);
      const v = e.target.value.trim();
      t = setTimeout(() => { location.hash = v ? '#/search/' + enc(v) : '#/'; }, 250);
    });
    if (EMBED) document.body.classList.add('embed');
    main.addEventListener('click', (e) => {
      const g = e.target.closest('button[data-go]');
      if (g) { sendGo(g); return; }
      if (e.target.closest('a[data-reload]')) { e.preventDefault(); STATS = null; statsAt = 0; route(); return; }
      const b = e.target.closest('button[data-copy]');
      if (!b) return;
      const txt = b.dataset.copy;
      const done = () => { b.textContent = '已复制，到游戏里粘贴发送'; setTimeout(() => { b.textContent = '复制指令'; }, 2500); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => prompt('复制下面的指令', txt));
      else prompt('复制下面的指令', txt);
    });
    window.addEventListener('hashchange', route);
  }

  setup();
  if (!game) { main.innerHTML = '<p class="muted">没有可用的百科数据。</p>'; return; }
  main.innerHTML = '<p class="muted">正在载入…</p>';
  fetch(enc(game) + '.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    D = d; buildIndex(); route();
  }).catch((e) => { main.innerHTML = '<p class="muted">载入失败（' + esc(e.message) + '）。离线时需要先在联网状态下打开过一次百科。</p>'; });
})();
