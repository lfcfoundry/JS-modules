/* Copyright (c) 2026 LFC Foundry. MIT License. gif-writer, checked by decoding what it wrote with a small independent decoder. */
'use strict';
const G = require('../gif-writer.js');
let fails = 0; const ok = (c, t) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t); };

function decode(buf) {
  let p = 6; const w = buf[p] | buf[p + 1] << 8, h = buf[p + 2] | buf[p + 3] << 8; const flags = buf[p + 4]; p += 7;
  const gct = []; if (flags & 0x80) { const n = 3 << ((flags & 7) + 1); for (let i = 0; i < n; i += 3) gct.push([buf[p + i], buf[p + i + 1], buf[p + i + 2]]); p += n; }
  const canvas = new Array(w * h).fill(null), shots = []; let gce = null, loops = null;
  while (buf[p] !== 0x3B) {
    if (buf[p] === 0x21) {
      const label = buf[p + 1]; p += 2;
      if (label === 0xF9) { gce = { packed: buf[p + 1], delay: (buf[p + 2] | buf[p + 3] << 8) * 10, trans: buf[p + 4] }; }
      if (label === 0xFF && buf[p] === 11 && String.fromCharCode(...buf.slice(p + 1, p + 12)) === 'NETSCAPE2.0') loops = true;
      while (buf[p] !== 0) p += buf[p] + 1; p++;  // skip blocks (the first byte of GCE is its size 4)
      if (label === 0xF9) { /* already read */ }
    } else if (buf[p] === 0x2C) {
      const x0 = buf[p + 1] | buf[p + 2] << 8, y0 = buf[p + 3] | buf[p + 4] << 8, fw = buf[p + 5] | buf[p + 6] << 8, fh = buf[p + 7] | buf[p + 8] << 8; p += 10;
      const min = buf[p++]; const bytes = []; while (buf[p] !== 0) { for (let i = 0; i < buf[p]; i++) bytes.push(buf[p + 1 + i]); p += buf[p] + 1; } p++;
      // LZW decode
      const clear = 1 << min, eoi = clear + 1; let size = min + 1, next = eoi + 1, table = [], out = [], bitBuf = 0, bits = 0, bi = 0, prev = null;
      const reset = () => { table = []; for (let i = 0; i < clear; i++) table[i] = [i]; next = eoi + 1; size = min + 1; prev = null; };
      reset();
      for (;;) {
        while (bits < size && bi < bytes.length) { bitBuf |= bytes[bi++] << bits; bits += 8; }
        if (bits < size) break;
        const code = bitBuf & ((1 << size) - 1); bitBuf >>>= size; bits -= size;
        if (code === clear) { reset(); continue; } if (code === eoi) break;
        let entry; if (table[code]) entry = table[code]; else if (code === next && prev) entry = prev.concat(prev[0]); else throw new Error('bad code');
        out.push(...entry); if (prev) { table[next++] = prev.concat(entry[0]); if (next === (1 << size) && size < 12) size++; } prev = entry;
      }
      const t = gce && (gce.packed & 1) ? gce.trans : -1;
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const v = out[y * fw + x]; if (v !== t) canvas[(y + y0) * w + x + x0] = gct[v]; }
      shots.push({ delay: gce.delay, px: canvas.map((c) => c && c.slice()) }); gce = null;
    } else throw new Error('unexpected byte ' + buf[p] + ' at ' + p);
  }
  return { w, h, shots, loops, header: String.fromCharCode(...buf.slice(0, 6)) };
}

