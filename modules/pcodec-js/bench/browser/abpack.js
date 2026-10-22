// Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.3.0 numbers; it needs the test browsers installed (see the repository QA notes).
// node abpack.js chromium|firefox|webkit|epiphany out.json
// A/B pack timing: libs named in LIBS (comma list of id=path) take turns packing the same 12 columns (alternating order), median of ROUNDS rounds (first round is warm-up).
// Checks that every lib writes the same bytes as the first one.
'use strict';
const fs = require('fs'), W = '/tmp/claude-0/pcm/work/';
process.env.NFM_PUPPETEER = process.env.NFM_PUPPETEER || '/tmp/esb/node_modules/puppeteer-core';
process.env.NFM_PLAYWRIGHT = process.env.NFM_PLAYWRIGHT || '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = process.env.NFM_FIREFOX || '/home/claude/browsers/firefox/firefox';
process.env.NFM_CHROME = process.env.NFM_CHROME || '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js');
const open = async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } };
const man = JSON.parse(fs.readFileSync(W + 'cols.json')), bin = fs.readFileSync(W + 'cols.bin');
const PICK = [/NFM node x, Distances/, /links.to/, /links.weight/, /links.x1/, /events.ts/, /^temperature/, /^price/, /geojson/, /kWh/, /housing median_income/, /quakes Latitude/, /events.user/];
const cols = PICK.map((r) => man.find((m) => r.test(m.name)));
const libs = (process.env.LIBS || '').split(',').filter(Boolean).map((s) => { const [id, p] = s.split('='); return { id, src: fs.readFileSync(p, 'utf8') }; });
const arg = { libs, cols: cols.map((m) => ({ name: m.name, kind: m.kind, n: m.n, b64: bin.subarray(m.off, m.off + m.bytes).toString('base64') })), rounds: +process.env.ROUNDS || 9, level: +process.env.LEVEL || 8, opts: JSON.parse(process.env.OPTS || '{}') };
async function inPage(arg) {
  const T = { f64: Float64Array, i32: Int32Array, f32: Float32Array, u32: Uint32Array, i16: Int16Array, u16: Uint16Array };
  const data = arg.cols.map((c) => { const s = atob(c.b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T[c.kind](u.buffer); });
  const mk = async (l) => { const fake = {}; new Function('self', l.src)(fake); const pc = await fake.PcodecJS.load(); return pc; };
  const P = {}; for (const l of arg.libs) P[l.id] = await mk(l);
  const fnv = (u8) => { let h = 2166136261 >>> 0; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
  const res = { ids: arg.libs.map((l) => l.id), times: {}, hash: {}, bytes: {} }; arg.libs.forEach((l) => res.times[l.id] = []);
  for (let r = 0; r < arg.rounds; r++) {
    const ids = arg.libs.map((l) => l.id), k = r % ids.length, order = ids.slice(k).concat(ids.slice(0, k));   // every version takes every place in the order
    for (const id of order) {
      const t0 = performance.now(); let tot = 0, h = 0;
      const outs = data.map((a) => P[id].pack(a, Object.assign({ level: arg.level }, arg.opts[id] || {})));
      const dt = performance.now() - t0;
      if (r === 0) { outs.forEach((o) => { tot += o.length; h = (h * 31 + fnv(o)) >>> 0; }); res.hash[id] = h; res.bytes[id] = tot; } else res.times[id].push(dt);
    }
  }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  res.medianMs = {}; for (const id of res.ids) res.medianMs[id] = +med(res.times[id]).toFixed(1);
  res.same = res.ids.every((id) => res.hash[id] === res.hash[res.ids[0]]);
  res.ua = navigator.userAgent; return res;
}
(async () => {
  const which = process.argv[2], D = await open(which, { timeout: 1800000 }); await D.goto('about:blank');
  const t0 = Date.now(); const out = await D.page.evaluate(inPage, arg); const version = D.version; await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, wallSeconds: (Date.now() - t0) / 1000, out }, null, 1));
  console.log(which, version, 'wall s', ((Date.now() - t0) / 1000).toFixed(1), 'median ms per round of 12 columns:', JSON.stringify(out.medianMs), 'same bytes:', out.same, 'packed bytes:', JSON.stringify(out.bytes));
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
