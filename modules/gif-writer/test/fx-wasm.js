/* Copyright (c) 2026 LFC Foundry. MIT License. The WebAssembly picture filters give exactly the same bytes as the JavaScript ones. */
'use strict';
const X = require('../gif-writer-fx.js');
let fails = 0; const ok = (c, t) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t); };
(async () => {
  ok(await X.initWasm() && X.wasmReady(), 'the WebAssembly filters start');
  let seed = 12345; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  const mk = (w, h, kind) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const x = i % w, y = (i / w) | 0; if (kind === 'noise') { a[i * 4] = rnd() * 256; a[i * 4 + 1] = rnd() * 256; a[i * 4 + 2] = rnd() * 256; } else if (kind === 'flat') { a[i * 4] = 246; a[i * 4 + 1] = 245; a[i * 4 + 2] = 241; if ((x >> 3) % 7 === 0 && (y >> 3) % 5 === 0) { a[i * 4] = 250; a[i * 4 + 1] = 250; a[i * 4 + 2] = 255; } } else { a[i * 4] = x * 255 / w; a[i * 4 + 1] = y * 255 / h; a[i * 4 + 2] = 255 - x * 255 / w; } a[i * 4 + 3] = 255; } return a; };
  const F = [{ brightness: 0.2 }, { contrast: -0.3, saturation: 0.5, warmth: 0.4 }, { hue: 70, tone: 'sepia' }, { tone: 'mono', vignette: 0.7 }, { tone: 'cyan' }, { tone: 'ink', glow: 0.5 }, { blur: 1 }, { blur: 5.5 }, { sharpen: 0.8 }, { glow: 1 }, { vignette: 1, saturation: -0.4 },
    { glow: 0.6, blur: 1, vignette: 0.4, sharpen: 0.3, saturation: 0.2 }, { glow: 0.3, blur: 3, sharpen: 1, warmth: -0.5, hue: -120, contrast: 0.4, brightness: -0.2, vignette: 0.9 }];
  let n = 0, bad = 0;
  for (const [w, h] of [[97, 61], [64, 48], [200, 113], [960, 540]]) for (const kind of ['noise', 'flat', 'ramp']) for (const f of F) {
    if (w === 960 && (kind !== 'flat' && kind !== 'noise' || F.indexOf(f) % 4)) continue;
    const src = mk(w, h, kind), a = X.applyJs(new Uint8ClampedArray(src), w, h, f), b = X.applyWasm(new Uint8ClampedArray(src), w, h, f); n++;
    if (Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)) !== 0) { bad++; let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; console.log('  differs: ' + w + 'x' + h + ' ' + kind + ' ' + JSON.stringify(f) + ' (' + d + ' bytes)'); }
  }
  ok(bad === 0, `wasm and JavaScript give identical bytes in ${n} cases (${bad} differ)`);
  const x = mk(97, 61, 'noise'), plain = X.applyWasm(new Uint8ClampedArray(x), 97, 61, {}); ok(Buffer.compare(Buffer.from(plain.buffer), Buffer.from(x.buffer)) === 0, 'the plain filter changes nothing in wasm either');
  process.exit(fails ? 1 : 0);
})();
