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
const arg = { wasm, ref, contenders, reps: +process.env.REPS || 7, rounds: +process.env.ROUNDS || 2 };
arg.libs = { pack0: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-pack-old.js', 'utf8'), read0: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-sizebuilt.js', 'utf8'), read: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js.js', 'utf8'), fast: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-fast.js', 'utf8'), pack: fs.readFileSync('/tmp/claude-0/pcm/mod/out/pcodec-js-pack.js', 'utf8') };
if (contenders.some((c) => c.type === 'nc')) { arg.glue = fs.readFileSync(NC + 'codec.js', 'utf8'); arg.nc = {}; fs.readdirSync(NC).filter((f) => f.endsWith('.wasm')).forEach((f) => arg.nc[f] = fs.readFileSync(NC + f).toString('base64')); }
(async () => {
  const which = process.argv[2], D = await require('/home/claude/net-flow-map/bench/driver.js').open(which, { timeout: 3600000 }); await D.goto('about:blank');
  const t0 = Date.now(); const out = { results: [] };   // every contender gets a fresh page, so one contender's memory and garbage cannot slow the next
  for (const c of contenders) { await D.goto('about:blank'); const o = await D.page.evaluate(inPage, Object.assign({}, arg, { contenders: [c] })); out.results.push(...o.results); out.ua = o.ua; out.values = o.values; }
  const version = D.version; await D.close();
  const file = process.argv[3] || W + '/browser/res-' + which + '.json';
  fs.writeFileSync(file, JSON.stringify({ version, wallSeconds: (Date.now() - t0) / 1000, out }, null, 1));
  console.log(version, 'wall s', ((Date.now() - t0) / 1000).toFixed(1)); console.log('| contender | wasm | glue | compile ms | instantiate ms | unpack ms (all 12 columns) | ns/value | pack ms | packed total | wrong | wasm mem MB |');
  out.results.forEach((r) => console.log(`| ${r.label} | ${r.wasmBytes} | ${r.glueBytes} | ${r.compileMs} | ${r.instantiateMs} | ${r.unpackMs} | ${r.unpackNsPerValue} | ${r.packMs ?? ''} | ${r.packedTotal ?? ''} | ${r.wrongColumns} | ${r.wasmMemoryMB} |`));
  process.exit(0);
})();
