// Copyright (c) 2026 LFC Foundry. MIT License.
// Runs tester.html in one test browser: all checks must pass; reports the module's size and its load cost over fresh pages.
//   node tools/test-runner/cli.js all modules/lfc-pack/go-reader/web/browser-check.js     (or: node browser-check.js chromium|firefox|webkit)
// Env: REPS (default 5). Costs are medians over fresh pages; load = running the script file, init = unpack + compile + start the Go runtime.
'use strict';
const fs = require('fs'), path = require('path'), T = require('../../../../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..', '..') + '/', REPS = +(process.env.REPS || 5), r1 = (x) => Math.round(x * 10) / 10;
T.main(async (b, which, outFile) => {
  const srv = await T.serve({
    '/go-reader/web/tester.html': fs.readFileSync(root + 'go-reader/web/tester.html'),
    '/lfc-pack.js': { body: fs.readFileSync(root + 'lfc-pack.js'), type: 'text/javascript' },
    '/go-reader/web/lfcp-go.js': { body: fs.readFileSync(root + 'go-reader/web/lfcp-go.js'), type: 'text/javascript' }
  });
  const rows = [];
  for (let i = 0; i < REPS + 1; i++) {   // the first page also warms the disk cache of the browser; it is dropped
    const res = await T.pageResult(b, srv.base + '/go-reader/web/tester.html', '__lfcpResult', 60);
    if (res.error || res.fails) { console.log('FAIL', JSON.stringify(res).slice(0, 400)); srv.close(); return false; }
    if (i) rows.push(res);
  }
  srv.close();
  const med = (k) => r1(T.median(rows.map((r) => r[k])));
  const out = { browser: which, version: b.version ? await b.version() : '', checks: rows[0].checks, fails: 0, reps: REPS, goLoadMs: med('goLoadMs'), goInitMs: med('initMs'), jsLoadMs: med('jsLoadMs'), jsInitMs: med('jsInitMs'),
    moduleBytes: fs.statSync(root + 'go-reader/web/lfcp-go.js').size, wasmBytes: fs.statSync(root + 'go-reader/web/lfcp.wasm').size, wasmGzBytes: fs.statSync(root + 'go-reader/web/lfcp.wasm.gz').size };
  console.log(JSON.stringify(out));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  return true;
});
