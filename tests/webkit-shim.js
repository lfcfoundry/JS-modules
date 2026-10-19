// Lets the browser checks in this folder run in WebKitGTK or GNOME Web. Copyright (c) 2026 LFC Foundry. MIT License.
// The driver is tools/webkit-driver (WebDriver, no packages). It offers the main Playwright and Puppeteer page calls; the checks here also use
// a few more, which this file adds on top: click(selector), select, reload, waitForSelector, keyboard.down/up, touchscreen, newPage/close, and
// evaluate with several arguments. Two stand-ins to know about: key down/up and touch are sent as page events (WebKitGTK's WebDriver has no
// separate key-down or touch call here), so a touch check in WebKit is done with the mouse.
'use strict';
const WD = require('../tools/webkit-driver/webkit-driver.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function wrap(p, size) {
  const evalOne = p.evaluate.bind(p);
  p.evaluate = (fn, ...args) => {
    if (typeof fn !== 'function' || args.length <= 1) return evalOne(fn, args[0]);
    const w = function () {}; w.toString = () => 'function (a) { return (' + fn.toString() + ').apply(null, a); }';   // several arguments travel as one array
    return evalOne(w, args);
  };
  p.errs = [];
  p.setViewport = (function (orig) { return v => orig(v); })(p.setViewport.bind(p));
  p.click = async sel => {
    const r = await evalOne(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
    if (!r) throw new Error('no element for ' + sel);
    await p.mouse.click(r.x, r.y);
  };
  p.select = (sel, v) => evalOne(a => { const e = document.querySelector(a[0]); e.value = a[1]; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  p.reload = async () => { const u = await evalOne(() => location.href); await p.goto('about:blank'); await p.goto(u); };
  p.waitForSelector = (sel, o) => p.waitForFunction(s => !!document.querySelector(s), sel, o);
  const key = (type, k) => evalOne(a => { const t = document.activeElement || document.body; t.dispatchEvent(new KeyboardEvent(a[0], { key: a[1] === 'Space' ? ' ' : a[1], bubbles: true, cancelable: true })); }, [type, k]);
  p.keyboard.down = k => key('keydown', k); p.keyboard.up = k => key('keyup', k);
  p.touchscreen = { touchStart: async (x, y) => { await p.mouse.move(x, y); await p.mouse.down(); }, touchMove: (x, y) => p.mouse.move(x, y), touchEnd: () => p.mouse.up() };
  p.close = async () => {};
  return p;
}

async function launch(kind) {
  const b = await WD.launch({ browser: kind === 'epiphany' ? 'epiphany' : 'webkitgtk', width: 1280, height: 800 });
  const p = wrap(b.page);
  return {
    version: async () => 'WebKitGTK ' + b.version,
    newPage: async () => { await p.goto('about:blank'); p.errs = []; return p; },
    close: () => b.close()
  };
}
// Takes a browser a warm daemon (tools/test-runner/cli.js warm start) already holds: info is { port, sessionId, version }.
async function attach(info) {
  const b = await WD.attach(info), p = wrap(b.page);
  return {
    version: async () => 'WebKitGTK ' + info.version,
    newPage: async () => { await p.goto('about:blank'); p.errs = []; return p; },
    close: () => b.close()
  };
}
module.exports = { launch, attach, sleep };
