#!/usr/bin/env node
// lzma-decode against LZMA-JS (npm `lzma` 2.3.2, decoder-only build): first decode of one stream in a fresh page, median of R pages (default 7), libraries taking turns. Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules> [PAGE=/path/to/a/big/html/file] CHROMIUM=... | FIREFOX=... | WEBKIT=1 node tests/compare/lzma-decode-compare-browser.js     Needs python3 (makes the stream with its lzma module). Exit 2 when it cannot run.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX || process.env.WEBKIT)) { console.log('skipped: needs LIBS and CHROMIUM, FIREFOX or WEBKIT=1'); process.exit(2); }
const P = require('./prep.js')(), pp = require(path.join(P.NM, 'puppeteer-core')), wd = require('../webkit-shim.js'), J = path.resolve(__dirname, '../../modules/lzma-decode/');
const page = process.env.PAGE || path.resolve(__dirname, '../../modules/lzma-decode/lzma-decode-with-wasm.js');   // any real file; a 700 KB single-file game page makes the README figures
const raw = fs.readFileSync(page), tmp = path.join(P.out, 'in.lzma');
cp.execFileSync('python3', ['-I', '-c', 'import lzma,sys;d=open(sys.argv[1],"rb").read();open(sys.argv[2],"wb").write(lzma.compress(d,format=lzma.FORMAT_ALONE,filters=[{"id":lzma.FILTER_LZMA1,"preset":9,"dict_size":1<<23,"lc":3,"lp":0,"pb":2}]))', page, tmp]);
const B64 = fs.readFileSync(tmp).toString('base64'), SIZE = raw.length;
const libs = { 'lzma-decode (wasm)': fs.readFileSync(J + '/lzma-decode-with-wasm.js', 'utf8'), 'lzma-decode (js only)': fs.readFileSync(J + '/lzma-decode.js', 'utf8'), 'LZMA-JS lzma-d 2.3.2': fs.readFileSync(path.join(P.NM, 'lzma/src/lzma-d.js'), 'utf8') };
const calls = { 'lzma-decode (wasm)': 'return lzmaDecodeFile(bytes,SIZE,{}).length', 'lzma-decode (js only)': 'return lzmaDecodeFile(bytes,SIZE,{}).length', 'LZMA-JS lzma-d 2.3.2': 'var o=LZMA.decompress(Array.from(bytes));return o.length' };   // LZMA-JS gives a string for text: its length is in characters
function sample(src, call, b64, SIZE) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  (0, eval)(src);
  return new Promise((res) => setTimeout(() => { const t = performance.now(); let n; try { n = new Function('bytes', 'SIZE', call)(bytes, SIZE); } catch (e) { return res({ err: String(e) }); } res({ ms: performance.now() - t, n }); }, 300));   // 300 ms: the wasm module compiles on another thread while the page sits idle, like a page after load
}
(async () => {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>x</title>'); }); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const R = +process.env.R || 7, names = Object.keys(libs);
  for (const [kind, exe] of [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter((x) => x[1])) {
    const b = kind === 'webkit' ? await wd.launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version() + '; input ' + SIZE + ' bytes, stream ' + Buffer.from(B64, 'base64').length + ' bytes'); const got = {};
    for (let k = 0; k < R; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) {
      const p = await b.newPage(); await p.goto('http://127.0.0.1:' + srv.address().port + '/');
      const r = await p.evaluate(sample, libs[n], calls[n], B64, SIZE);
      if (r.err) console.log('  ' + n + ': ' + r.err); else (got[n] = got[n] || []).push(r.ms);
      if (p.close) await p.close();
    }
    for (const n of names) { const a = (got[n] || []).sort((x, y) => x - y); console.log('  ' + n.padEnd(24) + (a.length ? 'median ' + a[a.length >> 1].toFixed(1) + ' ms (min ' + a[0].toFixed(1) + ', max ' + a[a.length - 1].toFixed(1) + ', n=' + a.length + ')' : 'failed')); }
    await b.close();
  }
  srv.close(); process.exit(0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
