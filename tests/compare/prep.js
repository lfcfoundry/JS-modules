// Builds the competitor files the comparison tests use. Copyright (c) 2026 LFC Foundry. MIT License.
// LIBS=<folder with node_modules holding puppeteer-core, esbuild, terser, lzma, driver.js, shepherd.js, intro.js, tab-election, broadcast-channel>; writes to $COMPARE_DIST (default: the system temp folder).
// The libraries are only measured here, never copied into this repository. Run by the compare scripts; safe to run twice.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
function prep(opts) {
  const LIBS = process.env.LIBS, out = process.env.COMPARE_DIST || path.join(os.tmpdir(), 'lfc-compare-dist');
  if (!LIBS) throw new Error('needs LIBS=<folder with node_modules>');
  const NM = fs.existsSync(path.join(LIBS, 'node_modules')) ? path.join(LIBS, 'node_modules') : LIBS;
  fs.mkdirSync(out, { recursive: true });
  const es = require(path.join(NM, 'esbuild')), terser = path.join(NM, '.bin', 'terser');
  const bundle = (entry, name, extra) => { const f = path.join(out, name + '.js'); es.buildSync(Object.assign({ entryPoints: [entry], bundle: true, minify: true, outfile: f, logLevel: 'error' }, extra || {})); return f; };
  const mini = (f) => { const o = f.replace(/\.js$/, '.t.js'); cp.execFileSync(terser, [f, '-c', 'passes=2', '-m', '--comments', 'false', '-o', o]); return o; };
  const size = (f) => { const b = fs.readFileSync(f); return [b.length, require('zlib').gzipSync(b, { level: 9 }).length]; };
  return { NM, out, bundle, mini, size, es };
}
module.exports = prep;
