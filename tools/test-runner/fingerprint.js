/* Copyright (c) 2026 LFC Foundry. MIT License. The picture fingerprint gate: a drawing change that nobody meant fails a check instead of reaching a player.
     const F = require('./tools/test-runner/fingerprint.js');
     const g = F.gate('apple-press-curtain', which, await b.version());          // which = chromium | firefox | webkit | epiphany
     g.check('closed', await page.evaluate(F.pageHash, '#stage'));              // a canvas selector hashes its pixels; no selector hashes the page's biggest canvas
     process.exit(g.finish() ? 0 : 1);                                          // prints what matched, what is new and what changed
   Fingerprints are kept per browser and version in tests/fingerprints/<name>.json (a text file you commit). A new browser version records a new baseline instead of failing, because
   drawing may differ between versions; the same version drawing something else fails. Run with FINGERPRINT_UPDATE=1 to accept the pictures as they are now. */
'use strict';
const fs = require('fs'), path = require('path');
const dirOf = () => process.env.FINGERPRINT_DIR || path.resolve(__dirname, '..', '..', 'tests', 'fingerprints');
/** Runs in the page: a 64-bit fingerprint (16 hex digits, two 32-bit hashes side by side) of the pixels of a canvas (selector, or the biggest canvas) and its size. A canvas that has
 *  no 2D context (WebGL) is read through toDataURL. Pass it to page.evaluate(F.pageHash, selector). */
function pageHash(selector) {
  var c = selector ? document.querySelector(selector) : null, i;
  if (!c) { var all = document.querySelectorAll('canvas'), best = 0; for (i = 0; i < all.length; i++) if (all[i].width * all[i].height > best) { best = all[i].width * all[i].height; c = all[i]; } }
  if (!c) return 'no-canvas';
  var ctx = c.getContext('2d'), d, h1 = 0x811c9dc5 | 0, h2 = 0x2545f491 | 0, v;
  if (ctx) d = ctx.getImageData(0, 0, c.width, c.height).data; else { var u = c.toDataURL(); d = new Uint8Array(u.length); for (i = 0; i < u.length; i++) d[i] = u.charCodeAt(i); }
  var tail = [c.width & 255, c.width >> 8, c.height & 255, c.height >> 8];
  for (i = 0; i < d.length + 4; i++) { v = i < d.length ? d[i] : tail[i - d.length]; h1 = Math.imul(h1 ^ v, 16777619); h2 = Math.imul(h2 + v + 1, 0x9e3779b1) ^ (h2 >>> 15); }
  return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
}
function gate(name, browser, version) {
  const file = path.join(dirOf(), name + '.json'), update = !!process.env.FINGERPRINT_UPDATE;
  let data = {}; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first run */ }
  const key = browser + ' ' + String(version).replace(/^.*?(\d[\d.]*).*$/, '$1');   // "chromium 155.0.8059.39"
  const base = data[key] || {}, seen = {}, changed = [], fresh = [], same = [];
  return {
    key,
    check(label, hash) {
      seen[label] = hash;
      if (base[label] === undefined) fresh.push(label); else if (base[label] === hash) same.push(label); else changed.push(label + ' (' + base[label] + ' -> ' + hash + ')');
    },
    /** Prints the verdict and writes new baselines; true = nothing changed. */
    finish() {
      const fail = changed.length > 0 && !update;
      if (update || fresh.length) { data[key] = Object.assign({}, base, update ? seen : Object.fromEntries(fresh.map((l) => [l, seen[l]]))); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n'); }
      console.log('fingerprints ' + name + ' [' + key + ']: ' + same.length + ' same, ' + fresh.length + ' new' + (fresh.length ? ' (recorded)' : '') + ', ' + changed.length + ' changed' + (changed.length && update ? ' (accepted)' : ''));
      for (const c of changed) console.log('  CHANGED ' + c);
      return !fail;
    }
  };
}
module.exports = { pageHash, gate };
