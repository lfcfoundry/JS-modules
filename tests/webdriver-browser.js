// A small Puppeteer-shaped browser over plain WebDriver, for WebKitGTK and GNOME Web. Copyright (c) 2026 LFC Foundry. MIT License.
// Playwright and Puppeteer cannot drive WebKitGTK; WebKitWebDriver can. This file offers only the calls this repository's browser checks use
// (goto, reload, evaluate, click, mouse, keyboard, touchscreen, waitForFunction, waitForSelector, select, setViewport, errs), so the same
// check files run in Firefox, Chromium and WebKitGTK. Setup is in the `browsers` branch README (install.sh as root; WebKitWebDriver, xvfb-run,
// dbus-run-session). Run WebKit alone: `WEBKIT=1 node tests/pieces-browser.js`  (`WEBKIT=epiphany` for GNOME Web, which refuses WebDriver clicks,
// so `click` and `mouse.click` fall back to a script click there).
// Honest limits: the smallest page width WebKitGTK's MiniBrowser window allows is 447 px (the checks ask for 412);
// errors are collected by a handler installed after the page loads, so an error thrown during load is not seen;
// a script click is not a real pointer click.
'use strict';
const { spawn, spawnSync } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EL = 'element-6066-11e4-a37c-c4d0b5a6c8cf';
const KEYS = { Enter: '', Escape: '', Tab: '', Backspace: '', ArrowUp: '', ArrowDown: '', ArrowLeft: '', ArrowRight: '', Space: ' ', Shift: '', Control: '', Alt: '', Home: '', End: '', PageUp: '', PageDown: '' };

// Re-run the whole Node process inside a virtual screen and a private session bus (the browser needs both). Returns only in the inner copy.
function ensureDisplay() {
  if (process.env._WK_INNER === '1') return;
  for (const t of ['WebKitWebDriver', 'xvfb-run', 'dbus-run-session']) {
    if (spawnSync('sh', ['-c', 'command -v ' + t]).status !== 0) { console.error('skipped: ' + t + ' is missing (run kb-browsers/install.sh as root)'); process.exit(2); }
  }
  const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1280x1024x24', 'dbus-run-session', '--', process.execPath].concat(process.argv.slice(1)),
    { stdio: 'inherit', env: Object.assign({}, process.env, { _WK_INNER: '1', GTK_A11Y: 'none', WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: '1' }) });
  process.exit(r.status === null ? 1 : r.status);
}

