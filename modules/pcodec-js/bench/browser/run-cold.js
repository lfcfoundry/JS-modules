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
const coldPage = async function (arg) {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const TA = { f64: Float64Array, i32: Int32Array }, KB = { f64: 6, i32: 3 };
  const cols = arg.ref.map((r) => ({ ...r, packed: b64(r.packed) }));
  const s = arg.contenders[0];
  let t = performance.now(); const mod = await WebAssembly.compile(b64(arg.wasm[s.wasm])); const compileMs = performance.now() - t;
  t = performance.now(); const ex = (await WebAssembly.instantiate(mod, {})).exports; const instMs = performance.now() - t;
  let last = null, TW = 0; const PASSW = [];
  const dec = (kind, b, n) => { if (last) { ex.release(...last); last = null; } const T = TA[kind], w = T.BYTES_PER_ELEMENT, p = ex.alloc(b.length); new Uint8Array(ex.memory.buffer, p, b.length).set(b); const d = ex.alloc(n * w); const tq = performance.now(); const r = ex.decompress(KB[kind], p, b.length, d, n); TW += performance.now() - tq; ex.release(p, b.length); if (r < 0) throw new Error('decode ' + r); last = [d, n * w]; return new T(ex.memory.buffer, d, n); };
  const sel = cols.filter((c) => !arg.only || new RegExp(arg.only).test(c.name)); const pass = () => { TW = 0; const t0 = performance.now(); for (let i = 0; i < sel.length; i++) dec(sel[i].kind, sel[i].packed, sel[i].n); const tot = performance.now() - t0; PASSW.push(+TW.toFixed(1)); return tot; };
  if (arg.warmMs) { const wi = arg.warmItems.map((w) => ({ ...w, packed: b64(w.packed) })); const e0 = performance.now() + arg.warmMs; do { for (const w of wi) dec(w.kind, w.packed, w.n); } while (performance.now() < e0); }
  if (arg.idleMs) await new Promise((r) => setTimeout(r, arg.idleMs));
  const first = []; for (let i = 0; i < arg.cold; i++) first.push(+pass().toFixed(2));
  const e = performance.now() + (arg.settleMs || 400); while (performance.now() < e) pass();
  const st = []; for (let i = 0; i < 25; i++) st.push(pass()); st.sort((a, b) => a - b);
  const total = sel.reduce((x, c) => x + c.n, 0);
  return { id: s.id, label: s.label, compileMs: +compileMs.toFixed(1), instMs: +instMs.toFixed(1), firstPassesMs: first, steadyMs: +st[12].toFixed(2), wasmOnly: PASSW.slice(0, arg.cold), values: total };
};
(async () => {
  const which = process.argv[2], D = await require('/home/claude/net-flow-map/bench/driver.js').open(which, { timeout: 3600000 });
  const out = []; for (const c of contenders) { await D.goto('about:blank'); out.push(await D.page.evaluate(coldPage, Object.assign({}, arg, { contenders: [c], cold: +process.env.COLD || 6, warmMs: +process.env.WARM || 0, only: process.env.ONLY || '', idleMs: +process.env.IDLE || 0 }))); }
  const version = D.version; await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, out }, null, 1));
  console.log(version); out.forEach((r) => console.log(r.label.padEnd(30), 'compile', r.compileMs, 'inst', r.instMs, 'first passes', r.firstPassesMs.join(' '), 'wasm-only', r.wasmOnly.join(' '), 'steady', r.steadyMs, 'ms for', r.values, 'values'));
  process.exit(0);
})();
