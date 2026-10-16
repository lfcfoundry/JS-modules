/* Copyright (c) 2026 LFC Foundry. MIT License.
   Builds the original (uncompressed) bytes of a fixture from its manifest entry, so the test and make.js agree and no big .raw files are stored.
   Kinds: slice (bytes of source.txt), random (seeded PRNG), run (one byte repeated), all256 (every byte value, several orders). */
'use strict';
const fs = require('fs');
const path = require('path');

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function build(g, size) {
  const b = Buffer.alloc(size);
  if (g.kind === 'slice') fs.readFileSync(path.join(__dirname, 'source.txt')).copy(b, 0, g.off, g.off + size);
  else if (g.kind === 'random') { const r = rng(g.seed); for (let i = 0; i < size; i++) b[i] = (r() * 256) | 0; }
  else if (g.kind === 'run') b.fill(g.byte);
  else if (g.kind === 'all256') for (let i = 0; i < size; i++) b[i] = i < 256 ? i : i < 512 ? 511 - i : (i * 37) & 255;
  else throw new Error('unknown fixture kind ' + g.kind);
  return b;
}
module.exports = { build, rng };
