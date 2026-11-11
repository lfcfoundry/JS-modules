// lfc-pack pool read speed, one build against another, in one real browser at a time (early-stop A/B, tools/test-runner/ab.js). Copyright (c) 2026 LFC Foundry. MIT License.
// Times pool.unpack (2 helper workers, pool made beforehand) on a generated log-like file. A = OLD build, B = the build under test with the same call;
// extra B-only lines time the 0.9.0 options (stable, stable + maxInflightBytes of 2 blocks) against the same OLD default.
// Run: OLD=/path/old/lfc-pack.js node tests/lfc-pack-pool-ab-browser.js <chromium|firefox|webkit>     Env: NEW=build under test (default modules/lfc-pack/lfc-pack.js), MB=input MB (default 24)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js'), { abSequential } = require('../tools/test-runner/ab.js');
if (!process.env.OLD) { console.log('skipped: set OLD=/path/to/older/lfc-pack.js (for example git show <ref>:modules/lfc-pack/lfc-pack.js)'); process.exit(2); }
const NEW = fs.readFileSync(process.env.NEW || path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), OLD = fs.readFileSync(process.env.OLD, 'utf8'), MB = +process.env.MB || 24;
const PAGE = `
var FILE = null, WANT = 0, P = {};
async function setup(mb) {
  var A = window.LfcOld, B = window.LfcPack; await A.init(); await B.init(); var sd = 5, rows = [], n = 0, len = 0;
  var r = function () { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  while (len < mb * 1048576) { var s = JSON.stringify({ ts: 1760000000 + n * 3 + Math.floor(r() * 3), level: ['INFO', 'WARN', 'ERROR', 'DEBUG'][Math.floor(r() * 4)], status: r() < 0.9 ? 200 : 500, user: r() < 0.3 ? null : 'u' + Math.floor(r() * 900), ms: Math.round(r() * 5000) / 100, path: '/item/' + Math.floor(r() * 5000), msg: 'request ' + n + ' took ' + Math.floor(r() * 900) + ' ms' }); rows.push(s); len += s.length + 1; n++; }
  var data = new TextEncoder().encode(rows.join('\\n') + '\\n'); FILE = A.pack(data, { blockBytes: 1048576 }); WANT = n;
  var one = Math.round(FILE.length / Math.max(1, B.info(FILE).blocks));
  P.A = await A.pool({ workers: 2 }); P.B = await B.pool({ workers: 2 }); P.Bb = await B.pool({ workers: 2, maxInflightBytes: one * 2 });
  for (var k of ['A', 'B', 'Bb']) { var x = await P[k].unpack(FILE); if (x.length !== n) throw new Error(k + ' rows ' + x.length); }
  return { rows: n, bytes: data.length, packed: FILE.length, blocks: B.info(FILE).blocks, a: A.version, b: B.version };
}
async function job(which) {
  var p = which === 'A' ? P.A : which === 'Bb' ? P.Bb : P.B, o = which === 'Bs' || which === 'Bb' ? { stable: true } : undefined;
  var t = performance.now(), x = await p.unpack(FILE, o), ms = performance.now() - t;
  if (x.length !== WANT) throw new Error('rows ' + x.length); return ms;
}`;
T.main(async (b) => {
  const srv = await T.serve({ '/ab.html': '<!doctype html><meta charset=utf-8><script>' + OLD + '</script><script>window.LfcOld = window.LfcPack;</script><script>' + NEW + '</script><script>' + PAGE + '</script>' });
  const p = await b.newPage(); let ok = true;
  try {
    await p.goto(srv.base + '/ab.html');
    const s = await p.evaluate('setup(' + MB + ')');
    console.log('file: ' + s.rows + ' rows, ' + (s.bytes / 1048576).toFixed(1) + ' MB NDJSON, ' + (s.packed / 1048576).toFixed(2) + ' MB packed, ' + s.blocks + ' blocks; A = ' + s.a + ', B = ' + s.b + '; pool.unpack, 2 helpers');
    for (const [label, bk] of [['default (same call)', 'B'], ['stable: true', 'Bs'], ['stable + maxInflightBytes 2 blocks', 'Bb']]) {
      const d = await abSequential(() => p.evaluate("job('A')"), () => p.evaluate("job('" + bk + "')"), { limit: 0.05, minRounds: 6, maxRounds: 20 });
      console.log(label + ': B/A ' + d.ratio.toFixed(3) + ' (90% range ' + d.low.toFixed(3) + '-' + d.high.toFixed(3) + '), ' + d.rounds + ' rounds, ' + d.verdict + (d.noisy ? ', noisy' : ''));
      if (bk === 'B' && d.verdict === 'slower') ok = false;
    }
  } finally { await p.close().catch(() => {}); srv.close(); }
  return ok;
});
