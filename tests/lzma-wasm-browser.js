#!/usr/bin/env node
// lzma-decode-wasm / lzma-pack --wasm: how long the first unpack takes in a real browser with and without the WebAssembly decoder, and that a page whose
// Content-Security-Policy refuses WebAssembly still opens (the JavaScript decoder takes over). Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/lzma-wasm-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// The test pages carry a counting script in their head, so the packer's own Node check (which expects exactly two scripts) is skipped for them; tools/lzma-pack/test/run.py covers that check.
// Needs python3 (to pack the pages) and a real page to pack: PAGES="/path/a.html,/path/b.html" (default: the sibling clones ../pineapple-defense and ../fancy-banana, else skipped).
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const pages = (process.env.PAGES ? process.env.PAGES.split(',') : [root + '../pineapple-defense/index.html', root + '../fancy-banana/index.html']).filter(f => fs.existsSync(f));
if (!pages.length) { console.log('skipped: no page to pack (set PAGES=/path/a.html,/path/b.html)'); process.exit(2); }
const RUNS = +process.env.RUNS || 9;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lzmawasm-'));
// Every packed page records when its unpacked page starts (window.__t) and how many WebAssembly instances were made (window.__w), so a run can say which decoder it used.
const COUNT = '<script>(function(){var I=window.WebAssembly&&WebAssembly.Instance;if(I)WebAssembly.Instance=function(m,i){window.__w=(window.__w||0)+1;return new I(m,i)}})()</script>';
const CSP_NO = '<meta http-equiv="Content-Security-Policy" content="script-src \'unsafe-inline\'">';
const CSP_OK = '<meta http-equiv="Content-Security-Policy" content="script-src \'unsafe-inline\' \'wasm-unsafe-eval\'">';
function build(file, i) {
  let t = fs.readFileSync(file, 'utf8');
  const mark = '<script>window.__t=performance.now()</script>';
  t = /<head[^>]*>/i.test(t) ? t.replace(/<head[^>]*>/i, m => m + mark) : t.replace(/^(<!doctype[^>]*>)?/i, m => m + mark);
  const src = path.join(tmp, 'in' + i + '.html'); fs.writeFileSync(src, t);
  const v = {};
  const pk = (name, args, strip) => { const out = path.join(tmp, name + i + '.html'); execFileSync('python3', [root + 'tools/lzma-pack/pack.py', src, out, '--title', 'x', '--skip-node-check'].concat(args), { env: Object.assign({}, process.env), stdio: ['ignore', 'pipe', 'inherit'] }); if (strip) fs.writeFileSync(out, fs.readFileSync(out, 'latin1').replace(" 'wasm-unsafe-eval'", ''), 'latin1');   // the packer adds the token to every policy; cut it out again to see the fallback
    v[name] = out; return fs.statSync(out).size; };
  const sizes = { plain: pk('plain', ['--no-wasm', '--head', COUNT]), wasm: pk('wasm', ['--wasm', '--head', COUNT]),
    blocked: pk('blocked', ['--wasm', '--head', CSP_NO + COUNT], true), allowed: pk('allowed', ['--wasm', '--head', CSP_OK + COUNT]), carried: pk('carried', ['--wasm', '--head', CSP_NO + COUNT]) };   // carried: a policy without the token, as given; the packer adds it
  return { name: path.basename(path.dirname(path.resolve(file))), input: fs.statSync(file).size, files: v, sizes };
}
const built = pages.map(build);
// The add-on on its own: a page that decodes the first page's LZMA stream once, with the JavaScript decoder (#js) or the WebAssembly add-on (#wasm); a fresh page per
// load so the first decode is cold. The wasm timing starts before the add-on file loads, so compiling the module is counted.
const rawFile = pages[0], raw = fs.readFileSync(rawFile);
const lz = execFileSync('python3', ['-c', "import sys,lzma;d=sys.stdin.buffer.read();f=[{'id':lzma.FILTER_LZMA1,'dict_size':1<<20,'lc':4,'lp':0,'pb':0,'preset':6}];sys.stdout.buffer.write(lzma.compress(d,format=lzma.FORMAT_RAW,filters=f)[1:])"], { input: raw, maxBuffer: 1 << 28 });
fs.writeFileSync(path.join(tmp, 'data.js'), 'window.__lz="' + lz.toString('base64') + '";window.__n=' + raw.length + ';');
fs.copyFileSync(root + 'modules/lzma-decode/lzma-decode.js', path.join(tmp, 'lzma-decode.js')); fs.copyFileSync(root + 'modules/lzma-decode/lzma-decode-wasm.js', path.join(tmp, 'lzma-decode-wasm.js'));
fs.writeFileSync(path.join(tmp, 'decode.html'), '<!doctype html><meta charset=utf-8><script src=lzma-decode.js></script><script src=data.js></script><script>' +
  'var z=Uint8Array.from(atob(__lz),function(c){return c.charCodeAt(0)}),w=location.hash=="#wasm",t0=performance.now();if(w)document.write("<script src=lzma-decode-wasm.js><\\/script>");</script>' +
  '<script>var f=w?lzmaDecodeWasm:lzmaDecode,o=f(z,__n,{lc:4,lp:0,pb:0}),h=0,i;window.__d=performance.now()-t0;for(i=0;i<o.length;i+=97)h=(h*31+o[i])>>>0;window.__h=h;window.__e=w?lzmaDecodeWasm.engine:"js";window.__len=o.length</script>');
