// 从师父的源码里抽出拜师条件（静态解析，只认常见写法，认不出的保留师父拒绝时说的话）。
import fs from 'node:fs';
import path from 'node:path';

// 找到 name(...) { ... } 的函数体
function funcBody(src, name) {
  const re = new RegExp('\\b(?:void|int|mixed|varargs\\s+\\w+)\\s+' + name + '\\s*\\(\\s*object\\s+(\\w+)[^)]*\\)\\s*\\{', 'g');
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  for (; i < src.length && depth; i++) {
    const c = src[i];
    if (c === '"') { for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === '\\') i++; }
    else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
    else if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i++; }
    else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return { ob: m[1], body: src.slice(m.index + m[0].length, i - 1) };
}

// 取 if ( ... ) 的条件和它后面紧跟的那句话
function ifs(body) {
  const out = [];
  const re = /\bif\s*\(/g;
  let m;
  while ((m = re.exec(body))) {
    let i = re.lastIndex, depth = 1;
    for (; i < body.length && depth; i++) {
      if (body[i] === '"') { for (i++; i < body.length && body[i] !== '"'; i++) if (body[i] === '\\') i++; }
      else if (body[i] === '(') depth++;
      else if (body[i] === ')') depth--;
    }
    const cond = body.slice(re.lastIndex, i - 1);
    const rest = body.slice(i, i + 600);
    const stmt = /^\s*\{?\s*([^;]*)/.exec(rest)[1];
    let msg = '';
    if (/command\s*\(|message_vision|tell_object|write\s*\(/.test(stmt))
      msg = (stmt.match(/"((?:[^"\\]|\\.)*)"/g) || []).map((x) => x.slice(1, -1)).join('…').replace(/^(?:say|tell \w+)\s*/, '');
    out.push({ cond, msg: msg.replace(/\\n/g, '').replace(/…?\s*\+[^…]*\+\s*…?/g, '…').replace(/\$N|\$n/g, '你').replace(/HIY|NOR|HIR|HIG|HIC|HIW|CYN|YEL|RED|GRN/g, '').trim() });
  }
  return out;
}

const ATTR = { query_int: '悟性', query_str: '膂力', query_con: '根骨', query_dex: '身法', query_per: '容貌', query_kar: '福缘' };
const PROP = {
  combat_exp: '经验', shen: '神', max_neili: '内力上限', max_jingli: '精力上限', age: '年龄', per: '容貌',
  int: '先天悟性', str: '先天膂力', con: '先天根骨', dex: '先天身法', kar: '福缘', score: '江湖阅历', weiwang: '江湖威望',
};
const CLASS = { bonze: '和尚', taoist: '道士', beggar: '乞丐', dancer: '舞者', eunach: '太监', scholar: '书生', lama: '喇嘛', fighter: '武士', swordsman: '剑客', huanxi: '欢喜佛', officer: '官员', alchemist: '炼丹', yaoshi: '药师' };
const NEG = { '<': '≥', '<=': '>', '>': '≤', '>=': '<', '==': '不是', '!=': '是' };

// 一个比较式 → 要求文字；认不出返回 null
function atom(a, ob, skName) {
  a = a.trim().replace(/^\((.*)\)$/s, '$1').replace(/\(\s*(?:int|string)\s*\)\s*/g, '').trim();
  let m;
  const O = ob.replace(/\W/g, '');
  const num = '(-?\\d+)';
  const op = '(<=|>=|<|>|==|!=)';
  if ((m = new RegExp('^' + O + '->query_skill\\(\\s*"([\\w-]+)"\\s*,\\s*1\\s*\\)\\s*' + op + '\\s*' + num + '$').exec(a)))
    return { k: 'skill', s: m[1], t: skName(m[1]) + '（基本等级）' + NEG[m[2]] + ' ' + m[3], c: ['b:' + m[1], m[2], +m[3]] };
  if ((m = new RegExp('^' + O + '->query_skill\\(\\s*"([\\w-]+)"\\s*\\)\\s*' + op + '\\s*' + num + '$').exec(a)))
    return { k: 'skill', s: m[1], t: skName(m[1]) + '（有效等级）' + NEG[m[2]] + ' ' + m[3], c: ['e:' + m[1], m[2], +m[3]] };
  if ((m = new RegExp('^' + O + '->(query_\\w+)\\(\\s*\\)\\s*' + op + '\\s*' + num + '$').exec(a)) && ATTR[m[1]])
    return { k: 'attr', t: ATTR[m[1]] + ' ' + NEG[m[2]] + ' ' + m[3], c: ['a:' + m[1].slice(6), m[2], +m[3]] };
  if ((m = new RegExp('^' + O + '->query\\(\\s*"(\\w+)"\\s*\\)\\s*' + op + '\\s*' + num + '$').exec(a)) && PROP[m[1]]) {
    const c = ['p:' + m[1], m[2], +m[3]];
    if (m[1] === 'shen') {
      const n = +m[3];
      if ((m[2] === '<' || m[2] === '<=') && n >= 0) return { k: 'shen', t: '正气 ≥ ' + n, c };
      if ((m[2] === '>' || m[2] === '>=') && n <= 0) return { k: 'shen', t: '邪气 ≥ ' + -n, c };
      if ((m[2] === '<' || m[2] === '<=')) return { k: 'shen', t: '邪气 ≤ ' + -n, c };
      return { k: 'shen', t: '正气 ≤ ' + n, c };
    }
    return { k: 'prop', t: PROP[m[1]] + ' ' + NEG[m[2]] + ' ' + m[3], c };
  }
  if ((m = new RegExp('^' + O + '->query\\(\\s*"gender"\\s*\\)\\s*(==|!=)\\s*"([^"]+)"$').exec(a)))
    return { k: 'gender', t: m[1] === '==' ? '性别不能是' + m[2] : '性别必须是' + m[2], c: ['gender', m[1], m[2]] };
  if ((m = new RegExp('^' + O + '->query\\(\\s*"class"\\s*\\)\\s*(==|!=)\\s*"([^"]+)"$').exec(a)))
    return { k: 'class', t: m[1] === '==' ? '身份不能是' + (CLASS[m[2]] || m[2]) : '身份必须是' + (CLASS[m[2]] || m[2]), c: ['class', m[1], m[2]] };
  if ((m = new RegExp('^' + O + '->query\\(\\s*"family/family_name"\\s*\\)\\s*!=\\s*"([^"]+)"$').exec(a)))
    return { k: 'fam', t: '须先拜入' + m[1] + '（找辈分低的师父）', c: ['fam', '!=', m[1]] };
  if ((m = /^\w+\["family_name"\]\s*!=\s*"([^"]+)"$/.exec(a)))
    return { k: 'fam', t: '须先拜入' + m[1] + '（找辈分低的师父）', c: ['fam', '!=', m[1]] };
  if ((m = new RegExp('^!\\s*' + O + '->query\\(\\s*"(\\w+)"\\s*\\)$').exec(a)) && PROP[m[1]])
    return null;
  return null;
}

// 拆顶层 && / ||
function split(cond, sep) {
  const parts = []; let depth = 0, last = 0;
  for (let i = 0; i < cond.length; i++) {
    const c = cond[i];
    if (c === '"') { for (i++; i < cond.length && cond[i] !== '"'; i++) if (cond[i] === '\\') i++; }
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (!depth && cond.startsWith(sep, i)) { parts.push(cond.slice(last, i)); last = i + 2; i++; }
  }
  parts.push(cond.slice(last));
  return parts;
}

// 判断里可以忽略的部分（只是取变量或门派相等的前提）
const IGN = (a) => /^!\s*\(?\s*\w+\s*=\s*\w+->query\("family"\)\s*\)?$/.test(a.trim()) || /family_name"\s*\]?\s*\)?\s*==/.test(a);
const SKIP = /permit_recruit|detach|betrayer|master_id|is_bad|is_good|query_temp|find_call_out|apprentice_avail|family\/|query\("id"\)|query\("name"\)|query\("couple|query\("marry/;

export function recruitInfo(mudlibDir, npcFile, skName) {
  let src;
  try { src = fs.readFileSync(path.join(mudlibDir, npcFile + '.c'), 'latin1'); } catch { return null; }
  src = Buffer.from(src, 'latin1').toString('utf8');
  // 同目录的 #include "x.h" 一并读进来（门派公共的拜师逻辑常放在 .h 里）
  src = src.replace(/#include\s+"([^"]+)"/g, (m, h) => {
    try { return fs.readFileSync(path.join(mudlibDir, path.dirname(npcFile), h), 'utf8'); } catch { return m; }
  });
  const top = funcBody(src, 'attempt_apprentice');
  if (!top) return null;
  const fns = [top];
  // attempt_apprentice 里 call_out / 直接调用的同文件函数
  const seen = new Set(['attempt_apprentice']);
  for (let i = 0; i < fns.length && i < 4; i++) {
    for (const m of fns[i].body.matchAll(/(?:call_out\s*\(\s*"(\w+)"|\b(\w+)\s*\(\s*\w+\s*\)\s*[;)])/g)) {
      const n = m[1] || m[2];
      if (!n || seen.has(n) || /^(command|query|set|add|tell_object|write|message_vision|return|if|while|permit_recruit|recruit_apprentice|destruct)$/.test(n)) continue;
      seen.add(n);
      const f = funcBody(src, n);
      if (f) fns.push(f);
    }
  }
  const req = [], said = [];
  let daily = /apprentice_avail/.test(src);
  for (const f of fns) {
    for (const { cond, msg } of ifs(f.body)) {
      if (!new RegExp('\\b' + f.ob + '->|_fam\\[').test(cond)) continue;
      if (SKIP.test(cond)) continue;
      let ors = split(cond, '||');
      if (ors.length > 1) ors = ors.filter((a) => !IGN(a));
      const ands = ors.length === 1 ? split(ors[0], '&&').filter((a) => !IGN(a)) : ors;
      if (!ors.length || !ands.length) continue;
      let got = [];
      if (ors.length > 1) got = ors.map((a) => atom(a, f.ob, skName));
      else if (ands.length > 1) { const r = ands.map((a) => atom(a, f.ob, skName)); got = r.every(Boolean) ? [{ k: 'any', t: '以下满足一项：' + r.map((x) => x.t).join('，'), any: r.map((x) => x.c) }] : [null]; }
      else got = [atom(ands[0], f.ob, skName)];
      if (got.every(Boolean)) { for (const g of got) if (!req.some((x) => x.t === g.t)) req.push({ t: g.t, ...(g.s ? { s: g.s } : {}), ...(g.c ? { c: g.c } : {}), ...(g.any ? { any: g.any } : {}) }); }
      else if (msg && msg.length > 3 && !/[A-Za-z_]{4,}/.test(msg) && !said.includes(msg)) said.push(msg);
    }
  }

  return { req, said: said.slice(0, 6), daily: daily ? 1 : 0 };
}