const W = 64, H = 48, mk = (fn) => { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = fn(x, y), o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; } return d; };
const bg = [246, 245, 241], red = [200, 40, 50], blue = [30, 90, 210];
const f1 = mk((x, y) => x > 10 && x < 30 && y > 10 && y < 20 ? red : bg);
const f2 = mk((x, y) => x > 10 && x < 30 && y > 10 && y < 20 ? red : x > 40 && y > 30 ? blue : bg);
const f3 = mk((x, y) => x > 10 && x < 30 && y > 10 && y < 20 ? red : x > 40 && y > 30 ? blue : bg);  // same as f2
const pal = G.makePalette([f1, f2], 255);
ok(pal.length === 3, 'palette keeps the exact colors when there are few: ' + pal.length);
const e = G.createEncoder(W, H, pal, { loop: true }); e.add(f1, 500); e.add(f2, 300); e.add(f3, 200);
const bytes = e.finish(), d = decode(bytes);
ok(d.header === 'GIF89a' && d.w === W && d.h === H, 'header and size');
ok(d.shots.length === 2, 'an unchanged picture only adds to the delay: ' + d.shots.length + ' frames');
ok(d.shots[0].delay === 500 && d.shots[1].delay === 500, 'delays add up: ' + d.shots.map((s) => s.delay));
ok(d.loops === true, 'loops forever');
const same = (px, src) => { for (let i = 0; i < W * H; i++) { const c = px[i]; if (!c || c[0] !== src[i * 4] || c[1] !== src[i * 4 + 1] || c[2] !== src[i * 4 + 2]) return false; } return true; };
ok(same(d.shots[0].px, f1), 'first picture decodes exactly');
ok(same(d.shots[1].px, f2), 'second picture (changed part only) decodes exactly');

