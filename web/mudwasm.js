// mudwasm.js -- run a mudlib inside the FluffOS WebAssembly driver, in the page.
//
// Exposes window.MudWasm:
//   MudWasm.start({ game, config })   boot once (idempotent); returns a Promise
//   new MudWasm.Socket()              WebSocket-shaped connection to the driver
//                                     (send / onopen / onmessage / onclose / close)
//   MudWasm.exportSave() / importSave(file) / resetSave()
//
// The mudlib arrives as mudlib.bin.gz (built by web/pack.mjs), is unpacked into
// the in-memory FS at /mudlib, and everything under /mudlib/data is mirrored to
// IndexedDB so player saves survive reloads.
(function () {
  'use strict';
  const MOUNT = '/mudlib';
  const PERSIST = ['data', 'adm/etc/wizlist']; // dirs or single files
  const SYNC_MS = 15000;
  const DEBUG = /[?&]debug\b/.test(location.search);
  const dbgDec = new TextDecoder();

  let M = null, bootPromise = null, game = 'mud';
  const sockets = new Map();
  const waiting = [];

  // ---------- overlay ----------
  let overlay;
  function status(msg) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,.85);color:#ddd;font:16px sans-serif;z-index:99999;white-space:pre-line;text-align:center';
      (document.body || document.documentElement).appendChild(overlay);
    }
    if (msg === null) { overlay.remove(); overlay = null; return; }
    overlay.textContent = msg;
  }

  // ---------- IndexedDB ----------
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('mudwasm', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('saves');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(key) {
    const db = await idb();
    return new Promise((res, rej) => {
      const r = db.transaction('saves').objectStore('saves').get(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbPut(key, val) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('saves', 'readwrite');
      if (val === undefined) tx.objectStore('saves').delete(key); else tx.objectStore('saves').put(val, key);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }

  // ---------- FS helpers ----------
  function mkdirp(FS, p) {
    let cur = '';
    for (const part of p.split('/').filter(Boolean)) {
      cur += '/' + part;
      try { FS.mkdir(cur); } catch (e) { /* exists */ }
    }
  }
  function snapshot() {
    const files = {};
    const walk = (dir, rel) => {
      let names;
      try { names = M.FS.readdir(dir); } catch (e) { return; }
      for (const n of names) {
        if (n === '.' || n === '..') continue;
        const p = dir + '/' + n, r = rel + '/' + n;
        const st = M.FS.stat(p);
        if (M.FS.isDir(st.mode)) { files[r + '/'] = null; walk(p, r); }
        else files[r] = M.FS.readFile(p);
      }
    };
    for (const d of PERSIST) {
      let st = null;
      try { st = M.FS.stat(MOUNT + '/' + d); } catch (e) { continue; }
      if (M.FS.isDir(st.mode)) walk(MOUNT + '/' + d, d);
      else files[d] = M.FS.readFile(MOUNT + '/' + d);
    }
    return files;
  }
  function restore(FS, files) {
    for (const [r, data] of Object.entries(files)) {
      if (r.endsWith('/')) mkdirp(FS, MOUNT + '/' + r);
      else { mkdirp(FS, (MOUNT + '/' + r).replace(/\/[^/]*$/, '')); FS.writeFile(MOUNT + '/' + r, data); }
    }
  }
  let lastSig = '', syncSoon = 0;
  async function sync() {
    if (!M) return;
    const files = snapshot();
    let sig = '';
    for (const [k, v] of Object.entries(files)) sig += k + ':' + (v ? v.length + ':' + (v[0] ^ v[v.length >> 1] ^ v[v.length - 1]) : '') + ';';
    if (sig === lastSig) return;
    lastSig = sig;
    await idbPut(game, { saved: Date.now(), files });
  }

  async function unpack(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('fetch ' + url + ': ' + resp.status);
    const total = +resp.headers.get('content-length') || 0;
    let loaded = 0;
    const counting = new TransformStream({
      transform(chunk, ctl) {
        loaded += chunk.length;
        status('正在下载游戏数据… ' + (loaded / 1048576).toFixed(1) + (total ? ' / ' + (total / 1048576).toFixed(1) : '') + ' MB');
        ctl.enqueue(chunk);
      },
    });
    const stream = resp.body.pipeThrough(counting).pipeThrough(new DecompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    const hlen = new DataView(buf.buffer).getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + hlen)));
    return { head, body: buf, off: 4 + hlen };
  }

  function start(opts) {
    if (bootPromise) return bootPromise;
    game = opts.game;
    bootPromise = (async () => {
      status('正在加载…');
      const base = opts.base || '';
      const [pkg, saved] = await Promise.all([unpack(base + 'mudlib.bin.gz'), idbGet(game).catch(() => null)]);
      status('正在启动游戏引擎…');
      M = await createFluffOS({
        locateFile: (f) => (opts.driverBase || '../driver/') + f,
        print: (s) => console.log('[mud]', s),
        printErr: (s) => console.log('[mud]', s),
        preRun: [(mod) => {
          const FS = mod.FS;
          mkdirp(FS, MOUNT);
          for (const d of pkg.head.dirs) FS.mkdir(MOUNT + '/' + d);
          let off = pkg.off;
          for (const [p, size] of pkg.head.files) {
            FS.writeFile(MOUNT + '/' + p, pkg.body.subarray(off, off + size));
            off += size;
          }
          mkdirp(FS, MOUNT + '/data');
          if (saved && saved.files) restore(FS, saved.files);
        }],
      });
      M.FS.chdir(MOUNT);
      M.fluffos = {
        onOutput: (id, bytes) => {
          const s = sockets.get(id);
          const copy = new Uint8Array(bytes).slice();
          if (s) s._recv(copy); else pendingOut.push([id, copy]);
        },
        onDisconnect: (id) => { const s = sockets.get(id); if (s) s._closed(); },
        handlers: {},
      };
      status('正在编译游戏世界（第一次会慢一些）…');
      await new Promise((r) => setTimeout(r, 30));
      const rc = M.ccall('fluffos_boot', 'number', ['string'], [opts.config]);
      if (rc !== 0) throw new Error('driver boot failed: ' + rc);
      const tick = () => {
        let d = 50;
        try { d = M.ccall('fluffos_tick', 'number', ['number'], [performance.now()]); }
        finally { setTimeout(tick, Math.min(Math.max(d || 1, 1), 100)); }
      };
      tick();
      lastSig = '';
      setInterval(() => sync().catch(console.error), SYNC_MS);
      document.addEventListener('visibilitychange', () => { if (document.hidden) sync().catch(console.error); });
      window.addEventListener('pagehide', () => { sync().catch(console.error); });
      status(null);
      waiting.splice(0).forEach((s) => s._open());
    })().catch((e) => { status('启动失败：' + e.message); throw e; });
    return bootPromise;
  }
  const pendingOut = [];

  class Socket {
    constructor() {
      this.readyState = 0;
      this.binaryType = 'arraybuffer';
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      if (M && bootPromise) setTimeout(() => this._open(), 0); else waiting.push(this);
    }
    _open() {
      let early = [];
      pendingOut.length = 0;
      this.id = M.ccall('fluffos_connect', 'number', [], []);
      early = pendingOut.splice(0).filter(([id]) => id === this.id);
      sockets.set(this.id, this);
      this.readyState = 1;
      if (this.onopen) this.onopen({});
      for (const [, b] of early) this._recv(b);
    }
    _recv(b) {
      // batch driver output and deliver it outside the wasm call stack:
      // the client may answer (telnet negotiation) and re-enter the driver
      (this._rq || (this._rq = [])).push(b);
      if (!this._rt) this._rt = setTimeout(() => this._flushRecv(), 0);
    }
    _flushRecv() {
      this._rt = 0;
      const q = this._rq; this._rq = [];
      let n = 0; for (const x of q) n += x.length;
      const b = new Uint8Array(n); n = 0; for (const x of q) { b.set(x, n); n += x.length; }
      if (this.readyState === 1) this._deliver(b);
    }
    _deliver(b) {
      if (DEBUG) {
        const o = []; for (let i = 0; i < b.length; i++) { if (b[i] === 255) { i += b[i + 1] >= 251 ? 2 : 1; continue; } o.push(b[i]); }
        const t = dbgDec.decode(new Uint8Array(o), { stream: true }).replace(/\x1b\[[0-9;]*m/g, '');
        if (t.trim()) console.log('[out] ' + t);
      }
      if (this.onmessage) this.onmessage({ data: b.buffer });
    }
    _closed() {
      if (this.readyState === 3) return;
      if (this._rt) { clearTimeout(this._rt); this._flushRecv(); }
      this.readyState = 3;
      sockets.delete(this.id);
      sync().catch(console.error);
      if (this.onclose) this.onclose({});
    }
    send(data) {
      if (this.readyState !== 1) return;
      const b = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data);
      (this._sq || (this._sq = [])).push(b);
      if (!this._st) this._st = setTimeout(() => {
        this._st = 0;
        const q = this._sq; this._sq = [];
        for (const x of q) if (this.readyState === 1) M.ccall('fluffos_input', null, ['number', 'array', 'number'], [this.id, x, x.length]);
        // persist shortly after player input (saves usually follow a command)
        clearTimeout(syncSoon); syncSoon = setTimeout(() => sync().catch(console.error), 2000);
      }, 0);
    }
    close() {
      if (this.readyState !== 1) return;
      M.ccall('fluffos_disconnect', null, ['number'], [this.id]);
      this._closed();
    }
  }
  Socket.OPEN = 1;

  async function exportSave() {
    await sync();
    const rec = await idbGet(game);
    if (!rec) { alert('还没有存档'); return; }
    const files = {};
    for (const [k, v] of Object.entries(rec.files)) files[k] = v ? btoa(Array.from(v, (c) => String.fromCharCode(c)).join('')) : null;
    const blob = new Blob([JSON.stringify({ game, saved: rec.saved, files })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = game + '-save-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  }
  async function importSave(file) {
    const j = JSON.parse(await file.text());
    if (j.game !== game && !confirm('这个存档属于 ' + j.game + '，仍然导入到 ' + game + '？')) return;
    const files = {};
    for (const [k, v] of Object.entries(j.files)) files[k] = v === null ? null : Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
    await idbPut(game, { saved: j.saved, files });
    location.reload();
  }
  async function resetSave() {
    if (!confirm('删除本浏览器里 ' + game + ' 的全部存档并重新开始？')) return;
    await idbPut(game, undefined);
    lastSig = 'x';
    M = null;
    location.reload();
  }

  // Grant (or revoke) wizard rights for a character id by editing adm/etc/wizlist.
  // Takes effect after the page reloads (the driver reads wizlist at boot).
  async function setWizard(id, level) {
    if (!M) { alert('游戏还没启动'); return; }
    if (id === undefined) {
      id = prompt('要设为巫师的角色 ID（英文账号）：');
      if (!id) return;
      level = prompt('巫师等级：admin / arch / wizard / apprentice / immortal，留空则取消巫师', 'admin');
      if (level === null) return;
    }
    id = String(id || '').trim().toLowerCase();
    level = String(level || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]*$/.test(id)) { alert('ID 只能是英文字母和数字'); return; }
    if (level && !['admin', 'arch', 'wizard', 'apprentice', 'immortal'].includes(level)) { alert('等级不对：' + level); return; }
    const path = MOUNT + '/adm/etc/wizlist';
    let lines = [];
    try { lines = new TextDecoder().decode(M.FS.readFile(path)).split('\n'); } catch (e) { /* none */ }
    lines = lines.filter((l) => l.trim() && l.split(/\s+/)[0] !== id);
    if (level) lines.push(id + ' (' + level + ')');
    M.FS.writeFile(path, new TextEncoder().encode(lines.join('\n') + '\n'));
    for (const s of sockets.values()) { try { M.ccall('fluffos_input', null, ['number', 'array', 'number'], [s.id, new TextEncoder().encode("save\n"), 5]); } catch (e) { /* ignore */ } }
    await new Promise((r) => setTimeout(r, 800));
    lastSig = 'x';
    await sync();
    alert(level ? id + ' 已设为巫师（' + level + '），页面将刷新后生效。' : id + ' 的巫师身份已取消，页面将刷新。');
    location.reload();
  }

  window.MudWasm = { start, Socket, exportSave, importSave, resetSave, sync, setWizard };
})();
