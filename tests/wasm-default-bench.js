#!/usr/bin/env node
// "WebAssembly first" check for lzma-decode, ppmd-decode and walker-sim, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Each module has a plain file (JavaScript only) and a default file (WebAssembly first, JavaScript when it cannot). Every sample is a fresh page, so the first call is cold and the
// time of loading and compiling the WebAssembly module is counted; the two files take turns (plain first on one repeat, default first on the next). A second part loads the default file
// under a page policy WITHOUT 'wasm-unsafe-eval' and checks that it still gives the right bytes or counts, on the JavaScript path.
// Run: node tests/wasm-default-bench.js <chromium|firefox|webkit|epiphany> [out.json]
// Env: REPS (default 7), PAGE (the page to compress; default ../pineapple-defense/index.html), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two),
//      ONLY=regex on the module name (lzma, ppmd, walker). Node is not used for speed numbers; only the browsers are. Python 3 makes the test data (no packages).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), { execFileSync } = require('child_process');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit', 'epiphany'].includes(which)) { console.log('usage: node tests/wasm-default-bench.js <chromium|firefox|webkit|epiphany> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 7), ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const pageFile = process.env.PAGE || root + '../pineapple-defense/index.html';
if (!fs.existsSync(pageFile)) { console.log('skipped: no page to compress (set PAGE=/path/page.html)'); process.exit(2); }
const raw = fs.readFileSync(pageFile), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wasmdef-'));
const fnv = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0; return h; };

// ---- test data ----
const lz = execFileSync('python3', ['-c', "import sys,lzma;d=sys.stdin.buffer.read();f=[{'id':lzma.FILTER_LZMA1,'dict_size':1<<20,'lc':4,'lp':0,'pb':0,'preset':6}];sys.stdout.buffer.write(lzma.compress(d,format=lzma.FORMAT_RAW,filters=f)[1:])"], { input: raw, maxBuffer: 1 << 28 });
const p400 = raw.subarray(0, 400000); fs.writeFileSync(path.join(tmp, 'p.raw'), p400);
execFileSync('python3', [root + 'tools/ppmd-pack/ppmd7_encode.py', path.join(tmp, 'p.raw'), path.join(tmp, 'p.ppmd'), '6', String(16 << 20)], { stdio: 'ignore' });
const pp7 = fs.readFileSync(path.join(tmp, 'p.ppmd'));
const B64 = 'function b64(s){var t=atob(s),u=new Uint8Array(t.length),i;for(i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u;}function fnv(d){var h=2166136261,i;for(i=0;i<d.length;i++)h=Math.imul(h^d[i],16777619)>>>0;return h;}';
// the made-up network of the walker-sim README (start, 4 layers of 44, 23 ends), as in the module's own speed checks
const NET = 'function layered(S){var s=5;function r(){return (s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;}var links=[],L=4,W=44,K=23,back=0.03,deg0=3;' +
  'function id(l,i){return l<0?"start":l===L?"end"+i:"l"+l+"_"+i;}function size(l){return l<0?1:l===L?K:W;}' +
  'for(var l=-1;l<L;l++)for(var i=0;i<size(l);i++){var deg=l===-1?20:deg0+(r()<0.2?1:0)-(r()<0.05?1:0),seen={};' +
  'for(var d=0;d<deg;d++){var j=Math.floor(r()*size(l+1));if(seen[j])continue;seen[j]=1;links.push({from:id(l,i),to:id(l+1,j),weight:1+Math.floor(r()*5)});}' +
  'if(l>=1&&r()<back*8)links.push({from:id(l,i),to:id(Math.floor(r()*l),Math.floor(r()*W)),weight:1+Math.floor(r()*5)});}return S.graph({links:links,start:"start"});}';

const M = {
  lzma: { plain: 'modules/lzma-decode/lzma-decode.js', def: 'modules/lzma-decode/lzma-decode-with-wasm.js', data: 'window.D="' + lz.toString('base64') + '";',
    run: 'var z=b64(D);window.__t0=performance.now();', after: 'var o=lzmaDecode(z,' + raw.length + ',{lc:4,lp:0,pb:0});window.__res={ms:performance.now()-window.__t0,ok:fnv(o)===' + fnv(raw) + ',engine:lzmaDecode.engine||"js"};' },
  ppmd: { plain: 'modules/ppmd-decode/ppmd-decode.js', def: 'modules/ppmd-decode/ppmd-decode-with-wasm.js', data: 'window.D="' + pp7.toString('base64') + '";',
    run: 'var z=b64(D);window.__t0=performance.now();', after: 'var o=ppmd7Decode(z,' + p400.length + ',6,16<<20);window.__res={ms:performance.now()-window.__t0,ok:fnv(o)===' + fnv(p400) + ',engine:ppmd7Decode.engine||"js"};' },
  walker: { plain: 'modules/walker-sim/walker-sim.js', def: 'modules/walker-sim/walker-sim-with-wasm.js', data: NET,
    run: 'window.__t0=performance.now();', after: 'var P=layered(WalkerSim),sim=WalkerSim.create(P,{seed:7,trials:10000,rule:"weights",weights:P.w,arrivals:{dist:"fixed",a:100}});sim.run(1e9,1e9);' +
      'var sn=sim.snapshot();window.__res={ms:performance.now()-window.__t0,ok:sn.endpoints.map(function(e){return e.count}).join(",")===window.__want,engine:sim.engine,counts:sn.endpoints.map(function(e){return e.count}).join(",")};' }
};
// the counts the plain file gives are the reference for the walker case (the module's tests pin that the WebAssembly loop gives the same counts)
if (fs.existsSync(root + M.walker.def) && (!ONLY || ONLY.test('walker'))) { const S = require(root + M.walker.plain), P = (new Function('S', NET + ';return layered(S);'))(S), sim = S.create(P, { seed: 7, trials: 10000, rule: 'weights', weights: P.w, arrivals: { dist: 'fixed', a: 100 } }); sim.run(1e9, 1e9);
  M.walker.want = sim.snapshot().endpoints.map((e) => e.count).join(','); }

