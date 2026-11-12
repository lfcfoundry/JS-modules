// Copyright (c) 2026 LFC Foundry. MIT License.
// research driver for sess.html: fresh page per variant per round, alternating order; samples the summed resident memory (RSS) of all browser processes every 20 ms during each step and reports peak minus the level before the step.
// usage: node sessdrive.cjs browser rounds file,... blockBytes helpers variant,... (variant = name=build:mode)
const [which, rounds] = [process.argv[2], +process.argv[3]], F = process.argv[4].split(','), BB = process.argv[5], NW = process.argv[6], V = process.argv[7].split(',').map(s => { const [n, r] = s.split('='); const [b, m] = r.split(':'); return { n, b, m }; }), KIT = process.env.QA_KIT, fs = require('fs');
const PAT = which === 'chromium' ? /chrom/i : which === 'firefox' ? /firefox|Web Content|Isolated|RDD|Socket|Utility|forkserver/i : /WebKit|MiniBrowser|cog|webkit/i;
function rssMB() { let t = 0; for (const p of fs.readdirSync('/proc')) { if (!/^\d+$/.test(p) || +p === process.pid) continue; try { const c = fs.readFileSync('/proc/' + p + '/comm', 'utf8'); if (!PAT.test(c)) continue; t += +fs.readFileSync('/proc/' + p + '/statm', 'utf8').split(' ')[1] * 4096; } catch (e) {} } return t / 1048576; }
async function sampled(fn) { const base = rssMB(); let peak = base, on = true; const loop = (async () => { while (on) { peak = Math.max(peak, rssMB()); await new Promise(r => setTimeout(r, 20)); } })(); const r = await fn(); on = false; await loop; peak = Math.max(peak, rssMB()); return [r, +(peak - base).toFixed(0)]; }
(async () => { let b, ver;
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); ver = 'Firefox 158'; } else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  const res = []; for (const f of F) for (let r = 0; r < rounds; r++) for (const v of (r % 2 ? V.slice().reverse() : V)) { const c = await b.newContext(), p = await c.newPage(); await p.goto(`http://127.0.0.1:8765/sess.html#${v.b}:${f}:${v.m}:${BB}:${NW}`); await p.waitForFunction(() => !!window.LfcPack);
    await new Promise(r => setTimeout(r, 300)); const [im, imPeak] = await sampled(() => p.evaluate(() => importStep())); const [sv, svPeak] = await sampled(() => p.evaluate(() => saveStep()));
    res.push({ f, v: v.n, im, sv, imPeak, svPeak }); await c.close(); process.stderr.write('.'); }
  fs.writeFileSync(process.env.OUT || `sess-${which}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0); })().catch(e => { console.log('FAIL', e.message); process.exit(1); });