// a busy picture with many colors: palette is cut to 255 and every pixel is close to the original
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const busy = mk((x, y) => [Math.floor(x * 4 + rnd() * 8) & 255, Math.floor(y * 5 + rnd() * 8) & 255, Math.floor((x + y) * 2 + rnd() * 8) & 255]);
const pal2 = G.makePalette([busy], 255); ok(pal2.length === 255, 'many colors are cut to 255: ' + pal2.length);
const e2 = G.createEncoder(W, H, pal2, { loop: false }); e2.add(busy, 100); const d2 = decode(e2.finish());
let worst = 0; for (let i = 0; i < W * H; i++) { const c = d2.shots[0].px[i]; worst = Math.max(worst, Math.abs(c[0] - busy[i * 4]) + Math.abs(c[1] - busy[i * 4 + 1]) + Math.abs(c[2] - busy[i * 4 + 2])); }
ok(worst < 60, 'busy picture stays close to the original (worst error ' + worst + ' of 765)');
ok(d2.loops === null, 'no loop block when loop is off');
// a long flat picture exercises table resets
const big = new Uint8Array(400 * 300); for (let i = 0; i < big.length; i++) big[i] = (i * 7 + (i >> 5)) % 200;
const code = G.lzw(big, 8); ok(code.length > 100, 'LZW runs over a long stream through table resets');
// the run shortcut in the LZW coder must give exactly the bytes of the item-by-item coder (G.lzw(x, n, true))
{
  let sd = 1; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647; let diff = 0, runs = 0;
  const mk = (kind, n) => { const a = new Uint8Array(n); let i = 0;
    if (kind === 0) for (; i < n; i++) a[i] = (rr() * 256) | 0;
    else if (kind === 1) a.fill(255);
    else if (kind === 2) { a.fill(255); for (; i < n / 20; i++) a[(rr() * n) | 0] = (rr() * 255) | 0; }
    else while (i < n) { const v = (rr() * (rr() < 0.5 ? 3 : 256)) | 0, l = 1 + Math.floor(Math.pow(rr(), 3) * (rr() < 0.1 ? 100000 : 300)); for (let q = 0; q < l && i < n; q++) a[i++] = v; }
    return a; };
  for (let kind = 0; kind < 4; kind++) for (const n of [1, 2, 3, 17, 1000, 5000, 70000, 400000]) for (let rep = 0; rep < (n > 70000 ? 1 : 4); rep++) { const a = mk(kind, n), x = G.lzw(a, 8, true), y = G.lzw(a, 8); runs++; if (Buffer.compare(Buffer.from(x), Buffer.from(y)) !== 0) diff++; }
  for (const mc of [2, 3, 4, 5]) for (let rep = 0; rep < 8; rep++) { const n = 2 + Math.floor(rr() * 20000), a = new Uint8Array(n); let i = 0; while (i < n) { const v = (rr() * (1 << mc)) | 0, l = 1 + Math.floor(rr() * (rr() < 0.2 ? 500 : 6)); for (let q = 0; q < l && i < n; q++) a[i++] = v; } runs++; if (Buffer.compare(Buffer.from(G.lzw(a, mc, true)), Buffer.from(G.lzw(a, mc))) !== 0) diff++; }
  ok(diff === 0, 'LZW run shortcut gives the same bytes as the plain coder on ' + runs + ' inputs (' + diff + ' differ)');
}
// Fixed scenes whose palettes and GIF bytes were recorded from version 1.0.0 (before the faster palette search); 1.1.0 and later must match them exactly.
function goldenHashes(G) {
  const crypto = require('crypto'); let sd = 12345; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const hash = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : Buffer.from(x)).digest('hex').slice(0, 16);
  const scene = (kind, w, h, n) => { const out = []; for (let f = 0; f < n; f++) { const a = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { const x = i % w, y = (i / w) | 0; let r, g, b;
      if (kind === 'lattice') { r = ((rr() * 16) | 0) * 17; g = ((rr() * 16) | 0) * 17; b = ((rr() * 16) | 0) * 17; }      // 4096 colors, all equally common: many ties
      else if (kind === 'noise') { r = rr() * 256; g = rr() * 256; b = rr() * 256; }
      else if (kind === 'smooth') { r = x * 255 / w + f * 3 + rr() * 5; g = y * 255 / h + rr() * 3; b = ((x ^ y) & 255) * 0.5 + rr() * 6; }
      else { const q = (rr() * 7) | 0; r = q * 36; g = 255 - q * 31; b = q * 9; }                                        // 7 colors
      a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; } out.push(a); } return out; };
  const res = [];
  for (const [kind, w, h, n, mc] of [['lattice', 90, 70, 3, 255], ['noise', 120, 90, 2, 255], ['smooth', 160, 120, 4, 255], ['smooth', 160, 120, 2, 40], ['few', 64, 48, 2, 255], ['lattice', 50, 40, 2, 3]]) {
    const pics = scene(kind, w, h, n), pal = G.makePalette(pics, mc); res.push(hash(JSON.stringify(pal)));
    const enc = G.createEncoder(w, h, pal, {}); pics.forEach((p, i) => enc.add(p, 40 + i)); res.push(hash(enc.finish()));
  }
  // a hand-made palette with equal greens and equal distances, so the nearest-color tie rule decides
  const tp = []; for (let i = 0; i < 60; i++) tp.push([(i * 37) % 256, (i % 5) * 50, (i * 91) % 256]);
  const pics = scene('lattice', 70, 50, 2), enc = G.createEncoder(70, 50, tp, {}); pics.forEach((p, i) => enc.add(p, 30 + i)); res.push(hash(enc.finish()));
  return res;
}
{
  const got = goldenHashes(G), want = ["d13b7242aa86702a","cb99c400a18f2a30","710a5ab80d3fe07a","dbc250c79ac33851","ba2308747618c43e","420f628132808bec","67e5b86bb17ca357","70bb22cc137c8805","ad94477792e96c58","f3ec721b27d82bf6","2fae469763b3a7cb","e6dbfddbca69f469","d91c32be86da9da6"], bad = got.filter((h, i) => h !== want[i]).length;
  ok(bad === 0, 'palettes and GIF bytes of 7 fixed scenes match what version 1.0.0 wrote (' + bad + ' of ' + want.length + ' differ)');
}

