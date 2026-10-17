#!/usr/bin/env node
// save-kit 1.2.0 in a real browser: the new options with the browser's own localStorage and compression, for the full file and for two lean builds.
// Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/save-kit-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs python3 (lean.py) and puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'savekit-'));
const FANCY = 'autosave,twoTap,persist,stageImport,migrate,skipUnchanged,compact,raw,nativeBase64,streamLimit', AP = 'autosave,twoTap,persist,onOtherTab,migrate,skipUnchanged,compact,raw,nativeBase64';
const builds = { full: root + 'modules/save-kit/save-kit.js' };
for (const [name, cut] of [['fancy-like lean', FANCY], ['apple-press-like lean', AP]]) { const f = path.join(tmp, name.replace(/\W+/g, '-') + '.js'); execFileSync('python3', [root + 'modules/save-kit/lean.py', '--without', cut, '-o', f], { stdio: 'ignore' }); builds[name] = f; }
const pages = {};
for (const [name, f] of Object.entries(builds)) { const h = path.join(tmp, name.replace(/\W+/g, '-') + '.html'); fs.writeFileSync(h, '<!doctype html><meta charset=utf-8><script src="' + (f.startsWith(tmp) ? path.basename(f) : 'file://' + f) + '"></script>'); pages[name] = h; }

