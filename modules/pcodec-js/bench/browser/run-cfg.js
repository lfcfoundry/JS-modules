// node run-browser.js firefox|chromium|webkit|epiphany [out.json]   (set CONTENDERS to a comma list to run fewer)
'use strict';
const fs = require('fs'), path = require('path'), W = path.resolve(__dirname, '..');
process.env.NFM_PUPPETEER = process.env.NFM_PUPPETEER || '/tmp/esb/node_modules/puppeteer-core';
process.env.NFM_PLAYWRIGHT = process.env.NFM_PLAYWRIGHT || '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = process.env.NFM_FIREFOX || '/home/claude/browsers/firefox/firefox';
process.env.NFM_CHROME = process.env.NFM_CHROME || '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const inPage = require('./bench-page.js');
const man = JSON.parse(fs.readFileSync(W + '/cols.json')), bin = fs.readFileSync(W + '/cols.bin');
const PICK = [/NFM node x, Distances/, /links.to/, /links.weight/, /links.x1/, /events.ts/, /^temperature/, /^price/, /geojson/, /kWh/, /housing median_income/, /quakes Latitude/, /events.user/];
const cols = PICK.map((r) => man.find((m) => r.test(m.name)));
const wasmDir = process.env.WASMDIR || W + '/wasm/';
const wasm = {}; const need = new Set(['ours-1.0']);
const ALL = JSON.parse(fs.readFileSync(__dirname + '/' + (process.env.CONTFILE || 'contenders.json'), 'utf8'));
const want = (process.env.CONTENDERS || '').split(',').filter(Boolean);
const contenders = ALL.filter((c) => !want.length || want.includes(c.id));
contenders.forEach((c) => c.wasm && need.add(c.wasm));
need.forEach((id) => { wasm[id === 'ours-1.0' ? 'ours' : id] = fs.readFileSync(wasmDir + id + '.wasm').toString('base64'); });
contenders.forEach((c) => { if (c.wasm === 'ours-1.0') c.wasm = 'ours'; });
// reference bytes from the 'ours today' wasm in Node
const ours = (() => { const ex = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(W + '/wasm/ours-1.0.wasm')), {}).exports; return ex; })();
function pack(kind, arr) { const src = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), p = ours.mem_alloc(src.length); new Uint8Array(ours.memory.buffer, p, src.length).set(src); const n = ours.compress(kind === 'f64' ? 0 : 2, p, arr.length, 8); ours.mem_free(p, src.length); return Buffer.from(new Uint8Array(ours.memory.buffer, ours.out_ptr(), n)); }
const fnv = (u8) => { let h = 2166136261 >>> 0; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
const ref = cols.map((m) => { const T = m.kind === 'f64' ? Float64Array : Int32Array, a = new T(bin.buffer.slice(bin.byteOffset + m.off, bin.byteOffset + m.off + m.bytes)); return { name: m.name, kind: m.kind, n: m.n, hash: fnv(new Uint8Array(a.buffer)), packed: pack(m.kind, a).toString('base64') }; });
const NC = '/tmp/claude-0/pcm/jco/outa/';
const warmItems = cols_all_for_warm();
function cols_all_for_warm() { return man.filter((m) => /links.to|temperature|events.user|links.x1/.test(m.name)).map((m) => { const T = m.kind === 'f64' ? Float64Array : Int32Array, a = new T(bin.buffer.slice(bin.byteOffset + m.off, bin.byteOffset + m.off + 20000 * T.BYTES_PER_ELEMENT)); return { kind: m.kind, n: 20000, packed: pack(m.kind, a).toString('base64') }; }); }
const arg = {warmItems,  wasm, ref, contenders, reps: +process.env.REPS || 7, rounds: +process.env.ROUNDS || 2 };
arg.libs = { read0: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-sizebuilt.js', 'utf8'), read: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js.js', 'utf8'), fast: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-fast.js', 'utf8'), pack: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-pack.js', 'utf8') };

