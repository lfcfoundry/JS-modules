#!/usr/bin/env node
// Runs one HTML page in one real browser and prints window.__res (JSON) when the page sets it. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/bench-page.js <chromium|firefox|webkit> page.html [out.json]     Env: CHROMIUM=/path, FIREFOX=/path, NODE_PATH with puppeteer-core, TIMEOUT (seconds, default 300)
// The page is served with the folders it needs from a tiny local server: /r/ is the repository root, /v/ is the folder named by VENDOR (fflate, papaparse). Pages may use `new Worker(URL.createObjectURL(blob))`.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], page = process.argv[3], outFile = process.argv[4], root = path.resolve(__dirname, '..');
if (!['chromium', 'firefox', 'webkit'].includes(which) || !page) { console.log('usage: node tests/bench-page.js <chromium|firefox|webkit> page.html [out.json]'); process.exit(2); }
const vendor = process.env.VENDOR || '', TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); let f = null;
  if (u.pathname === '/page.html') f = path.resolve(page); else if (u.pathname.startsWith('/r/')) f = path.join(root, u.pathname.slice(3)); else if (u.pathname.startsWith('/v/') && vendor) f = path.join(vendor, u.pathname.slice(3));
  if (!f || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.setHeader('cache-control', 'no-store'); r.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f));
});
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b;
  if (which === 'webkit') b = await require(root + '/tests/webkit-shim.js').launch('webkitgtk');
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 900000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 900000, args: ['--no-sandbox', '--disable-gpu'] }); }
  const version = await b.version(), p = await b.newPage(); await p.goto(base + "/page.html" + (process.env.QUERY || ""));
  let res = null; const end = Date.now() + 1000 * (+process.env.TIMEOUT || 300);
  while (!res && Date.now() < end) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(200); }
  if (!res) res = { error: 'no result in time' };
  res = Object.assign({ browser: version }, res); console.log(JSON.stringify(res, null, 1)); if (outFile) fs.writeFileSync(outFile, JSON.stringify(res, null, 1));
  await b.close(); server.close(); process.exit(res.error ? 1 : 0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
