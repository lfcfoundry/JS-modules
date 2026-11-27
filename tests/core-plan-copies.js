#!/usr/bin/env node
// The modules that start helper workers carry a small copy of the core-plan rule (planHelpers) so each stays one file with no dependency.
// This check pulls each copy out of its file and compares it with modules/core-plan for many devices. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..');
const CP = require(root + '/modules/core-plan/core-plan.js');
const FILES = ['modules/text-columns/text-columns.js', 'modules/graph-walk/graph-walk.js', 'modules/gpu-blur/gpu-blur.js', 'modules/pcodec-js/pcodec-js.js',
  'modules/pcodec-js/pcodec-js-fast.js', 'modules/pcodec-js/pcodec-js-pack.js', 'modules/lfc-pack/lfc-pack.js', 'modules/memory-compression/memory-compression.js'];
let fails = 0, checks = 0;
for (const f of FILES) {
  const s = fs.readFileSync(path.join(root, f), 'utf8'), i = s.indexOf('function planHelpers(');
  if (i < 0) { fails++; console.log('FAIL ' + f + ': no planHelpers'); continue; }
  let depth = 0, j = s.indexOf('{', i);
  for (let k = j; k < s.length; k++) { if (s[k] === '{') depth++; else if (s[k] === '}' && --depth === 0) { j = k + 1; break; } }
  const src = s.slice(i, j);
  for (const t of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64, 128]) for (const mem of [0, 0.5, 1, 2, 4, 8, 16]) for (const keep of [0, 1]) {
    const nav = { hardwareConcurrency: t }; if (mem) nav.deviceMemory = mem;
    const got = new Function('navigator', 'process', 'require', src + '; return planHelpers(' + keep + ');')(nav, undefined, undefined);
    const want = CP.plan({ env: CP.detect(nav), keepFree: keep }).workers;
    checks++; if (got !== want) { fails++; if (fails < 10) console.log('FAIL ' + f + ': ' + t + ' threads, ' + (mem || 'no') + ' GB, keep ' + keep + ': ' + got + ', core-plan says ' + want); }
    if (/planHelpers\(keep, cap, threads\)/.test(src)) {   // the threads variant (graph-walk): every thread counted as a core
      const gotT = new Function('navigator', 'process', 'require', src + '; return planHelpers(' + keep + ', 8, true);')(nav, undefined, undefined), e = CP.detect(nav); e.cores = e.logical;
      const wantT = CP.plan({ env: e, keepFree: keep }).workers;
      checks++; if (gotT !== wantT) { fails++; if (fails < 10) console.log('FAIL ' + f + ' (threads): ' + t + ' threads, ' + (mem || 'no') + ' GB, keep ' + keep + ': ' + gotT + ', core-plan with every thread says ' + wantT); }
    }
  }
}
console.log(fails ? fails + ' FAILED of ' + checks : 'every planHelpers copy agrees with core-plan (' + FILES.length + ' files, ' + checks + ' checks)');
process.exit(fails ? 1 : 0);