// Runs inside the page. Returns [[check name, ok, detail]]. Uses only the core and the codes, which every build here keeps.
async function battery() {
  const R = [], ok = (n, c, d) => R.push([n, !!c, c ? '' : String(d || '')]);
  const fnv = (str, hex) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return hex ? ('00000000' + h.toString(16)).slice(-8) : h.toString(36); };
  const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const zip = async raw => new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const schema = { score: 'num', level: 'int:9', sound: 'flag', name: 'str:20', owned: 'counts', savedAt: 'num' };
  const rej = async (p, re) => { try { await p; return false; } catch (e) { return re.test(String(e)); } };
  const wipe = ks => ks.forEach(k => localStorage.removeItem(k));
  const keys = ['sk-t', 'sk-t-bak', 'sk-t-damaged', 'sk-t-backup'];
  wipe(keys);
  // 1. Fancy the Banana's codes: hex8 ending, written and read
  const fk = SaveKit.create({ key: 'sk-t', schema, prefix: 'BF1', codeCheck: 'hex8' }), dk = SaveKit.create({ key: 'sk-t', schema, prefix: 'BF1' });
  const sv = { score: 7, level: 3, sound: 1, name: 'ab', owned: { a: 2 } }, json = new TextEncoder().encode(JSON.stringify(sv));
  const zc = await zip(json), dz = b64(zc), oldZ = 'BF1z.' + dz + '.' + fnv(dz, true), dp = b64(json), oldP = 'BF1p.' + dp + '.' + fnv(dp, true);
  ok('reads Fancy\'s squeezed code (BF1z, 8-hex ending)', (await fk.importCode(oldZ)).score === 7);
  ok('reads Fancy\'s plain code (BF1p)', (await fk.importCode(oldP)).owned.a === 2);
  ok('the default ending refuses a Fancy code as "not complete"', await rej(dk.importCode(oldZ), /not complete/));
  const mine = await fk.exportCode(Object.assign({}, sv)), m = /^(BF1[zp])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(mine);
  ok('a code made here passes Fancy\'s own pattern and check', m && fnv(m[2], true) === m[3], mine);
  ok('words around a code are ignored', (await fk.importCode('here: ' + mine + ' thanks')).score === 7);
  // 2. Apple Press's codes: base 36, no padding
  const ak = SaveKit.create({ key: 'sk-t', schema, prefix: 'AP1', codeCheck: 'plain36' });
  let shortSeen = false, fullSeen = false, apOk = true, apWrite = true;
  for (let i = 0; i < 300 && !(shortSeen && fullSeen); i++) {
    const s0 = { score: i, level: 1, sound: 1, name: 'n' + i, owned: {} }, d = b64(new TextEncoder().encode(JSON.stringify(s0))), c = 'AP1p.' + d + '.' + fnv(d, false);
    if (fnv(d, false).length < 7) shortSeen = true; else fullSeen = true;
    if ((await ak.importCode('x ' + c + ' y')).score !== i) apOk = false;
    const w = (await ak.exportCode(Object.assign({}, s0))).split('.'); if (w[2] !== fnv(w[1], false) || /^0/.test(w[2])) apWrite = false;
  }
  ok('reads Apple Press codes with short and 7-character endings', apOk && shortSeen && fullSeen, 'short ' + shortSeen + ' full ' + fullSeen);
  ok('writes Apple Press\'s ending (no leading zeros)', apWrite);
  // 3. default codes are unchanged and really squeezed
  const sk = SaveKit.create({ key: 'sk-t', schema, prefix: 'SK1' }), big = { score: 5, level: 2, sound: 1, name: 'x'.repeat(10), owned: {} };
  for (let i = 0; i < 60; i++) big.owned['item' + i] = i + 1;
  const dc = await sk.exportCode(Object.assign({}, big));
  ok('default code: squeezed form, 7-character ending, opens again', /^SK1z\.[A-Za-z0-9_-]+\.[0-9a-z]{7}$/.test(dc) && Object.keys((await sk.importCode(dc)).owned).length === 60, dc.slice(0, 40));
  // 4. slots in the browser's own localStorage
  wipe(keys);
  const k = SaveKit.create({ key: 'sk-t', schema, backupKey: 'sk-t-bak', damagedKey: 'sk-t-damaged', readBackupWithoutMain: false, stamp: 'savedAt' });
  localStorage.setItem('sk-t-bak', JSON.stringify({ score: 4 }));
  ok('an empty main slot does not bring back a leftover backup', k.load() === null);
  const st = { score: 1 }; k.save(st); k.forceBackupNext(); st.score = 2; k.save(st);
  ok('the stamp is savedAt and the backup lives under the given name', typeof JSON.parse(localStorage.getItem('sk-t')).savedAt === 'number' && !localStorage.getItem('sk-t').includes('"seen"') && JSON.parse(localStorage.getItem('sk-t-bak')).score === 2 && localStorage.getItem('sk-t-backup') === null);
  localStorage.setItem('sk-t', '{cut off');
  ok('a damaged main slot loads the backup and is kept aside', k.load().score === 2 && localStorage.getItem('sk-t-damaged') === '{cut off');
  // 5. the game's own field check
  const hk = SaveKit.create({ key: 'sk-t', schema, backupKey: 'sk-t-bak', afterValidate: (c, raw) => { if (raw.score > 50) return false; c.score = Math.min(c.score, 10); } });
  localStorage.setItem('sk-t', JSON.stringify({ score: 30 })); localStorage.setItem('sk-t-bak', JSON.stringify({ score: 3 }));
  ok('afterValidate may change a save', hk.load().score === 10);
  localStorage.setItem('sk-t', JSON.stringify({ score: 99 }));
  ok('afterValidate may refuse a save, and the backup is used', hk.load().score === 3);
  wipe(keys);
  return R;
}

(async () => {
  let fails = 0;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await require('./webkit-shim.js').launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    for (const [name, file] of Object.entries(pages)) {
      const p = await b.newPage(); const errs = []; if (p.on) p.on('pageerror', e => errs.push(String(e && e.message || e)));
      await p.goto('file://' + file);
      let res; try { res = await p.evaluate(battery); } catch (e) { res = [['the page ran the checks', false, String(e && e.message || e)]]; }
      const bad = res.filter(r => !r[1]);
      fails += bad.length + (errs.length ? 1 : 0);
      console.log('  ' + (bad.length || errs.length ? 'FAIL ' : 'ok   ') + name + ': ' + (res.length - bad.length) + ' of ' + res.length + ' checks' + bad.map(r => '\n         - ' + r[0] + ' ' + r[2]).join('') + (errs.length ? '\n         page error: ' + errs[0] : ''));
      if (p.close) await p.close();
    }
    await b.close();
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? fails + ' FAILED' : 'all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
