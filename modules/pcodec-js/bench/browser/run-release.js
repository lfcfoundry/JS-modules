#!/usr/bin/env node
// Release benchmark: pcodec-js (all three files) against numcodecs-wasm-pco (converted with jco), in one real browser, fresh page per contender.
// Copyright (c) 2026 LFC Foundry. MIT License.
// One browser at a time: CHROMIUM=/path node run-release.js chromium out.json   (FIREFOX=... firefox, WEBKIT=1 webkit, WEBKIT=epiphany epiphany)
// Inputs (paths by env, defaults in brackets): COLS_DIR [./cols] holds cols.bin + cols.json (bench/dump.js writes them);
// NC_DIR [./nc] holds codec.js + codec.core*.wasm from `jco transpile codec.wasm --instantiation async` (numcodecs-wasm-pco 0.4.0);
// NODE_PATH must reach puppeteer-core for Chromium and Firefox. REPS (15) and ROUNDS (3) set the repeats.
'use strict';
const fs = require('fs'), path = require('path');
const mod = path.resolve(__dirname, '..', '..') + '/', COLS = process.env.COLS_DIR || path.resolve('cols'), NC = (process.env.NC_DIR || path.resolve('nc')) + '/';
const which = process.argv[2], outFile = process.argv[3] || 'res-' + which + '.json';
const inPage = require('./bench-page.js');
const man = JSON.parse(fs.readFileSync(COLS + '/cols.json')), bin = fs.readFileSync(COLS + '/cols.bin');
const PICK = [/NFM node x, Distances/, /links.to/, /links.weight/, /links.x1/, /events.ts/, /^temperature/, /^price/, /geojson/, /kWh/, /housing median_income/, /quakes Latitude/, /events.user/];
const cols = PICK.map((r) => man.find((m) => r.test(m.name)));
const fnv = (u8) => { let h = 2166136261 >>> 0; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
const read = (f) => fs.readFileSync(mod + f, 'utf8');
const libs = { readN: read('pcodec-js.js'), fastN: read('pcodec-js-fast.js'), packN: read('pcodec-js-pack.js') };
const ALL = JSON.parse(fs.readFileSync(__dirname + '/' + (process.env.CONTFILE || 'contenders.release.json'), 'utf8'));
const want = (process.env.CONTENDERS || '').split(',').filter(Boolean);
const contenders = ALL.filter((c) => c.type !== 'old' && (!want.length || want.includes(c.id)));
(async () => {
  // reference bytes: our packer at level 8, in Node (only to give the page something to unpack; the page checks every column against the original hash)
  const m = { exports: {} }; new Function('module', 'exports', libs.packN)(m, m.exports); const pk = await m.exports.load();
  const ref = cols.map((c) => { const T = c.kind === 'f64' ? Float64Array : Int32Array, a = new T(bin.buffer.slice(bin.byteOffset + c.off, bin.byteOffset + c.off + c.bytes)); return { name: c.name, kind: c.kind, n: c.n, hash: fnv(new Uint8Array(a.buffer)), packed: Buffer.from(pk.pack(a, { level: 8 })).toString('base64') }; });
  const arg = { wasm: {}, ref, contenders, libs, reps: +process.env.REPS || 15, rounds: +process.env.ROUNDS || 3 };
  if (contenders.some((c) => c.type === 'nc')) { arg.glue = fs.readFileSync(NC + 'codec.js', 'utf8'); arg.nc = {}; fs.readdirSync(NC).filter((f) => f.endsWith('.wasm')).forEach((f) => { arg.nc[f] = fs.readFileSync(NC + f).toString('base64'); }); }
  let pp = null; try { pp = require('puppeteer-core'); } catch (e) { /* webkit only */ }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b, newPage;
  if (which === 'webkit' || which === 'epiphany') { const wd = require(path.resolve(__dirname, '../../../../tests/webkit-shim.js')); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); newPage = () => b.newPage(); }
  else if (which === 'firefox') { b = await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 3600000, extraPrefsFirefox: { 'dom.max_script_run_time': 0 } }); newPage = () => b.newPage(); }
  else { b = await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 3600000, args: ['--no-sandbox', '--disable-gpu'] }); newPage = () => b.newPage(); }
  const version = await b.version(); console.log(version);
  const t0 = Date.now(), out = { results: [] };
  for (const c of contenders) {   // fresh page per contender, so one contender's memory cannot slow the next
    const p = await newPage(); await p.goto('about:blank');
    const o = await p.evaluate(inPage, Object.assign({}, arg, { contenders: [c] })); out.results.push(...o.results); out.ua = o.ua; out.values = o.values;
    if (which !== 'webkit' && which !== 'epiphany') await p.close(); else await sleep(200);
  }
  fs.writeFileSync(outFile, JSON.stringify({ version, wallSeconds: (Date.now() - t0) / 1000, out }, null, 1));
  console.log('wall s', ((Date.now() - t0) / 1000).toFixed(1));
  console.log('| contender | wasm B | glue B | start-up ms | unpack ms (12 columns) | ns/value | pack ms | packed total B | wrong | wasm MB |');
  out.results.forEach((r) => console.log(`| ${r.label} | ${r.wasmBytes} | ${r.glueBytes} | ${r.instantiateMs} | ${r.unpackMs} | ${r.unpackNsPerValue} | ${r.packMs ?? ''} | ${r.packedTotal ?? ''} | ${r.wrongColumns} | ${r.wasmMemoryMB} |`));
  await b.close(); process.exit(0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
