#!/usr/bin/env node
/*!
 * fuzz-play: a robot that plays your browser game badly, on purpose, and checks the rules that must always hold.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *   npm i playwright-core            # (and have a Chromium; set CHROMIUM=/path/to/chrome if it isn't found)
 *   node fuzz-play.js --url file:///path/game.html --actions ./examples/dom-actions.js --seconds 60 --seed 1
 *
 * Options: --viewport 412x800  --throttle 4 (CPU slowdown)  --init "localStorage.setItem('k','v')"  --check-every 5
 * Exit code 1 when an invariant failed, a page error was thrown, or a stuck state was reported.
 *
 * An actions file exports:
 *   actions:    [{ name, weight, run: async (page, rnd) => {} }, ...]       rnd() is a seeded 0..1 generator
 *   invariants: async (page) => ['what is wrong', ...]                      checked every few actions (default: DEFAULT_INVARIANTS)
 *   stuck:      async (page) => 'description' | ''                         optional: a state that must not last more than stuckMs
 */
const path = require('path');

function arg(name, d) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d; }
function seeded(s) { return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// Checks that work on any page: no NaN / undefined / Infinity / [object in visible text.
const DEFAULT_INVARIANTS = async (page) => page.evaluate(() => {
  const out = [], t = document.body.innerText;
  const m = t.match(/.{0,30}(NaN|undefined|Infinity|\[object).{0,30}/);
  if (m) out.push('TEXT shows ' + m[0].replace(/\n/g, ' '));
  return out;
});

(async () => {
  const { chromium } = require('playwright-core');
  const url = arg('url'); if (!url) { console.error('need --url'); process.exit(2); }
  const mod = require(path.resolve(arg('actions', path.join(__dirname, 'examples/dom-actions.js'))));
  const secs = +arg('seconds', 60), seed = +arg('seed', 1), every = +arg('check-every', 5), thr = +arg('throttle', 1);
  const [vw, vh] = arg('viewport', '412x800').split('x').map(Number);
  const rnd = seeded(seed * 7919 + 1);
  const exe = process.env.CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: vw < 600, isMobile: vw < 600 });
  const page = await ctx.newPage();
  const log = [], bad = [], errs = [];
  page.on('pageerror', e => errs.push(('PAGEERR ' + e.message + ' || last: ' + log.slice(-4).join(',')).slice(0, 400)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  if (arg('init')) await page.addInitScript(arg('init'));
  if (thr > 1) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: thr }); }
  await page.goto(url); await page.waitForTimeout(800);

  const actions = mod.actions, total = actions.reduce((a, x) => a + (x.weight || 1), 0);
  const invariants = mod.invariants || DEFAULT_INVARIANTS;
  const stuckMs = mod.stuckMs || 6000;
  let n = 0, stuckSince = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    let x = rnd() * total, k = 0; while (x > (actions[k].weight || 1)) { x -= actions[k].weight || 1; k++; }
    try { await actions[k].run(page, rnd); } catch (e) { log.push('ACTERR ' + actions[k].name + ' ' + e.message.split('\n')[0].slice(0, 80)); }
    n++; log.push(actions[k].name);
    if (n % every === 0) {
      const found = await invariants(page).catch(e => ['INVARIANT-ERR ' + e.message.slice(0, 80)]);
      if (found.length) bad.push('#' + n + ' after ' + log.slice(-6).join(',') + ': ' + found.join(' | '));
      if (mod.stuck) {
        const s = await mod.stuck(page).catch(() => '');
        if (s) { if (!stuckSince) stuckSince = Date.now(); else if (Date.now() - stuckSince > stuckMs) { bad.push('STUCK ' + s + ' after ' + log.slice(-8).join(',')); stuckSince = 0; } } else stuckSince = 0;
      }
    }
  }
  const result = { seed, actions: n, errors: [...new Set(errs)].slice(0, 6), failures: [...new Set(bad)].slice(0, 12), lastActions: log.slice(-5) };
  console.log(JSON.stringify(result, null, 1));
  await browser.close();
  process.exit(result.errors.length || result.failures.length ? 1 : 0);
})();
