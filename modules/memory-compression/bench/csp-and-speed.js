#!/usr/bin/env node
// Two real-browser checks for one release, in one browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
//  1. Blocked-eval errors: a page whose <meta> policy allows only 'self' and 'wasm-unsafe-eval' loads the module; the page counts the security-policy violations (and, where the driver shows them, the console and page errors that mention eval) the browser reports
//     (the "blocked eval" message in the console is one of them), then packs, unpacks and opens a short view with the plain loops to prove the fallback works. Old file and new file, 5 loads each.
//  2. Speed of the hot path: 60,000 links packed and unpacked with the old and the new file taking turns (9 rounds, no policy), so a slow-down of the common path would show.
// "control" is a page that only calls new Function: it proves the browser reports a blocked eval at all (the count must be 1 there for the other counts to mean anything).
// Run: node bench/csp-and-speed.js <chromium|firefox|webkit|epiphany> <old-file.js> <new-file.js> [out.json]
// Env: CHROMIUM=/path, FIREFOX=/path (needs puppeteer-core on NODE_PATH); WebKitGTK / GNOME Web go through tests/webkit-shim.js and need xvfb-run. Prints the browser version on line 1.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], oldFile = path.resolve(process.argv[3]), newFile = path.resolve(process.argv[4]), outFile = process.argv[5];
const D = require('../test/data.js'), links = JSON.stringify(D.sets['nfm-links'](60000));
const files = {
  '/old.js': [fs.readFileSync(oldFile), 'text/javascript'], '/new.js': [fs.readFileSync(newFile), 'text/javascript'], '/data.json': [Buffer.from(links), 'application/json'],
  '/pre.js': [Buffer.from("window.__v=[];document.addEventListener('securitypolicyviolation',function(e){if(/script-src/.test(e.violatedDirective))window.__v.push(e.violatedDirective+' '+e.blockedURI);});"), 'text/javascript'],
  '/check.js': [Buffer.from(`(function(){var J=window.MemoryCompression.jso,rows=[],i,ok=true,msg='';
    for(i=0;i<500;i++)rows.push({id:i,w:i%7,kind:i%2?undefined:'a'+(i%5)});
    try{var p=J.pack(rows),u=J.unpack(p);ok=JSON.stringify(u.slice(0,3))===JSON.stringify(rows.slice(0,3))&&u.length===500;}catch(e){ok=false;msg=String(e.message||e);}
    try{var sv=J.view(J.pack(rows.slice(0,5))).get(1);ok=ok&&sv.id===1;}catch(e){msg+=' short view: '+(e.message||e);}
    setTimeout(function(){window.__res={violations:window.__v.slice(),ok:ok,msg:msg};},400);})();   // the browser reports a violation a moment later`), 'text/javascript'],
  '/control.js': [Buffer.from("try{new Function('return 1')}catch(e){}window.MemoryCompression={jso:{pack:function(){return 0},unpack:function(){return []},view:function(){return {get:function(){return {id:1}}}}}};"), 'text/javascript'],
  '/csp.html': [null, 'text/html'], '/speed.html': [null, 'text/html']
};
const csp = (v) => `<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'"><title>wait</title><script src="/pre.js"></script><script src="/${v}.js"></script><script src="/check.js"></script>`;
const speedHtml = `<!doctype html><meta charset=utf-8><title>wait</title><script>
window.runSpeed=async function(rounds){
  var data=await (await fetch('/data.json')).json(), mods={};
  for(const v of ['old','new']){var t=await (await fetch('/'+v+'.js')).text(),m={exports:{}};new Function('module','exports',t)(m,m.exports);mods[v]=m.exports.jso;}
  var res={old:{pack:[],unpack:[]},new:{pack:[],unpack:[]}},bytes={};
  for(var r=0;r<rounds+1;r++){ for(const v of (r%2?['old','new']:['new','old'])){ var J=mods[v],t0=performance.now(),p=J.pack(data),t1=performance.now(),u=J.unpack(p),t2=performance.now();
      if(r>0){res[v].pack.push(t1-t0);res[v].unpack.push(t2-t1);} bytes[v]=p.length; if(u.length!==data.length)throw new Error('wrong length'); } }
  var med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];};
  return {bytes:bytes,old:{pack:med(res.old.pack),unpack:med(res.old.unpack)},new:{pack:med(res.new.pack),unpack:med(res.new.unpack)}};
};</script>`;
files['/csp.html'][0] = null;
const server = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/csp.html') { r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); return r.end(csp(new URL(q.url, 'http://x').searchParams.get('v') || 'new')); }
  if (u === '/speed.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(speedHtml); }
  const f = files[u]; if (!f) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f[1], 'cache-control': 'no-store' }); r.end(f[0]);
});
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port;
  let b, newPage; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (which === 'webkit' || which === 'epiphany') { const wd = require(path.resolve(__dirname, '../../../tests/webkit-shim.js')); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); newPage = () => b.newPage(); }
  else { const pp = require('puppeteer-core');
    b = which === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 3600000 })
      : await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 3600000, args: ['--no-sandbox', '--disable-gpu'] });
    newPage = () => b.newPage(); }
  console.log(await b.version());
  const out = { version: await b.version(), csp: {}, speed: null };
  for (const v of ['control', 'old', 'new']) {
    const counts = []; let ok = true, msg = '', sample = '';
    for (let k = 0; k < +(process.env.LOADS || 5); k++) {
      const p = await newPage(); const msgs = []; if (p.on) { p.on('console', (m) => { if (/eval/i.test(m.text())) msgs.push(m.text()); }); p.on('pageerror', (e) => { if (/eval/i.test(e.message)) msgs.push(e.message); }); } await p.goto(base + '/csp.html?v=' + v + '&k=' + k);
      let res = null; for (let w = 0; w < 100 && !res; w++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(50); }
      if (!res) { ok = false; msg = 'page did not finish'; } else { counts.push(Math.max(res.violations.length, msgs.length)); ok = ok && res.ok; msg = msg || res.msg; sample = sample || res.violations[0] || ''; }
      if (which !== 'webkit' && which !== 'epiphany') await p.close();
    }
    out.csp[v] = { violationsPerLoad: counts, fallbackWorks: ok, msg, sample };
    console.log(v + ': policy violations per load ' + JSON.stringify(counts) + (sample ? ' (e.g. ' + sample + ')' : '') + (v === 'control' ? '' : '; fallback works: ' + ok + (msg ? ' ' + msg : '')));
  }
  const p = await newPage(); await p.goto(base + '/speed.html');
  out.speed = await p.evaluate((n) => window.runSpeed(n), +(process.env.ROUNDS || 9));
  const s = out.speed; console.log(`60,000 links, median of ${process.env.ROUNDS || 9}, ms (lower is better): pack old ${s.old.pack.toFixed(1)} new ${s.new.pack.toFixed(1)}; unpack old ${s.old.unpack.toFixed(1)} new ${s.new.unpack.toFixed(1)}; packed bytes old ${s.bytes.old} new ${s.bytes.new}`);
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(0);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
