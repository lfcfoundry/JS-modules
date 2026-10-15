#!/usr/bin/env node
// Run a fuzz-kit adapter against a page with Puppeteer (Chrome, or Firefox over WebDriver BiDi).
// MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules
//   node runner/fuzz_puppeteer.mjs URL ADAPTER.js [--seeds 1-20] [--ops 400] [--browser chrome|firefox] [--executable /path/to/browser] [--viewport 412x892]
// Needs: npm install puppeteer (and, for Firefox, `npx puppeteer browsers install firefox`, or --executable). Same behavior and output as runner/fuzz_playwright.py.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const core = fs.readFileSync(path.join(here, '..', 'src', 'fuzz-core.js'), 'utf8');
const argv = process.argv.slice(2), pos = argv.filter((x, i) => !x.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const [url, adapterPath] = pos; if (!url || !adapterPath) { console.error('usage: node runner/fuzz_puppeteer.mjs URL ADAPTER.js [--seeds 1-20] [--ops 400] [--browser chrome|firefox] [--executable PATH]'); process.exit(2); }
const adapter = fs.readFileSync(adapterPath, 'utf8'), [s0, s1] = opt('seeds', '1-10').split('-').map(Number), ops = +opt('ops', 400), [vw, vh] = opt('viewport', '412x892').split('x').map(Number);
const { default: puppeteer } = await import('puppeteer');
const browser = await puppeteer.launch({ browser: opt('browser', 'chrome'), executablePath: opt('executable', undefined) || process.env.FIREFOX || undefined, headless: true, args: ['--no-sandbox'] });
let bad = 0, total = 0; const t0 = Date.now();
for (let seed = s0; seed <= (s1 || s0); seed++) {
  const ctx = await browser.createBrowserContext(), page = await ctx.newPage(), perr = [];   // a fresh context per seed: clean storage
  await page.setViewport({ width: vw, height: vh }); page.setDefaultTimeout(240000);
  page.on('pageerror', e => perr.push('pageerror: ' + e)); page.on('console', m => { if (m.type() === 'error') perr.push('console.error: ' + m.text()); });
  const t1 = Date.now(); let r;
  try {
    await page.goto(url); await page.evaluate(core + '\n;window.Fuzzer = Fuzzer;0'); await page.evaluate(adapter + '\n;0');
    r = await page.evaluate(async (s, n) => await new Fuzzer(window.__fuzzConfig(s)).run(n), seed, ops);
  } catch (e) { r = { seed, ops: 0, fails: [{ i: -1, op: 'harness', what: 'EXC ' + String(e).slice(0, 300), tail: [] }], visited: {} }; }
  for (const e of perr.slice(0, 3)) r.fails.push({ i: -1, op: 'pageerror', what: e.slice(0, 300), tail: [] });
  total += r.ops;
  if (r.fails.length) { bad++; console.log(` FAIL seed ${seed}: ${r.fails.length} finding(s) after ${r.ops} ops`); for (const f of r.fails.slice(0, 3)) console.log('      ', JSON.stringify({ ...f, tail: f.tail.slice(-14) }).slice(0, 700)); }
  else console.log(` ok   seed ${seed}: ${r.ops} ops ${((Date.now() - t1) / 1000).toFixed(1)}s visited=${JSON.stringify(r.visited)}`);
  await ctx.close();
}
await browser.close();
console.log(`fuzz: ${(s1 || s0) - s0 + 1} seeds, ${total} ops, ${bad} seeds with findings, wall ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(bad ? 1 : 0);