const cfgPage = async function (arg) {
  const b64 = (x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
  const TA = { f64: Float64Array, i32: Int32Array }, KB = { f64: 6, i32: 3 };
  const cols = arg.ref.map((r) => ({ ...r, packed: b64(r.packed) }));
  const mod = await WebAssembly.compile(b64(arg.wasm['pack-full.opt'])); const ex = (await WebAssembly.instantiate(mod, {})).exports;
  const put = (u8) => { const p = ex.alloc(u8.length); new Uint8Array(ex.memory.buffer, p, u8.length).set(u8); return p; };
  let last = null;
  const dec = (kind, b, n) => { if (last) { ex.release(...last); last = null; } const T = TA[kind], w = T.BYTES_PER_ELEMENT, p = put(b), d = ex.alloc(n * w); const r = ex.decompress(KB[kind], p, b.length, d, n); ex.release(p, b.length); if (r < 0) throw new Error('decode ' + r); last = [d, n * w]; return new T(ex.memory.buffer, d, n); };
  const raw = cols.map((c) => dec(c.kind, c.packed, c.n).slice());
  const enc = (i, level, mode, a, delta, order) => { const src = new Uint8Array(raw[i].buffer, raw[i].byteOffset, raw[i].byteLength), p = put(src); const n = ex.compress_cfg(KB[cols[i].kind], p, raw[i].length, level, mode, a, delta, order); ex.release(p, src.length); if (n < 0) throw new Error('enc ' + n); const o = new Uint8Array(ex.memory.buffer, ex.out_ptr(), n).slice(); ex.out_release(); return o; };
  const med = (f, k) => { const e = performance.now() + 200; do f(); while (performance.now() < e); const t = []; for (let i = 0; i < k; i++) { const s = performance.now(); f(); t.push(performance.now() - s); } t.sort((x, y) => x - y); return t[k >> 1]; };
  const total = cols.reduce((x, c) => x + c.n, 0), out = [];
  for (const c of arg.cfgs) {
    let packs = []; const one = () => { packs = []; for (let i = 0; i < cols.length; i++) packs.push(enc(i, c.level, c.mode, c.arg || 0, c.delta, c.order || 0)); }; const pt = med(one, c.level >= 10 ? 3 : 7); one();
    const bytes = packs.reduce((x, p) => x + p.length, 0);
    let bad = 0; for (let i = 0; i < cols.length; i++) { const d = dec(cols[i].kind, packs[i], cols[i].n); const o = raw[i]; const u = new Uint8Array(d.buffer, d.byteOffset, d.byteLength), v = new Uint8Array(o.buffer, o.byteOffset, o.byteLength); for (let k = 0; k < u.length; k++) if (u[k] !== v[k]) { bad++; break; } }
    const um = med(() => { for (let i = 0; i < cols.length; i++) dec(cols[i].kind, packs[i], cols[i].n); }, 9);
    out.push({ name: c.name, bytes, packMs: +pt.toFixed(1), unpackNs: +(um * 1e6 / total).toFixed(2), bad });
  }
  return out;
};
(async () => {
  const which = process.argv[2], D = await require('/home/claude/net-flow-map/bench/driver.js').open(which, { timeout: 3600000 });
  await D.goto('about:blank');
  const cfgs = JSON.parse(fs.readFileSync(__dirname + '/cfgs.json', 'utf8'));
  arg.wasm['pack-full.opt'] = fs.readFileSync(W + '/wasm/pack-s2.wOs.wasm').toString('base64'); const out = await D.page.evaluate(cfgPage, Object.assign({}, arg, { cfgs }));
  const version = D.version; await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, out }, null, 1));
  console.log(version); out.forEach((r) => console.log(r.name.padEnd(34), String(r.bytes).padStart(9), 'B  pack', String(r.packMs).padStart(7), 'ms  unpack', String(r.unpackNs).padStart(6), 'ns/value  bad', r.bad));
  process.exit(0);
})();
