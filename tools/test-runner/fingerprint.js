/* Copyright (c) 2026 LFC Foundry. MIT License. The picture fingerprint gate: a drawing change that nobody meant fails a check instead of reaching a player.
     const F = require('./tools/test-runner/fingerprint.js');
     const g = F.gate('apple-press-curtain', which, await b.version());          // which = chromium | firefox | webkit | epiphany
     g.check('closed', await page.evaluate(F.pageHash, '#stage'));              // a canvas selector hashes its pixels; no selector hashes the page's biggest canvas
     process.exit(g.finish() ? 0 : 1);                                          // prints what matched, what is new and what changed
   Near matches (the owner's 99.5% rule, 2026-10-19): a picture passes when 99.5% of its pixels or more are identical to the stored one, and the exact percentage is printed. Pass the pixels too:
     await g.checkPixels('closed', await page.evaluate(F.pageHash, '#stage'), () => page.evaluate(F.pagePixels, '#stage'));   // pixels are fetched only when the hash differs or is new
   Data results still have to be byte-identical; this is for drawings only. The threshold is 99.5 (percent), set with gate(..., { threshold }) or FINGERPRINT_THRESHOLD; 100 means exact. The stored pixels are
   gzipped files in tests/fingerprints/<name>/ (commit them); a picture with no stored pixels is compared by hash only.
   Fingerprints are kept per browser and version in tests/fingerprints/<name>.json (a text file you commit). A new browser version records a new baseline instead of failing, because
   drawing may differ between versions; the same version drawing something else fails. Run with FINGERPRINT_UPDATE=1 to accept the pictures as they are now. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DEFAULT_THRESHOLD = 99.5;
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
/** Runs in the page: the pixels of a canvas (selector, or the biggest canvas) as { w, h, b64 } (RGBA bytes, base64). Pass it to page.evaluate(F.pagePixels, selector). */
function pagePixels(selector) {
  var c = selector ? document.querySelector(selector) : null, i;
  if (!c) { var all = document.querySelectorAll('canvas'), best = 0; for (i = 0; i < all.length; i++) if (all[i].width * all[i].height > best) { best = all[i].width * all[i].height; c = all[i]; } }
  if (!c) return null;
  var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = '';
  for (i = 0; i < d.length; i += 8192) s += String.fromCharCode.apply(null, d.subarray(i, i + 8192));
  return { w: c.width, h: c.height, b64: btoa(s) };
}
/** Percent of pixels that are exactly equal in two { w, h, rgba } pictures (0 when the sizes differ). */
function percentSame(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h || a.rgba.length !== b.rgba.length) return 0;
  let same = 0; const n = a.rgba.length >> 2;
  for (let i = 0, j = 0; i < n; i++, j += 4) if (a.rgba[j] === b.rgba[j] && a.rgba[j + 1] === b.rgba[j + 1] && a.rgba[j + 2] === b.rgba[j + 2] && a.rgba[j + 3] === b.rgba[j + 3]) same++;
  return n ? same / n * 100 : 100;
}
const fromPage = (p) => p && { w: p.w, h: p.h, rgba: Buffer.from(p.b64, 'base64') };
function gate(name, browser, version, opts) {
  const file = path.join(dirOf(), name + '.json'), update = !!process.env.FINGERPRINT_UPDATE;
  let data = {}; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first run */ }
  const key = browser + ' ' + String(version).replace(/^.*?(\d[\d.]*).*$/, '$1');   // "chromium 155.0.8059.39"
  const base = data[key] || {}, seen = {}, changed = [], fresh = [], same = [], near = [], results = [];
  const threshold = Number((opts && opts.threshold) !== undefined ? opts.threshold : process.env.FINGERPRINT_THRESHOLD !== undefined ? process.env.FINGERPRINT_THRESHOLD : DEFAULT_THRESHOLD);
  const pxFile = (label) => path.join(dirOf(), name, key.replace(/[^\w.-]+/g, '_'), label.replace(/[^\w.-]+/g, '_') + '.rgba.gz');
  const savePx = (label, px) => { const f = pxFile(label); fs.mkdirSync(path.dirname(f), { recursive: true }); const h = Buffer.alloc(8); h.writeUInt32LE(px.w, 0); h.writeUInt32LE(px.h, 4); fs.writeFileSync(f, zlib.gzipSync(Buffer.concat([h, px.rgba]), { level: 9 })); };
  const loadPx = (label) => { try { const r = zlib.gunzipSync(fs.readFileSync(pxFile(label))); return { w: r.readUInt32LE(0), h: r.readUInt32LE(4), rgba: r.subarray(8) }; } catch (e) { return null; } };
  return {
    key, threshold, results,
    check(label, hash) {
      seen[label] = hash;
      if (base[label] === undefined) fresh.push(label); else if (base[label] === hash) same.push(label); else changed.push(label + ' (' + base[label] + ' -> ' + hash + ')');
    },
    /** Like check, and when the hash differs from the stored one it fetches the pixels (getPixels: an async function returning page.evaluate(F.pagePixels, selector)) and passes the picture
     *  when threshold percent or more of its pixels are identical to the stored ones. New pictures and accepted updates store their pixels. Returns the percent identical (100 = same hash). */
    async checkPixels(label, hash, getPixels) {
      seen[label] = hash; const old = base[label];
      if (old === undefined || (update && old !== hash)) { if (old === undefined) fresh.push(label); const px = fromPage(await getPixels()); if (px) savePx(label, px); results.push({ label, status: old === undefined ? 'new' : 'updated', percent: null }); return null; }
      if (old === hash) { same.push(label); results.push({ label, status: 'same', percent: 100 }); return 100; }
      const stored = loadPx(label), now = stored ? fromPage(await getPixels()) : null;
      if (!stored || !now) { changed.push(label + ' (' + old + ' -> ' + hash + (stored ? '' : '; no stored pixels, compared by hash only') + ')'); results.push({ label, status: 'changed', percent: null }); return null; }
      const pct = percentSame(stored, now);
      if (pct >= threshold) { near.push(label + ' ' + pct.toFixed(3) + '% identical'); seen[label] = old; results.push({ label, status: 'near', percent: pct }); }
      else { changed.push(label + ' (' + pct.toFixed(3) + '% identical, needs ' + threshold + '%; ' + old + ' -> ' + hash + ')'); results.push({ label, status: 'changed', percent: pct }); }
      return pct;
    },
    /** Prints the verdict and writes new baselines; true = nothing changed. */
    finish() {
      const fail = changed.length > 0 && !update;
      if (update || fresh.length) { data[key] = Object.assign({}, base, update ? seen : Object.fromEntries(fresh.map((l) => [l, seen[l]]))); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n'); }
      console.log('fingerprints ' + name + ' [' + key + ']: ' + same.length + ' same, ' + (near.length ? near.length + ' near (at least ' + threshold + '% identical), ' : '') + fresh.length + ' new' + (fresh.length ? ' (recorded)' : '') + ', ' + changed.length + ' changed' + (changed.length && update ? ' (accepted)' : ''));
      for (const c of near) console.log('  NEAR ' + c);
      for (const c of changed) console.log('  CHANGED ' + c);
      return !fail;
    }
  };
}
module.exports = { pageHash, pagePixels, percentSame, gate, DEFAULT_THRESHOLD };
