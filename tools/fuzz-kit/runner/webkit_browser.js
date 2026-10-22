/*!
 * webkit_browser.js: lets fuzz_puppeteer.mjs drive WebKitGTK or GNOME Web, through tools/webkit-driver.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 * Why: Puppeteer cannot drive WebKitGTK. webkit-driver speaks WebDriver to it with the same few page calls Puppeteer has, but the runner
 * also wants contexts, several arguments to evaluate(), string scripts and a way out of a hung page. This file adds just those.
 *
 *   const { launchWebkit } = require('./webkit_browser.js');
 *   const browser = await launchWebkit({ browser: 'webkitgtk' });     // or 'epiphany'
 *   console.log(await browser.version());                              // runner calls: browser.createBrowserContext().newPage(), browser.close()
 *
 * What differs from Chrome and Firefox (the runner prints these as notes):
 *   - one browser window, reused for the next seed after a clean reset (page left, local and session storage and cookies cleared); a page that
 *     hangs or does not answer ends the whole browser, and the next seed starts a fresh one
 *   - no CPU throttling, no popup / navigation / crash events, no console.debug (so --hang-trace names nothing), --init runs right after the page loads (not before its scripts)
 *   - GNOME Web refuses WebDriver clicks; the driver then sends the same input as script events (untrusted events), as webkit-driver does
 */
'use strict';
const path = require('path'), fs = require('fs');

function findDriver(given) {
  const tries = [given, process.env.WEBKIT_DRIVER, path.join(__dirname, '..', '..', 'webkit-driver', 'webkit-driver.js'), path.join(__dirname, 'webkit-driver.js')].filter(Boolean);
  for (const t of tries) { try { fs.accessSync(t); return require(path.resolve(t)); } catch (e) { /* next */ } }
  throw new Error('webkit-driver.js was not found (looked in ' + tries.join(', ') + '); pass --webkit-driver PATH or set WEBKIT_DRIVER');
}
const timeoutError = (msg) => { const e = new Error(msg); e.name = 'TimeoutError'; return e; };

// A page call that gives up after ms (a hung page can make the driver wait for ever). A give-up marks the browser dirty, so the next reset replaces it.
function guarded(state, p, ms, what) {
  let t; const gate = new Promise((_, no) => { t = setTimeout(() => { state.dirty = true; no(timeoutError(what + ' did not answer in ' + Math.round(ms / 1000) + 's')); }, ms); });
  return Promise.race([p, gate]).finally(() => clearTimeout(t));
}

function puppeteerPage(state, wd) {
  const raw = wd.page, handlers = { pageerror: [], console: [] };
  let cur = 'about:blank', initScript = null;
  raw.on('pageerror', (e) => handlers.pageerror.forEach((h) => h(e)));
  raw.on('console', (m) => handlers.console.forEach((h) => h(m)));
  const evaluate = (fn, ...args) => {
    let call;
    if (typeof fn === 'string') call = raw.evaluate(function (s) { return (0, eval)(s); }, fn);   // a string runs as a script in the page's global scope, as in Puppeteer
    else if (args.length <= 1) call = raw.evaluate(fn, args[0]);
    else call = raw.evaluate(new Function('a', 'return (' + fn.toString() + ').apply(null, a)'), args);
    return guarded(state, call, 90000, 'the page');
  };
  return {
    on(name, fn) { if (handlers[name]) handlers[name].push(fn); return this; },   // dialog / error / close / popup / framenavigated: never raised here
    setViewport(v) { return raw.setViewport({ width: v.width, height: v.height }).catch(() => { }); },
    setDefaultTimeout() { },
    evaluateOnNewDocument(src) { initScript = src; },
    async emulateCPUThrottling() { },
    async goto(u) {
      await guarded(state, raw.goto(u), 125000, 'loading the page');
      cur = await evaluate(() => location.href);
      if (initScript) await evaluate(initScript);
    },
    url() { return cur; },
    mainFrame() { return this; },
    isClosed() { return false; },
    evaluate,
    waitForFunction(fn, opts) {   // Puppeteer: (function or expression, options); the page polls, and so does a clock here, in case the page cannot
      const ms = (opts && opts.timeout) || 30000;
      return guarded(state, raw.waitForFunction(fn, null, { timeout: ms }).catch((e) => { throw /timed out/.test(String(e && e.message)) ? timeoutError(e.message) : e; }), ms + 4000, 'the page');
    },
    screenshot(o) { return guarded(state, raw.screenshot(o), 8000, 'the screenshot'); },
    mouse: raw.mouse, keyboard: raw.keyboard,
    _raw: raw
  };
}

async function launchWebkit(opts = {}) {
  const WD = findDriver(opts.driverPath), kind = opts.browser === 'epiphany' ? 'epiphany' : 'webkitgtk';
  const state = { dirty: false, wd: null, version: '' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const start = async () => {   // GNOME Web often refuses a session right after another WebKit browser ended (found in a four-browser hunt): wait a little and try again
    let last;
    for (let k = 0; k < 3; k++) {
      if (kind === 'epiphany' || k) await sleep(3000);
      try { state.wd = await WD.launch({ browser: kind, binary: opts.executablePath || undefined, width: 1280, height: 800 }); state.dirty = false; state.version = state.wd.version; return; } catch (e) { last = e; }
    }
    throw last;
  };
  const stop = async () => { const w = state.wd; state.wd = null; if (w) { try { await Promise.race([w.close(), new Promise((r) => setTimeout(r, 8000))]); } catch (e) { /* gone */ } } };
  await start();
  const reset = async () => {   // between seeds: a clean page, no saved data
    if (!state.wd) return;
    if (state.dirty) return stop();
    try {
      const r = state.wd.page;
      await guarded(state, r.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { } return 1; }), 8000, 'the page');
      await guarded(state, r.goto('about:blank'), 10000, 'leaving the page');
      await guarded(state, WD.call(state.wd.port, 'DELETE', '/session/' + state.wd.sessionId + '/cookie', undefined, 5000), 7000, 'the cookie reset').catch(() => { });
    } catch (e) { state.dirty = true; await stop(); }
  };
  return {
    version: async () => state.version,
    async createBrowserContext() {
      if (!state.wd) await start();
      return {
        async newPage() { if (!state.wd) await start(); return puppeteerPage(state, state.wd); },
        close: () => reset()
      };
    },
    close: () => stop()
  };
}

module.exports = { launchWebkit };
