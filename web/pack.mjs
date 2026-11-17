// Pack a mudlib directory into one gzip'd blob that web/mudwasm.js unpacks
// into the wasm driver's in-memory filesystem.
//   format (before gzip): u32le headerLen | JSON {dirs:[...], files:[[path,size],...]} | file bytes...
// usage: node web/pack.mjs <mudlibdir> <out.bin.gz>
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node pack.mjs <mudlibdir> <out.bin.gz>'); process.exit(1); }
const dirs = [], files = [], bufs = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    if (e.name === '.git' || e.name === '.gitkeep' || e.name === '.DS_Store' || /^core\.\d+$/.test(e.name)) continue;
    const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { dirs.push(r); walk(p, r); }
    else if (e.isFile()) { const b = fs.readFileSync(p); files.push([r, b.length]); bufs.push(b); }
  }
})(src, '');
const header = Buffer.from(JSON.stringify({ dirs, files }));
const len = Buffer.alloc(4); len.writeUInt32LE(header.length);
const raw = Buffer.concat([len, header, ...bufs]);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(raw, { level: 9 }));
console.log(`${src}: ${dirs.length} dirs, ${files.length} files, ${(raw.length / 1048576).toFixed(1)}MB -> ${(fs.statSync(out).size / 1048576).toFixed(1)}MB gz`);
