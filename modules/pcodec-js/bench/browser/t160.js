// Copyright (c) 2026 LFC Foundry. MIT License.
// node t160.js <chromium|firefox|webkit|epiphany> <test[,test...]> [out.json]    (run from the bridge folder: it holds fx/ and out/)
// tests: unpack-steady unpack-cold sweep set startup workers park idle-a idle-b idle-none pool pack
// env: NCDIR + NCMJS (numcodecs-wasm-pco, 'comp' only), JSM_A (1.5.1 tree), JSM_B (1.6.0 tree), ROUNDS, PAGES, CHROMIUM, FIREFOX
'use strict';
const fs = require('fs'), path = require('path');
const which = process.argv[2], tests = (process.argv[3] || '').split(','), outFile = process.argv[4];
const JSM_A = process.env.JSM_A, JSM_B = process.env.JSM_B, S = require('./t160-inpage.js'), N = 4000000;
const rd = (r, f) => fs.readFileSync(path.join(r, 'modules/pcodec-js', f), 'utf8');
const libs = { A: { read: rd(JSM_A, 'pcodec-js.js'), fast: rd(JSM_A, 'pcodec-js-fast.js'), pack: rd(JSM_A, 'pcodec-js-pack.js') }, B: { read: rd(JSM_B, 'pcodec-js.js'), fast: rd(JSM_B, 'pcodec-js-fast.js'), pack: rd(JSM_B, 'pcodec-js-pack.js') } };
const b64 = (b) => Buffer.from(b).toString('base64');
const file = b64(fs.readFileSync('out/chromium/big_f64.pack.pco')), split = b64(fs.readFileSync('out/chromium/big_f64.pack-parts.pco'));
const man = JSON.parse(fs.readFileSync('fx/manifest.json'));
const TY = { f64: Float64Array, f32: Float32Array, i32: Int32Array, u32: Uint32Array, i64: BigInt64Array, u64: BigUint64Array, i16: Int16Array, u16: Uint16Array };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let PK = null; const packer = async () => PK || (PK = await require(path.join(JSM_B, 'modules/pcodec-js/pcodec-js-pack.js')).load());
const arrOf = (name) => { const m = man.find((x) => x.name === name), raw = fs.readFileSync(`fx/${name}.bin`); return new TY[m.kind](raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)); };
async function data() {
  const pk = await packer(), d = {};
  const big = arrOf('big_f64'); d.sweep = [];
  for (const n of [16384, 65536, 131072, 262144, 524288, 1048576, 2097152]) d.sweep.push({ n, b64: b64(pk.pack(big.subarray(0, n))) });
  d.set = man.filter((m) => !/^split_|^big_f64$|^one_|^tiny|^u32_/.test(m.name)).map((m) => ({ name: m.name, n: m.n, b64: b64(pk.pack(arrOf(m.name))) }));
  d.cols = man.filter((m) => m.n >= 50000 && m.n < 700000 && !/^split_/.test(m.name)).map((m) => b64(pk.pack(arrOf(m.name))));
  d.arrs = ['dec2_f64', 'noise_f64', 'mid_f64'].map((n) => ({ b64: b64(Buffer.from(arrOf(n).buffer)) }));
  return d;
}
(async () => {
  let b, newPage;
  if (which === 'webkit' || which === 'epiphany') { const wd = require(JSM_B + '/tests/webkit-shim.js'); b = await wd.launch(which); newPage = () => b.newPage(); }
  else {
    const pp = require('puppeteer-core');
    if (which === 'firefox') b = await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 3600000 });
    else b = await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 3600000, args: ['--no-sandbox', '--disable-gpu', '--enable-precise-memory-info'] });
    newPage = () => b.newPage();
  }
  const version = await b.version(); console.log('BROWSER', version);
  const isWK = which === 'webkit' || which === 'epiphany';
  const fresh = async () => { const p = await newPage(); await p.goto('about:blank'); return p; };
  const done = async (p) => { if (!isWK) await p.close(); else await sleep(100); };
  const R = { browser: version, tests: {} }, D = (tests.some((t) => /sweep|set|pool|pack|idle2|starts|comp/.test(t)) ? await data() : null), D2 = D && D.set;
  const rounds = +process.env.ROUNDS || 15, pages = +process.env.PAGES || 40, H = S.HELPERS;
  const one = async (fn, arg) => { const p = await fresh(); try { return await p.evaluate(fn, Object.assign({ helpers: H }, arg)); } finally { await done(p); } };
  for (const t of tests) {
    const t0 = Date.now(); let r;
    if (t === 'unpack-steady' || t === 'unpack-cold') r = await one(S.unpack, { libA: libs.A.read, libB: libs.B.read, file, n: N, rounds, cold: t === 'unpack-cold' });
    else if (t === 'sweep' || t === 'sweep-cold') r = await one(S.sweep, { libA: libs.A.read, libB: libs.B.read, files: D.sweep, rounds: Math.max(5, rounds >> 1), cold: t === 'sweep-cold' });
    else if (t === 'batches' || t === 'batches-cold') r = await one(S.batches, { libA: libs.A.read, libB: libs.B.read, file, n: N, rounds, cold: t === 'batches-cold', sizes: [8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576] });
    else if (t === 'phases' || t === 'phases-tight') r = await one(S.phases, { libA: libs.A.read, libB: libs.B.read, file, n: N, rounds, tick: t === 'phases' });
    else if (t === 'idle2') {
      const ts = ['dec2_f64', 'walk_i16', 'count_i32', 'sensor_f32'].map((nm) => D2.find((x) => x.name === nm).b64);
      r = {}; for (const [id, o] of [['none', { lib: libs.B.pack, pool: false }], ['A pool', { lib: libs.A.pack, pool: true }], ['B pool', { lib: libs.B.pack, pool: true }]]) { r[id] = []; for (let i = 0; i < (+process.env.IDLEPAGES || 6); i++) r[id].push(await one(S.idle2, Object.assign({ files: ts, window: +process.env.IDLEWIN || 3000, idleMs: +process.env.IDLEMS2 || 1000 }, o))); }
    } else if (t === 'starts') {
      const ts = ['dec2_f64', 'walk_i16', 'count_i32', 'sensor_f32'].map((nm) => D2.find((x) => x.name === nm).b64);
      r = { A: [], B: [] }; for (let i = 0; i < (+process.env.WPAGES || 15); i++) for (const k of (i % 2 ? ['B', 'A'] : ['A', 'B'])) r[k].push(await one(S.starts, { lib: libs[k].pack, files: ts }));
    } else if (t === 'comp') {
      const NC = process.env.NCDIR, glue = fs.readFileSync(NC + '/codec.js', 'utf8').replace(/^import .*$/gm, '').replace(/^"use components";/m, 'const stderr = { getStderr() { return {}; } }, error = { Error: class {} }, streams = { OutputStream: class {} }, random = { getRandomBytes(n) { const b = new Uint8Array(Number(n)); crypto.getRandomValues(b); return b; } }, log = () => {};'), core = b64(fs.readFileSync(NC + '/codec.core.wasm'));
      const ids = [['nc', null], ['A', libs.A.read], ['B', libs.B.read], ['Bview', libs.B.read], ['Binto', libs.B.read], ['Apk', libs.A.pack], ['Bpk', libs.B.pack]];
            let NCF = null; const ncFiles = async () => { if (NCF) return NCF; const M = await import(process.env.NCMJS), c = M.codec.Codec.fromConfig(JSON.stringify({ level: 8, mode: 'auto', delta: 'auto', paging: 'equal-pages-up-to', equal_pages_up_to: 262144 }));
        NCF = D.set.map((x) => { const a = arrOf(x.name), tag = man.find((m) => m.name === x.name).kind; return { name: x.name, n: x.n, b64: b64(c.encode({ data: { tag, val: a }, shape: Uint32Array.of(a.length) }).data.val) }; }); return NCF; };
      r = ids.map(() => []); const rounds = +process.env.CROUNDS || 3;
      for (let k = 0; k < rounds; k++) for (let j = 0; j < ids.length; j++) { const i = (j + k) % ids.length, [id, packLib] = ids[i]; r[i].push(await one(S.comp, { id, glue, core, lib: packLib, files: id === 'nc' ? await ncFiles() : D.set, arrs: D.arrs, reps: +process.env.CREPS || 15 })); }
      r = ids.map((x, i) => ({ id: x[0], runs: r[i] }));
    } else if (t === 'set') r = await one(S.set, { libA: libs.A.read, libB: libs.B.read, files: D.set, rounds });
    else if (t === 'pool') r = await one(S.pool, { libA: libs.A.pack, libB: libs.B.pack, split, file, cols: D.cols, n: N, rounds: Math.max(7, rounds >> 1) });
    else if (t === 'pack') r = await one(S.pack, { libA: libs.A.pack, libB: libs.B.pack, arrs: D.arrs, rounds });
    else if (t === 'startup') {   // fresh pages, versions and files taking turns
      r = {}; for (const f of ['read', 'fast', 'pack']) r[f] = { A: [], B: [] };
      for (let i = 0; i < pages; i++) for (const f of ['read', 'fast', 'pack']) for (const k of (i % 2 ? ['B', 'A'] : ['A', 'B'])) r[f][k].push(await one(S.startup, { lib: libs[k][f] }));
    } else if (t === 'workers') {
      r = { A: [], B: [] }; for (let i = 0; i < (+process.env.WPAGES || 15); i++) for (const k of (i % 2 ? ['B', 'A'] : ['A', 'B'])) r[k].push(await one(S.workers, { lib: libs[k].pack, file, split, n: N }));
    } else if (t === 'park') {
      r = []; for (let i = 0; i < (+process.env.PARKPAGES || 5); i++) r.push(await one(S.park, { lib: libs.B.pack, file, split, n: N, idleMs: +process.env.IDLEMS || 1000 }));
    } else if (t === 'idle') {
      r = {}; for (const [id, o] of [['none', { lib: libs.B.pack, pool: false }], ['A pool', { lib: libs.A.pack, pool: true }], ['B pool', { lib: libs.B.pack, pool: true }]]) { r[id] = []; for (let i = 0; i < 3; i++) r[id].push(await one(S.idle, Object.assign({ split, n: N, ms: 7000 }, o))); }
    } else { console.log('unknown test', t); continue; }
    R.tests[t] = r; console.log('done', t, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(R, null, 1));
  await b.close(); process.exit(0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