async function launch(kind) {
  const port = 4444 + (process.pid % 500);
  const drv = spawn('WebKitWebDriver', ['--port=' + port], { stdio: 'ignore' });
  const call = async (method, path, body) => {
    const res = await fetch('http://127.0.0.1:' + port + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((j.value && (j.value.message || j.value.error)) || ('HTTP ' + res.status));
    return j.value;
  };
  await sleep(1000);
  const opts = kind === 'epiphany' ? { browserName: 'Epiphany', 'webkitgtk:browserOptions': { binary: '/usr/bin/epiphany', args: ['--automation-mode'] } } : {};
  const s = await call('POST', '/session', { capabilities: { alwaysMatch: opts } });
  const sid = s.sessionId, base = '/session/' + sid;
  await call('POST', base + '/timeouts', { script: 120000, pageLoad: 60000 });
  const scriptClick = kind === 'epiphany';
  let touchId = 0;

  const exec = async (fn, args) => {
    const body = typeof fn === 'function' ? '(' + fn.toString() + ')' : '(function(){ return (' + fn + '); })';
    const script = 'var a = Array.prototype.slice.call(arguments), done = a.pop();' +
      'try { Promise.resolve(' + body + '.apply(null, a)).then(function (v) { done({ v: v === undefined ? null : v }); }, function (e) { done({ e: String(e && e.message || e) }); }); }' +
      'catch (e) { done({ e: String(e && e.message || e) }); }';
    const r = await call('POST', base + '/execute/async', { script, args });
    if (r && r.e) throw new Error(r.e);
    return r ? r.v : null;
  };
  const actions = (type, id, params, list) => call('POST', base + '/actions', { actions: [Object.assign({ type, id }, params ? { parameters: params } : {}, { actions: list })] });
  const key = k => (KEYS[k] !== undefined ? KEYS[k] : k);

  const browser = {
    async version() { return 'WebKitGTK ' + s.capabilities.browserVersion + ' (' + s.capabilities.browserName + ')'; },
    async newPage() {
      const p = { errs: [], _x: 0, _y: 0, _handlers: {} };
      p.on = (ev, fn) => { p._handlers[ev] = fn; };
      const pull = async () => {
        try { const e = await exec(() => { const r = window.__wdErrs || []; window.__wdErrs = []; return r; }, []); for (const m of e) p.errs.push(m); } catch (e) { /* page is changing */ }
      };
      const arm = () => exec(() => { if (window.__wdArmed) return; window.__wdArmed = true; window.__wdErrs = [];
        window.addEventListener('error', e => window.__wdErrs.push(String(e.message || e.error))); window.addEventListener('unhandledrejection', e => window.__wdErrs.push(String(e.reason && e.reason.message || e.reason)));
        const ce = console.error; console.error = function () { window.__wdErrs.push('console: ' + Array.prototype.join.call(arguments, ' ')); return ce.apply(console, arguments); }; }, []);
      p.setViewport = async ({ width, height }) => {
        let w = width + 40, h = height + 140, prev = null;
        for (let i = 0; i < 4; i++) {        // the window is resized a moment after the call returns; measure and correct until the page area is right
          await call('POST', base + '/window/rect', { x: 0, y: 0, width: w, height: h }); await sleep(300);
          const m = await exec(() => [innerWidth, innerHeight], []);
          if (m[0] === width && m[1] === height) return;
          if (prev && prev[0] === m[0] && prev[1] === m[1]) return;   // the window has a minimum size (WebKitGTK's MiniBrowser: 447 px wide); accept it
          prev = m;
          w += width - m[0]; h += height - m[1];
        }
      };
      p.goto = async url => { await call('POST', base + '/url', { url }); await arm(); };
      p.reload = async () => { await call('POST', base + '/refresh', {}); await arm(); };
      p.evaluate = async (fn, ...args) => { const r = await exec(fn, args); await pull(); return r; };
      p.waitForFunction = async (fn, o, ...args) => { const t0 = Date.now(), lim = (o && o.timeout) || 30000;
        for (;;) { const r = await exec(fn, args); if (r) return r; if (Date.now() - t0 > lim) throw new Error('waitForFunction timed out'); await sleep(100); } };
      p.waitForSelector = (sel, o) => p.waitForFunction(s2 => !!document.querySelector(s2), o, sel);
      const find = async sel => { const e = await call('POST', base + '/element', { using: 'css selector', value: sel }); return e[EL] || Object.values(e)[0]; };
      p.click = async sel => {
        const id = await find(sel);
        if (scriptClick) await exec(s2 => document.querySelector(s2).click(), [sel]); else await call('POST', base + '/element/' + id + '/click', {});
        await pull();
      };
      p.select = async (sel, v) => { await exec((s2, v2) => { const el = document.querySelector(s2); el.value = v2; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]); await pull(); };
      const mv = (x, y) => ({ type: 'pointerMove', x: Math.round(x), y: Math.round(y), origin: 'viewport', duration: 0 });
      p.mouse = {
        async move(x, y, o) { const n = Math.max(1, (o && o.steps) || 1), x0 = p._x, y0 = p._y;
          for (let i = 1; i <= n; i++) await actions('pointer', 'mouse', { pointerType: 'mouse' }, [mv(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n)]);
          p._x = x; p._y = y; },
        async down() { await actions('pointer', 'mouse', { pointerType: 'mouse' }, [{ type: 'pointerDown', button: 0 }]); },
        async up() { await actions('pointer', 'mouse', { pointerType: 'mouse' }, [{ type: 'pointerUp', button: 0 }]); },
        async click(x, y) { await p.mouse.move(x, y); if (scriptClick) await exec((x2, y2) => { const el = document.elementFromPoint(x2, y2); if (el) el.click(); }, [x, y]); else { await p.mouse.down(); await p.mouse.up(); } }
      };
      p.keyboard = {
        async down(k) { await actions('key', 'kbd', null, [{ type: 'keyDown', value: key(k) }]); },
        async up(k) { await actions('key', 'kbd', null, [{ type: 'keyUp', value: key(k) }]); },
        async press(k) { await actions('key', 'kbd', null, [{ type: 'keyDown', value: key(k) }, { type: 'keyUp', value: key(k) }]); }
      };
      const tid = 'finger' + (touchId++);
      p.touchscreen = {
        async touchStart(x, y) { await actions('pointer', tid, { pointerType: 'touch' }, [mv(x, y), { type: 'pointerDown', button: 0 }]); p._x = x; p._y = y; },
        async touchMove(x, y) { await actions('pointer', tid, { pointerType: 'touch' }, [mv(x, y)]); p._x = x; p._y = y; },
        async touchEnd() { await actions('pointer', tid, { pointerType: 'touch' }, [{ type: 'pointerUp', button: 0 }]); }
      };
      p.close = async () => {};
      await call('POST', base + '/url', { url: 'about:blank' });
      return p;
    },
    async close() { try { await call('DELETE', base); } catch (e) { /* the browser may exit before it answers */ } drv.kill(); }
  };
  return browser;
}
module.exports = { launch, ensureDisplay };