let want = 0; for (let i = 0; i < raw.length; i += 97) want = (want * 31 + raw[i]) >>> 0;
for (const b of built) console.log(b.name + ': page ' + b.input + ' bytes; packed ' + JSON.stringify(b.sizes) + ' (plain = JavaScript decoder only; the other three carry the WebAssembly decoder)');

const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function load(b, file) {
  const p = await b.newPage();
  try {
    await p.goto('file://' + file);
    for (let i = 0; i < 200; i++) {
      const r = await p.evaluate(() => ({ t: window.__t === undefined ? null : window.__t, w: window.__w || 0, bad: /was changed/.test((document.body && document.body.innerText) || '') }));
      if (r.t !== null || r.bad) return r;
      await sleep(50);
    }
    return { t: null, w: 0, bad: false, timeout: true };
  } finally { if (p.close) await p.close(); }
}

async function decodeOnce(b, which) {
  const p = await b.newPage();
  try {
    await p.goto('file://' + path.join(tmp, 'decode.html') + '#' + which);
    for (let i = 0; i < 200; i++) { const r = await p.evaluate(() => window.__d === undefined ? null : { d: window.__d, h: window.__h, e: window.__e, n: window.__len }); if (r) return r; await sleep(50); }
    return null;
  } finally { if (p.close) await p.close(); }
}

(async () => {
  let fails = 0;
  for (const [kind, exe] of exes) {
    const wd = kind === 'webkit' ? require('./webkit-shim.js') : null;
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    for (const pg of built) {
      const names = pg === built[0] ? ['plain', 'wasm', 'blocked', 'allowed', 'carried'] : ['plain', 'wasm'], runs = pg === built[0] ? RUNS : Math.min(RUNS, 5);
      const res = {}; names.forEach(n => res[n] = { t: [], w: [], bad: 0 });
      for (let r = 0; r < runs; r++) for (const n of names) {     // alternate the variants so slow drift and warm-up hit all of them alike
        const x = await load(b, pg.files[n]);
        if (x.t === null) res[n].bad++; else { res[n].t.push(x.t); res[n].w.push(x.w); }
      }
      const ok = (n, cond, what) => { if (!cond) { fails++; console.log('  FAIL ' + pg.name + ' ' + n + ': ' + what); } };
      for (const n of names) {
        const R = res[n];
        ok(n, R.bad === 0, R.bad + ' of ' + runs + ' loads did not open');
        const used = R.w.length && R.w.every(w => w >= 1), none = R.w.every(w => w === 0);
        if (n === 'plain' || n === 'blocked') ok(n, n === 'plain' ? none : true, 'used WebAssembly');
        if (n === 'blocked' && !none) console.log('  note ' + pg.name + ': this browser does not refuse WebAssembly under a policy without wasm-unsafe-eval, so the fallback was not exercised here (the page still opened)');
        if (n === 'wasm' || n === 'allowed' || n === 'carried') ok(n, used, 'the WebAssembly decoder did not run');
      }
      const base = med(res.plain.t);
      console.log('  ' + pg.name + ' (' + runs + ' loads each, alternating; ms until the unpacked page starts, smaller is better)');
      for (const n of names) {
        const m = med(res[n].t);
        console.log('    ' + n.padEnd(8) + ' median ' + m.toFixed(1).padStart(6) + ' ms   (' + (base / m).toFixed(2) + 'x as fast as plain; higher is better)   WebAssembly instances per load: ' + (res[n].w.length ? med(res[n].w) : '-') + (n === 'blocked' ? '   [page policy without wasm-unsafe-eval]' : ''));
      }
    }
    {
      const rs = { js: [], wasm: [] }; let engineOk = true, same = true;
      for (let r = 0; r < Math.max(RUNS, 9); r++) for (const w of ['js', 'wasm']) {
        const x = await decodeOnce(b, w);
        if (!x) { fails++; console.log('  FAIL first decode (' + w + '): the page did not finish'); continue; }
        rs[w].push(x.d); if (x.e !== w) engineOk = false; if (x.h !== want || x.n !== raw.length) same = false;
      }
      if (!engineOk) { fails++; console.log('  FAIL first decode: a page used the wrong decoder'); }
      if (!same) { fails++; console.log('  FAIL first decode: the decoded bytes differ from the page'); }
      const mj = med(rs.js), mw = med(rs.wasm);
      console.log('  first decode of ' + built[0].name + ' (' + raw.length + ' bytes from ' + lz.length + ' bytes, ' + rs.js.length + ' fresh pages each, alternating; ms, smaller is better): JavaScript ' + mj.toFixed(1) + ', WebAssembly add-on ' + mw.toFixed(1) + ' (compile included) = ' + (mj / mw).toFixed(2) + 'x as fast (higher is better); same bytes: ' + same);
    }
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
