#!/usr/bin/env node
// Packed pages with WebAssembly first (the default of lzma-pack and ppmd-pack) against --no-wasm, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Each packed page records when its unpacked page starts (window.__t, milliseconds since the navigation began) and how many WebAssembly instances it made (window.__w).
// Every sample is a fresh page; the variants take turns; median of REPS. A last page per packer has the 'wasm-unsafe-eval' word cut out of its policy and must still open
// (JavaScript decoder, no WebAssembly instance; WebKitGTK and GNOME Web do not refuse WebAssembly without the word, so there it only has to open).
// Run: node tests/pack-default-browser.js <chromium|firefox|webkit> [out.json]
// Env: REPS (default 7), PAGE (the page to pack; default ../pineapple-defense/index.html), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two). Python 3 packs the pages.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), { execFileSync } = require('child_process');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit'].includes(which)) { console.log('usage: node tests/pack-default-browser.js <chromium|firefox|webkit> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 7), pageFile = process.env.PAGE || root + '../pineapple-defense/index.html';
if (!fs.existsSync(pageFile)) { console.log('skipped: no page to pack (set PAGE=/path/page.html)'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'packdef-'));
const COUNT = '<script>(function(){var I=window.WebAssembly&&WebAssembly.Instance;if(I)WebAssembly.Instance=function(m,i){window.__w=(window.__w||0)+1;return new I(m,i)}})()</script>';
const CSP = '<meta http-equiv="Content-Security-Policy" content="script-src \'unsafe-inline\'">';
let t = fs.readFileSync(pageFile, 'utf8');
const mark = '<script>window.__t=performance.now()</script>';
t = /<head[^>]*>/i.test(t) ? t.replace(/<head[^>]*>/i, (m) => m + mark) : t.replace(/^(<!doctype[^>]*>)?/i, (m) => m + mark);
const src = path.join(tmp, 'in.html'); fs.writeFileSync(src, t);
const pages = {}, sizes = {};
function pk(name, tool, args, strip) {
  const out = path.join(tmp, name + '.html');
  execFileSync('python3', [root + 'tools/' + tool + '-pack/pack.py', src, out, '--title', 'x', '--skip-node-check', '--head', COUNT].concat(args), { stdio: ['ignore', 'ignore', 'inherit'] });
  if (strip) fs.writeFileSync(out, fs.readFileSync(out, 'latin1').replace(" 'wasm-unsafe-eval'", ''), 'latin1');     // the packer adds the word to every policy; cut it out again
  pages[name] = out; sizes[name] = fs.statSync(out).size;
}
for (const tool of ['lzma', 'ppmd']) { pk(tool + '-default', tool, []); pk(tool + '-nowasm', tool, ['--no-wasm']); }
for (const tool of ['lzma', 'ppmd']) { const out = path.join(tmp, tool + '-blocked.html'); execFileSync('python3', [root + 'tools/' + tool + '-pack/pack.py', src, out, '--title', 'x', '--skip-node-check', '--head', CSP + COUNT], { stdio: ['ignore', 'ignore', 'inherit'] });
  fs.writeFileSync(out, fs.readFileSync(out, 'latin1').replace(" 'wasm-unsafe-eval'", ''), 'latin1'); pages[tool + '-blocked'] = out; sizes[tool + '-blocked'] = fs.statSync(out).size; }
const server = http.createServer((q, r) => { const f = pages[new URL(q.url, 'http://x').pathname.slice(1)]; if (!f) { r.writeHead(404); return r.end(); } r.setHeader('cache-control', 'no-store'); r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(f)); });
const webkitFamily = which === 'webkit';
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b, newPage;
  if (which === 'webkit') { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch('webkitgtk'); newPage = () => b.newPage(); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] });
    newPage = () => b.newPage(); }
  const version = await b.version(); console.log(version);
  async function sample(name) {
    const p = await newPage(); await p.goto(base + '/' + name);
    let r = null; for (let i = 0; i < 400 && !r; i++) { r = await p.evaluate(() => (window.__t === undefined ? null : { t: window.__t, w: window.__w || 0 })); if (!r) await sleep(50); }
    if (which !== 'webkit') await p.close();
    return r || { t: null, w: 0 };
  }
  const out = { version, reps: REPS, page: path.basename(path.dirname(path.resolve(pageFile))), input: fs.statSync(pageFile).size, sizes, runs: {} };
  for (const k of Object.keys(pages)) out.runs[k] = { t: [], w: [] };
  for (let rep = 0; rep < REPS; rep++) {
    for (const tool of ['lzma', 'ppmd']) for (const v of rep % 2 ? ['nowasm', 'default'] : ['default', 'nowasm']) { const r = await sample(tool + '-' + v); if (r.t !== null) { out.runs[tool + '-' + v].t.push(r.t); out.runs[tool + '-' + v].w.push(r.w); } }
    process.stdout.write('.');
  }
  for (const tool of ['lzma', 'ppmd']) { const r = await sample(tool + '-blocked'); if (r.t !== null) { out.runs[tool + '-blocked'].t.push(r.t); out.runs[tool + '-blocked'].w.push(r.w); } }
  console.log('');
  let ok = true;
  console.log('packer   page size no-wasm / default (bytes)   open time no-wasm / default (ms)   times faster (higher is better)   default used wasm   blocked page: opened, wasm instances');
  for (const tool of ['lzma', 'ppmd']) {
    const n = out.runs[tool + '-nowasm'], d = out.runs[tool + '-default'], bl = out.runs[tool + '-blocked'];
    const mn = n.t.length ? med(n.t) : null, md = d.t.length ? med(d.t) : null, usedWasm = d.w.length > 0 && d.w.every((x) => x >= 1), blockedOk = bl.t.length === 1 && n.w.every((x) => x === 0) && (webkitFamily || bl.w[0] === 0);     // WebKitGTK and GNOME Web do not refuse WebAssembly without the policy word, so there only "opened" counts
    out[tool] = { medianNoWasm: mn, medianDefault: md, usedWasm, blockedOk }; ok = ok && usedWasm && blockedOk && mn !== null && md !== null;
    console.log(tool.padEnd(8) + (sizes[tool + '-nowasm'] + ' / ' + sizes[tool + '-default']).padEnd(38) + ((mn && mn.toFixed(1)) + ' / ' + (md && md.toFixed(1))).padEnd(36) + ((mn && md) ? (mn / md).toFixed(2) + 'x' : '-').padEnd(34) + String(usedWasm).padEnd(20) + (blockedOk ? 'yes, ' + bl.w[0] : 'NO'));
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
