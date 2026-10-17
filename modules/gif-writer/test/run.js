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
if (fails) { console.log(fails + ' FAILED'); process.exit(1); } else console.log('gif-writer: all passed');