/* The WebAssembly half (1.2.0): the palette search and the picture encoder give the same colors and the same bytes as the JavaScript code. */
{
  ok(G.wasmAvailable() === true, 'WebAssembly is available here');
  let sd = 99; const rnd = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296;
  const pic = (kind, w, h, f) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const x = i % w, y = (i / w) | 0; let r, g, b; if (kind === 'lattice') { r = ((rnd() * 16) | 0) * 17; g = ((rnd() * 16) | 0) * 17; b = ((rnd() * 16) | 0) * 17; } else if (kind === 'noise') { r = rnd() * 256; g = rnd() * 256; b = rnd() * 256; } else if (kind === 'smooth') { r = x * 255 / w + f * 3 + rnd() * 5; g = y * 255 / h + rnd() * 3; b = ((x ^ y) & 255) * 0.5 + rnd() * 6; } else if (kind === 'photo') { r = Math.sin(x / 37 + f / 5) * 127 + 128; g = Math.cos(y / 29 - f / 7) * 127 + 128; b = (((r | 0) + (g | 0)) >> 1) ^ ((rnd() * 8) | 0); } else if (kind === 'bands') { const bb = (((y + f * 9) / 24) | 0) % 9; r = bb * 28; g = 255 - bb * 25; b = (bb * 61) & 255; } else if (kind === 'stripes') { if ((y >> 2) & 1) { r = rnd() * 256; g = rnd() * 256; b = rnd() * 256; } else { r = 40 + (y & 3) * 50; g = 200; b = f * 30; } } else if (kind === 'ramp') { r = (i * 7) & 255; g = (i * 13 >> 3) & 255; b = (i >> 5) & 255; } else if (kind === 'anim') { const bx = (f * 7) % Math.max(1, w - 20), by = (f * 3) % Math.max(1, h - 20), ins = x >= bx && x < bx + 20 && y >= by && y < by + 20; r = ins ? 220 : x * 100 / w; g = ins ? 40 + f : y * 100 / h; b = ins ? 30 : 90; } else { const q = (rnd() * 7) | 0; r = q * 36; g = 255 - q * 31; b = q * 9; } a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; } return a; };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  let bad = 0, tried = 0; const names = [];
  const palCheck = (name, pics, mc) => { tried++; if (JSON.stringify(G.makePalette(pics, mc)) !== JSON.stringify(G.makePalette(pics, mc, { wasm: false }))) { bad++; names.push(name + ' mc=' + mc); } };
  for (const kind of ['lattice', 'noise', 'smooth', 'photo', 'ramp', 'few']) for (const mc of [1, 2, 3, 7, 40, 255, 256, undefined]) { const pics = []; for (let f = 0; f < 3; f++) pics.push(pic(kind, 90 + f, 70, f)); palCheck(kind, pics, mc); }
  for (const kind of ['noise', 'photo', 'smooth', 'lattice']) for (const mc of [16, 255]) { const pics = []; for (let f = 0; f < 3; f++) pics.push(pic(kind, 700, 500, f)); palCheck(kind + ' big (every other pixel)', pics, mc); }
  for (let t = 0; t < 60; t++) { const w = 1 + ((rnd() * 60) | 0), h = 1 + ((rnd() * 40) | 0), pics = [], k = 1 + ((rnd() * 4) | 0); for (let f = 0; f < k; f++) pics.push(pic(['lattice', 'noise', 'smooth', 'few', 'ramp'][(rnd() * 5) | 0], w, h, f)); palCheck('random ' + w + 'x' + h, pics, [2, 5, 16, 100, 255][(rnd() * 5) | 0]); }
  ok(bad === 0, 'WebAssembly palette search gives the same colors as the JavaScript one on ' + tried + ' sets (' + bad + ' differ' + (names.length ? ': ' + names.slice(0, 3).join('; ') : '') + ')');
  const encode = (w, h, pal, pics, wasm) => { const e = G.createEncoder(w, h, pal, wasm === false ? { wasm: false } : {}); pics.forEach((p, i) => e.add(p, 40 + i)); return e.finish(); };
  bad = 0; tried = 0; const en = [];
  const encCheck = (name, w, h, pics, mc, palette) => { tried++; const pal = palette || G.makePalette(pics, mc); if (!same(encode(w, h, pal, pics), encode(w, h, pal, pics, false))) { bad++; en.push(name); } };
  for (const c of [['lattice', 90, 70, 3, 255], ['noise', 120, 90, 2, 255], ['smooth', 160, 120, 4, 255], ['smooth', 160, 120, 2, 40], ['few', 64, 48, 2, 255], ['lattice', 50, 40, 2, 3], ['anim', 120, 90, 12, 255], ['anim', 97, 53, 9, 255], ['photo', 200, 150, 3, 255], ['few', 1, 1, 3, 255], ['few', 3, 1, 2, 255], ['few', 1, 5, 2, 255], ['smooth', 33, 17, 3, 255], ['few', 300, 200, 2, 255], ['bands', 200, 150, 14, 255], ['bands', 64, 48, 5, 6], ['stripes', 130, 100, 3, 255], ['stripes', 400, 300, 2, 255]]) { const pics = []; for (let f = 0; f < c[3]; f++) pics.push(pic(c[0], c[1], c[2], f)); encCheck(c[0] + ' ' + c[1] + 'x' + c[2], c[1], c[2], pics, c[4]); }
  { const pics = [pic('anim', 80, 60, 0), pic('anim', 80, 60, 1), pic('anim', 80, 60, 2)]; pics.splice(2, 0, pics[1], pics[1]); encCheck('repeated pictures', 80, 60, pics, 255); }
  { const ties = []; for (let i = 0; i < 60; i++) ties.push([(i * 37) % 256, (i % 5) * 50, (i * 91) % 256]); encCheck('equal distances', 70, 50, [pic('lattice', 70, 50, 0), pic('lattice', 70, 50, 1)], 0, ties); }
  { const pics = []; for (let f = 0; f < 3; f++) pics.push(pic('noise', 130, 100, f)); encCheck('a long table (resets)', 130, 100, pics, 255); }
  ok(bad === 0, 'WebAssembly encoder writes the same GIF bytes as the JavaScript one on ' + tried + ' scenes (' + bad + ' differ' + (en.length ? ': ' + en.slice(0, 3).join('; ') : '') + ')');
  /* without WebAssembly, with a refused module, or with a broken instance, the JavaScript code runs and writes the same bytes */
  const path = require.resolve('../gif-writer.js'), saved = globalThis.WebAssembly, pics3 = [pic('anim', 64, 48, 0), pic('anim', 64, 48, 1), pic('anim', 64, 48, 2)], pal3 = G.makePalette(pics3, 255), want = encode(64, 48, pal3, pics3, false);
  const fresh = () => { delete require.cache[path]; const m = require(path); delete require.cache[path]; return m; };
  const withG = (m) => { const e = m.createEncoder(64, 48, pal3, {}); pics3.forEach((p, i) => e.add(p, 40 + i)); return e.finish(); };
  try {
    globalThis.WebAssembly = undefined; const a = fresh(); ok(a.wasmAvailable() === false && same(withG(a), want) && JSON.stringify(a.makePalette(pics3, 255)) === JSON.stringify(pal3), 'without WebAssembly: same palette and same bytes');
    globalThis.WebAssembly = { Module: function () { throw new Error('refused by the page policy'); }, Instance: saved.Instance, Memory: saved.Memory }; const b = fresh(); ok(b.wasmAvailable() === false && same(withG(b), want) && JSON.stringify(b.makePalette(pics3, 255)) === JSON.stringify(pal3), 'a module the page refuses: same palette and same bytes');
    globalThis.WebAssembly = { Module: saved.Module, Instance: function () { throw new Error('no instance'); }, Memory: saved.Memory }; const c = fresh(); ok(same(withG(c), want) && JSON.stringify(c.makePalette(pics3, 255)) === JSON.stringify(pal3), 'an instance that fails: same palette and same bytes');
  } finally { globalThis.WebAssembly = saved; }
  const cp = require('child_process'), dir = require('path').join(__dirname, '..', 'wasm');
  let proof = true; try { cp.execFileSync('python3', [require('path').join(dir, 'embed.py'), '--check'], { stdio: 'pipe' }); } catch (e) { proof = false; }
  let hasClang = true; try { cp.execFileSync('clang', ['--version'], { stdio: 'pipe' }); } catch (e) { hasClang = false; }
  if (hasClang) { try { cp.execFileSync('sh', [require('path').join(dir, 'build.sh'), '--check'], { stdio: 'pipe' }); } catch (e) { proof = false; } }
  ok(proof, 'the embedded WebAssembly is what wasm/gif.c builds (embed.py --check' + (hasClang ? ' and build.sh --check' : '; build.sh --check skipped, no clang here') + ')');
}
if (fails) { console.log(fails + ' FAILED'); process.exit(1); } else console.log('gif-writer: all passed');