const CSP_WASM = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", CSP_NOWASM = "default-src 'none'; script-src 'self' 'unsafe-inline'";
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'), m = M[u.searchParams.get('m')];
  r.setHeader('cache-control', 'no-store');
  if (u.pathname === '/data.js') { r.setHeader('content-type', 'text/javascript'); return r.end(m.data + (m.want ? 'window.__want="' + m.want + '";' : '')); }
  if (u.pathname !== '/page.html' || !m) { r.writeHead(404); return r.end(); }
  const src = fs.readFileSync(root + (u.searchParams.get('v') === 'plain' ? m.plain : m.def), 'utf8'), csp = u.searchParams.get('csp') === 'nowasm' ? CSP_NOWASM : CSP_WASM;
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + csp + '"><title>t</title><link rel="icon" href="data:,"><script src="/data.js?m=' + u.searchParams.get('m') + '"></script>' +
    '<script>' + B64 + m.run + '</script><script>' + src.replace(/<\/script/gi, '<\\/script') + '</script><script>try{' + m.after + '}catch(e){window.__res={error:String(e&&e.message||e)}}</script>');
});
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b, newPage;
  if (which === 'webkit' || which === 'epiphany') { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); newPage = () => b.newPage(); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] });
    newPage = () => b.newPage(); }
  const version = await b.version(); console.log(version);
  async function sample(m, v, csp) {
    const p = await newPage(); await p.goto(base + '/page.html?m=' + m + '&v=' + v + (csp ? '&csp=' + csp : ''));
    let res = null; for (let i = 0; i < 600 && !res; i++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(50); }
    if (which !== 'webkit' && which !== 'epiphany') await p.close();
    return res || { error: 'no result in 30 s' };
  }
  const names = Object.keys(M).filter((n) => fs.existsSync(root + M[n].def) && (!ONLY || ONLY.test(n))), out = { version, reps: REPS, page: path.basename(path.dirname(path.resolve(pageFile))), cases: {}, blocked: {} };
  for (const n of names) out.cases[n] = { plain: [], def: [], engines: { plain: null, def: null }, ok: true };
  for (let rep = 0; rep < REPS; rep++) { for (const n of names) {
    for (const v of rep % 2 ? ['def', 'plain'] : ['plain', 'def']) { const r = await sample(n, v); const c = out.cases[n]; if (r.error || !r.ok) { c.ok = false; c.error = r.error || 'wrong result'; } else { c[v].push(r.ms); c.engines[v] = r.engine; } }
  } process.stdout.write('.'); }
  console.log('');
  for (const n of names) { const r = await sample(n, 'def', 'nowasm'); out.blocked[n] = { ok: !r.error && !!r.ok, engine: r.engine || null, error: r.error || null }; }
  for (const n of names) { const c = out.cases[n]; c.medianPlain = c.plain.length ? med(c.plain) : null; c.medianDef = c.def.length ? med(c.def) : null; }
  console.log('case     plain (ms)   default (ms)   speed-up (higher is better)   default engine   blocked page: engine / right result');
  for (const n of names) { const c = out.cases[n], bl = out.blocked[n];
    console.log(n.padEnd(8) + String(c.medianPlain == null ? '-' : c.medianPlain.toFixed(1)).padStart(11) + String(c.medianDef == null ? '-' : c.medianDef.toFixed(1)).padStart(15) + String(c.medianPlain && c.medianDef ? (c.medianPlain / c.medianDef).toFixed(2) + 'x' : '-').padStart(18) +
      '   ' + String(c.engines.def).padEnd(14) + '   ' + bl.engine + ' / ' + (bl.ok ? 'yes' : 'NO ' + (bl.error || '')) + (c.ok ? '' : '   FAILED: ' + c.error)); }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close();
  process.exit(names.every((n) => out.cases[n].ok && out.blocked[n].ok && out.blocked[n].engine === 'js' && out.cases[n].engines.def === 'wasm') ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
