/* Copyright (c) 2026 LFC Foundry. MIT License.
   Makes the fixtures of the ppmd-decode test with the C reference encoder (7-Zip's Ppmd7.c / Ppmd7Enc.c, public domain, by Igor Pavlov).
   You only need this to change the fixtures; the test itself needs nothing but Node.
     gcc -O2 -o /tmp/ppmd7enc encode.c Ppmd7.c Ppmd7Enc.c      (add -I for the folder with Ppmd7.h; encode.c is in this folder)
     node make.js /tmp/ppmd7enc
   Usage of the encoder: ppmd7enc INFILE OUTFILE ORDER MEMBYTES  (writes the raw 7z-style stream, which starts with a zero byte).
   source.txt is 30,000 bytes cut from files of this repository (HTML with CSS, JavaScript, Markdown prose, more HTML with a script);
   it is kept as a file so the fixtures do not depend on those files staying the same. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { build } = require('./gen.js');
const enc = process.argv[2];
if (!enc) { console.log('usage: node make.js /path/to/ppmd7enc'); process.exit(2); }
const K = 1024;
const S = (off) => ({ kind: 'slice', off });
const cases = [
  ['empty',        0,      6, 1024 * K, S(0)],
  ['one-byte',     1,     12, 1024 * K, S(0)],
  ['two-bytes',    2,      2, 64 * K, S(0)],
  ['html-100',     100,    6, 2048, S(2000)],                // the smallest memory the format allows
  ['js-5000',      5000,  12, 64 * K, S(9000)],
  ['page-30k-o2',  30000,  2, 1024 * K, S(0)],
  ['page-30k-o6',  30000,  6, 1024 * K, S(0)],
  ['page-30k-o12', 30000, 12, 64 * K, S(0)],                 // the model restarts several times
  ['page-30k-o32', 30000, 32, 64 * K, S(0)],
  ['page-30k-o64', 30000, 64, 1024 * K, S(0)],
  ['page-12k-m2048', 12000, 8, 2048, S(0)],                  // restarts all the time
  ['page-30k-odd', 30000, 16, 100003, S(0)],                 // memory that is not a multiple of 4
  ['random-20k',   20000,  6, 64 * K, { kind: 'random', seed: 7 }],
  ['run-50k',      50000, 16, 16384 * K, { kind: 'run', byte: 65 }],
  ['all-bytes',    768,    8, 1024 * K, { kind: 'all256' }],
];
const man = [];
const tmp = path.join(require('os').tmpdir(), 'ppmd-make-' + process.pid);
for (const [name, size, order, mem, g] of cases) {
  fs.writeFileSync(tmp, build(g, size));
  execFileSync(enc, [tmp, tmp + '.out', String(order), String(mem)]);
  const file = name + '.ppmd';
  fs.copyFileSync(tmp + '.out', path.join(__dirname, file));
  man.push({ name, order, mem, size, file, gen: g });
}
fs.unlinkSync(tmp); fs.unlinkSync(tmp + '.out');
fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(man, null, 1) + '\n');
console.log(man.length + ' fixtures written');
