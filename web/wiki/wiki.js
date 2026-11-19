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
  function mark(ok) { return ok === null ? '' : ok ? '<b class="ok">✓</b> ' : '<b class="no">✗</b> '; }
  function recruitBox(n, st) {
    const rc = n.rc || { req: [], said: [], daily: 0 };
    let bad = 0, known = 0;
    const li = rc.req.map((r) => {
      let t = esc(r.t);
      if (r.s && D.skills[r.s]) { const nm = esc(D.skills[r.s].name); t = t.replace(nm, skLink(r.s)); }
      const ok = st ? reqOk(st, r) : null;
      if (ok !== null) { known++; if (!ok) bad++; }
      return '<li>' + mark(ok) + t + '</li>';
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
    return verdict + '<ul class="rc">' + li.join('') + '</ul>' +
      (!rc.req.length ? '<div class="muted">源码里没有读出具体的属性要求' + (rc.said.length ? '，下面是师父拒绝时说的话' : '') + '。</div>' : '') +
      (rc.said.length ? '<div class="said">' + rc.said.map((s) => '<div>「' + esc(s) + '」</div>').join('') + '</div>' : '');
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
      (n.teach && n.fam ? section('拜师条件', '<div id="rcbox">' + recruitBox(n, STATS) + '</div>') : '') +
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
  const TABS = { '': '首页', skills: '武功', fams: '门派', npcs: '人物', items: '物品', rooms: '地点' };
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
  function askStats(done) {
    if (Date.now() - statsAt < 3000) return;
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
      if (box && n && location.hash.includes(enc(f))) box.innerHTML = recruitBox(n, STATS);
    });
  }

  function sendGo(b) {
    const cmds = b.dataset.go.split(';'), file = b.dataset.file || '';
    const say = (t) => { b.textContent = t; setTimeout(() => { b.textContent = '带我去'; }, 3000); };
    if (EMBED && window.parent !== window) { window.parent.postMessage({ type: 'wiki-go', cmds, file }, location.origin); return; }
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
    ch.postMessage({ type: 'wiki-go', cmds, file, id });
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
