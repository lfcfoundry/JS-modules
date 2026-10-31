#!/usr/bin/env node
// WebAssembly memory that lfc-pack keeps after a job (WebAssembly memory only grows; what a big pack or read leaves behind stays until the page closes). Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-memory-browser.js <chromium|firefox|webkit> [out.json]     Env: SRC=file.ndjson (the input; default: the five /tmp/stack sets joined), LIB=lfc-pack build
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const LIB = fs.readFileSync(process.env.LIB || path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8');
const HOOK = fs.readFileSync(process.env.HOOK || '/mnt/project-files/js-modules-research/breakthroughs-2026.10.31/round7-elias-fano-trim/survey/hook.js', 'utf8');
const { execSync } = require('child_process');
// resident memory of all browser processes (MB), from ps: the WebAssembly reservation itself costs nothing until its pages are touched, so this is what the device actually pays
const rss = (which) => { const pat = { chromium: /chrom/i, firefox: /firefox|Web Content|Isolated/i, webkit: /WebKit|MiniBrowser/i }[which]; let kb = 0; execSync('ps -eo rss=,args=').toString().split('\n').forEach((l) => { const m = /^\s*(\d+)\s+(.*)$/.exec(l); if (m && pat.test(m[2])) kb += +m[1]; }); return Math.round(kb / 1024); };
const SRC = process.env.SRC ? [process.env.SRC] : ['geo', 'orders', 'sensor', 'logs', 'events'].map((n) => '/tmp/stack/' + n + '.ndjson');
const PAGE = `
var src = null, MB = function (x) { return Math.round(x / 1048576 * 10) / 10; };
function mems() { WASM_MEM.gc(); return { total: MB(WASM_MEM.page()) }; }   // live WebAssembly memory of the page (the hook holds memories weakly, so a dropped instance stops counting once it is collected)
async function setup() { var parts = []; for (var i = 0; i < ${SRC.length}; i++) parts.push(new Uint8Array(await (await fetch('/src' + i)).arrayBuffer())); var n = 0; parts.forEach(function (p) { n += p.length; }); src = new Uint8Array(n); n = 0; parts.forEach(function (p) { src.set(p, n); n += p.length; }); parts = null; return { input: MB(src.length) }; }
async function doInit(ro) { var t = performance.now(); await window.LfcPack.init(ro ? { readOnly: true } : undefined); return { ms: Math.round(performance.now() - t), wasm: mems() }; }
async function step(what) {
  var t = performance.now(), f, r;
  if (what === 'pack') { f = window.LfcPack.pack(src); window._f = f; }
  else if (what === 'pack random') { f = window.LfcPack.pack(src, { access: 'random' }); window._f = f; }
  else if (what === 'unpack') { r = window.LfcPack.unpack(window._f); r = r.length; }
  else if (what === 'unpackRows') { r = window.LfcPack.unpackRows(window._f, { from: 1000, count: 100 }).length; }
  else if (what === 'drop') { window._f = null; }
  else if (what === 'trim') { window.LfcPack.trim(); }
  else if (what === 'ppack') { f = await window.LfcPack.packParallel(src); window._f = f; }
  else if (what === 'upool') { var pl = await window.LfcPack.pool(); r = await pl.unpack(window._f); r = r.length; pl.close && pl.close(); }
  else if (what === 'wait') { }
  var ms = Math.round(performance.now() - t), all = await WASM_MEM.all(400);
  return { what: what, ms: ms, file: window._f ? MB(window._f.length) : 0, wasm: { page: MB(all.page), workers: MB(all.workers), helpers: all.workerCount } };
}`;
T.main(async (b, which, outFile) => {
  const routes = { '/p.html': '<!doctype html><meta charset=utf-8><script>' + HOOK + '</script><script>' + LIB + '</script><script>' + PAGE + '</script>' };
  SRC.forEach((f, i) => { routes['/src' + i] = { body: fs.readFileSync(f), type: 'application/octet-stream' }; });
  const srv = await T.serve(routes), p = await b.newPage(); await p.goto(srv.base + '/p.html');
  const rss0 = rss(which), s = await p.evaluate(() => setup()), steps = [];
  await new Promise((r) => setTimeout(r, 1500)); s.rssPage = rss0; s.rssLoaded = rss(which);
  const ir = await p.evaluate(() => doInit(true)); s.rssInitRead = rss(which); s.initRead = ir;
  const iw = await p.evaluate(() => doInit(false)); s.rssInit = rss(which); s.init = iw;
  console.log('input', s.input, 'MB; browser RSS: page', rss0, 'MB, input loaded', s.rssLoaded, 'MB, read-only init', s.rssInitRead, 'MB (' + ir.ms + ' ms), full init', s.rssInit, 'MB (' + iw.ms + ' ms); wasm', JSON.stringify(iw.wasm));
  for (const w of (process.env.STEPS || 'pack,unpack,unpackRows,drop,pack,drop,wait,trim,wait,pack,drop,trim,wait').split(',')) { if (w === 'wait') await new Promise((res) => setTimeout(res, 3000)); const r = await p.evaluate((a) => step(a), w); r.rss = rss(which); steps.push(r); console.log(w.padEnd(12), String(r.ms).padStart(6), 'ms  file', r.file, 'MB  RSS', r.rss, 'MB  wasm', JSON.stringify(r.wasm)); }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ browser: which, setup: s, steps }, null, 1));
  await p.close().catch(() => {}); srv.close();
});
