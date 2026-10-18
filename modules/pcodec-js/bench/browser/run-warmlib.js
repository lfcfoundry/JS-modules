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

const libPage = async function (arg) {
  const b64 = (x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
  const TA = { f64: Float64Array, i32: Int32Array };
  const sel = arg.ref.filter((c) => new RegExp(arg.only).test(c.name)).map((r) => ({ ...r, packed: b64(r.packed) }));
  const m = { exports: {} }; new Function('module', 'exports', arg.lib)(m, m.exports);
  const t0 = performance.now(); const pc = await m.exports.load(arg.warm ? { warm: arg.warm === true ? true : arg.warm } : undefined); const loadMs = performance.now() - t0;
  if (arg.idleMs) await new Promise((r) => setTimeout(r, arg.idleMs));
  const one = () => { const s = performance.now(); for (const c of sel) pc.unpack(c.packed, { count: c.n, view: true }); return performance.now() - s; };
  const first = []; for (let i = 0; i < 4; i++) first.push(+one().toFixed(1));
  return { loadMs: +loadMs.toFixed(1), first };
};
(async () => {
  const which = process.argv[2], drv = require('/home/claude/net-flow-map/bench/driver.js'); let D = null, version = '';
  const lib = fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-warm.js', 'utf8'); const rows = [];
  const cfgs = JSON.parse(process.env.CFGS);
  for (const c of cfgs) { const runs = []; for (let t = 0; t < (+process.env.TRIALS || 3); t++) { D = await drv.open(which, { timeout: 3600000 }); await D.goto('about:blank'); version = D.version; runs.push(await D.page.evaluate(libPage, Object.assign({}, arg, { lib, only: process.env.ONLY, warm: c.warm, idleMs: c.idle }))); await D.close(); } rows.push({ cfg: c, runs }); }
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, rows }, null, 1));
  console.log(version); rows.forEach((r) => { const f = r.runs.map((x) => x.first[0]).sort((a, b) => a - b); console.log(JSON.stringify(r.cfg).padEnd(26), 'first unpack ms per trial:', r.runs.map((x) => x.first.join('/')).join('  '), ' median first:', f[f.length >> 1]); });
  process.exit(0);
})();
