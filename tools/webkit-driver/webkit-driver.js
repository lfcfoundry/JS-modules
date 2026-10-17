/*!
 * webkit-driver.js: drive WebKitGTK (or GNOME Web) from Node with the same small page controls Playwright and Puppeteer give.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 * Why: Playwright and Puppeteer cannot drive WebKitGTK (Playwright only drives its own patched WebKit build). WebKitGTK ships its own
 * WebDriver (`WebKitWebDriver`). This file speaks the W3C WebDriver protocol to it over plain HTTP, with no packages.
 *
 *   var WD = require('./webkit-driver.js');
 *   var b = await WD.launch({ width: 1280, height: 800 });          // { browser: 'epiphany' } for GNOME Web
 *   await b.page.goto('file:///path/to/page.html');
 *   var n = await b.page.evaluate(function (x) { return document.title.length + x; }, 2);
 *   await b.page.waitForFunction(function () { return window.ready; }, null, { timeout: 5000 });
 *   await b.page.mouse.click(100, 100); await b.page.keyboard.press('Escape');
 *   await b.close();
 *
 * Needs (Linux): WebKitWebDriver, and xvfb-run + dbus-run-session when there is no display. The test browsers branch of the knowledge base installs them.
 */
'use strict';
var http = require('http'), net = require('net'), cp = require('child_process'), fs = require('fs'), path = require('path');

var KEYS = { Enter: '', Tab: '', Escape: '', Backspace: '', Delete: '', ArrowLeft: '', ArrowUp: '', ArrowRight: '', ArrowDown: '',
  Home: '', End: '', PageUp: '', PageDown: '', Space: ' ', Shift: '', Control: '', Alt: '', Meta: '' };
function keyChar(k) { return KEYS[k] !== undefined ? KEYS[k] : k; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/** One WebDriver call. Resolves to the protocol's `value`; rejects with an Error that carries the driver's error name and message. */
function call(port, method, url, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    var req = http.request({ host: '127.0.0.1', port: port, method: method, path: url, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, function (res) {
      var chunks = []; res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var txt = Buffer.concat(chunks).toString('utf8'), j;
        try { j = txt ? JSON.parse(txt) : { value: null }; } catch (e) { return reject(new Error('WebDriver answered with something that is not JSON: ' + txt.slice(0, 200))); }
        var v = j.value;
        if (res.statusCode >= 400 || (v && typeof v === 'object' && v.error)) { var e = new Error((v && v.error ? v.error + ': ' : '') + ((v && v.message) || 'HTTP ' + res.statusCode)); e.wdError = v && v.error; return reject(e); }
        resolve(v);
      });
    });
    req.on('error', reject);
    if (timeoutMs) req.setTimeout(timeoutMs, function () { req.destroy(new Error('WebDriver call timed out after ' + timeoutMs + ' ms: ' + method + ' ' + url)); });
    if (data) req.write(data); req.end();
  });
}

function freePort() {
  return new Promise(function (resolve, reject) { var s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { resolve(p); }); }); });
}
function which(cmd) {
  var dirs = String(process.env.PATH || '').split(path.delimiter);
  for (var i = 0; i < dirs.length; i++) { var f = path.join(dirs[i], cmd); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch (e) { /* next */ } }
  return null;
}

/** The script run inside the page for evaluate(): calls the function with one JSON argument, waits for a promise, and answers with a JSON string
 *  (so big arrays and odd values do not depend on the driver's own object walking) plus the console errors and page errors seen since the last call. */
function wrapScript(fnSource) {
  return 'var cb = arguments[arguments.length - 1], arg = arguments[0];' +
    'if (!window.__wd) { var L = window.__wd = { l: [] }; window.addEventListener("error", function (e) { L.l.push({ k: "pageerror", m: String(e.message || e) }); });' +
    ' window.addEventListener("unhandledrejection", function (e) { L.l.push({ k: "pageerror", m: "unhandled rejection: " + String(e.reason && e.reason.message || e.reason) }); });' +
    ' var ce = console.error; console.error = function () { try { L.l.push({ k: "console", t: "error", m: Array.prototype.map.call(arguments, String).join(" ") }); } catch (x) { } return ce.apply(console, arguments); }; }' +
    'var done = function (o) { o.l = window.__wd.l.splice(0); var s; try { s = JSON.stringify(o); } catch (x) { s = JSON.stringify({ e: "the answer cannot be turned into JSON: " + x.message, l: o.l }); } cb(s); };' +
    'try { Promise.resolve((' + fnSource + ')(arg)).then(function (v) { done({ v: v === undefined ? null : v }); }, function (e) { done({ e: String(e && e.message || e) + (e && e.stack ? "\\n" + e.stack : "") }); }); }' +
    ' catch (x) { done({ e: String(x && x.message || x) }); }';
}

/** Runs in the page: plays an action list as DOM events (used when the driver has no actions). Pointer position is where the last pointerMove left it. */
function synthInput(job) {
  var at = job.at, down = job.down;
  var fire = function (type, ext) {
    var t = document.elementFromPoint(at.x, at.y) || document.body, o = { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true, button: 0, buttons: down ? 1 : 0, view: window };
    for (var k in ext) o[k] = ext[k];
    t.dispatchEvent(type === 'wheel' ? new WheelEvent(type, o) : new MouseEvent(type, o));
  };
  job.a.forEach(function (src) {
    src.actions.forEach(function (x) {
      if (x.type === 'pointerMove') { at = { x: x.x, y: x.y }; fire('mousemove', {}); }
      else if (x.type === 'pointerDown') { down = true; fire('mousedown', {}); }
      else if (x.type === 'pointerUp') { fire('mouseup', {}); down = false; fire('click', { buttons: 0 }); }
      else if (x.type === 'scroll') { at = { x: x.x, y: x.y }; fire('wheel', { deltaX: x.deltaX, deltaY: x.deltaY }); }
      else if (x.type === 'keyDown' || x.type === 'keyUp') {
        var names = { '\uE007': 'Enter', '\uE004': 'Tab', '\uE00C': 'Escape', '\uE003': 'Backspace', '\uE017': 'Delete', '\uE012': 'ArrowLeft', '\uE013': 'ArrowUp', '\uE014': 'ArrowRight', '\uE015': 'ArrowDown', '\uE011': 'Home', '\uE010': 'End', '\uE00E': 'PageUp', '\uE00F': 'PageDown', '\uE008': 'Shift', '\uE009': 'Control', '\uE00A': 'Alt', '\uE03D': 'Meta' };
        (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(x.type === 'keyDown' ? 'keydown' : 'keyup', { key: names[x.value] || x.value, bubbles: true, cancelable: true }));
      }
    });
  });
  return true;
}
function makePage(port, sid) {
  var handlers = { pageerror: [], console: [] }, mouseAt = { x: 0, y: 0 }, mouseDown = false;
  var url = function (p) { return '/session/' + sid + p; };
  var emit = function (logs) {
    (logs || []).forEach(function (e) {
      if (e.k === 'pageerror') handlers.pageerror.forEach(function (h) { h(new Error(e.m)); });
      else handlers.console.forEach(function (h) { h({ type: function () { return e.t; }, text: function () { return e.m; } }); });
    });
  };
  var page = {
    on: function (name, fn) { if (handlers[name]) handlers[name].push(fn); return page; },
    /** Loads a page and waits for its load event. Errors thrown while the page is loading are not seen (the hook goes in after the load). */
    goto: async function (u) { await call(port, 'POST', url('/url'), { url: u }); await page.evaluate(function () { return 1; }); },
    /** Runs a function in the page with one JSON-able argument; resolves to its JSON-able answer (a promise is awaited). */
    evaluate: async function (fn, arg) {
      var src = typeof fn === 'function' ? fn.toString() : '(function(){ return (' + String(fn) + '); })';
      var out = await call(port, 'POST', url('/execute/async'), { script: wrapScript(src), args: [arg === undefined ? null : arg] });
      var o = JSON.parse(out); emit(o.l);
      if (o.e) throw new Error('in the page: ' + o.e);
      return o.v;
    },
    /** Polls fn(arg) every 50 ms until it answers something truthy; rejects after opts.timeout (default 20000 ms). */
    waitForFunction: async function (fn, arg, opts) {
      var limit = Date.now() + ((opts && opts.timeout) || 20000), v;
      for (;;) { v = await page.evaluate(fn, arg); if (v) return v; if (Date.now() > limit) throw new Error('waitForFunction timed out after ' + ((opts && opts.timeout) || 20000) + ' ms'); await sleep(50); }
    },
    /** Window size so that the page area (not the whole window) is width x height. */
    setViewport: async function (v) {
      var inner = await page.evaluate(function () { return [innerWidth, innerHeight]; }), rect = await call(port, 'GET', url('/window/rect'));
      await call(port, 'POST', url('/window/rect'), { width: rect.width + (v.width - inner[0]), height: rect.height + (v.height - inner[1]) });
    },
    screenshot: async function (o) {
      var b = Buffer.from(await call(port, 'GET', url('/screenshot')), 'base64'); if (o && o.path) fs.writeFileSync(o.path, b); return b;
    },
    mouse: {
      move: async function (x, y, o) {
        var steps = Math.max(1, (o && o.steps) || 1), acts = [];
        for (var i = 1; i <= steps; i++) acts.push({ type: 'pointerMove', x: Math.round(mouseAt.x + (x - mouseAt.x) * i / steps), y: Math.round(mouseAt.y + (y - mouseAt.y) * i / steps), origin: 'viewport', duration: 0 });
        await page._actions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: acts }]); mouseAt = { x: x, y: y };
      },
      down: function () { mouseDown = true; return page._actions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerDown', button: 0 }] }]); },
      up: function () { mouseDown = false; return page._actions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerUp', button: 0 }] }]); },
      click: async function (x, y) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); },
      /** Scrolls the wheel at the pointer. Falls back to a WheelEvent sent by script when the driver has no wheel actions. */
      wheel: async function (dx, dy) {
        try { await page._actions([{ type: 'wheel', id: 'wheel', actions: [{ type: 'scroll', x: Math.round(mouseAt.x), y: Math.round(mouseAt.y), deltaX: Math.round(dx || 0), deltaY: Math.round(dy || 0), origin: 'viewport', duration: 0 }] }]); }
        catch (e) { await page.evaluate(function (a) { var t = document.elementFromPoint(a.x, a.y) || document.body; t.dispatchEvent(new WheelEvent('wheel', { deltaX: a.dx, deltaY: a.dy, clientX: a.x, clientY: a.y, bubbles: true, cancelable: true })); }, { x: mouseAt.x, y: mouseAt.y, dx: dx || 0, dy: dy || 0 }); }
      }
    },
    keyboard: {
      /** 'Escape', 'ArrowRight', 'a', or a combination such as 'Control+a'. */
      press: function (key) {
        var parts = String(key).split(/\+(?=.)/), chars = parts.map(keyChar), acts = [];
        chars.forEach(function (c) { acts.push({ type: 'keyDown', value: c }); }); chars.slice().reverse().forEach(function (c) { acts.push({ type: 'keyUp', value: c }); });
        return page._actions([{ type: 'key', id: 'keyboard', actions: acts }]);
      }
    },
    /** The W3C actions call. GNOME Web (Epiphany 46) refuses it ("unsupported operation"); then the same input is sent as DOM events by script (they are untrusted events, so a page that insists on real ones will not react). */
    _actions: async function (a) {
      if (!page._synth) { try { return await call(port, 'POST', url('/actions'), { actions: a }); } catch (e) { if (e.wdError !== 'unsupported operation') throw e; page._synth = true; } }
      return page.evaluate(synthInput, { a: a, at: mouseAt, down: mouseDown });
    }
  };
  return page;
}

/**
 * Starts the driver and one browser session.
 * opts: { browser: 'webkitgtk' (default) | 'epiphany', width, height (default 1280x800), timeout (ms a page script may run, default 600000),
 *         driver: path to WebKitWebDriver, binary: path to epiphany, xvfb: true | false (default: only when there is no DISPLAY), port }
 * Resolves to { page, version, close() }. Never leaves a process behind: close() ends the whole process group, and so does exiting node.
 */
async function launch(opts) {
  opts = opts || {};
  var kind = opts.browser || 'webkitgtk', driver = opts.driver || which('WebKitWebDriver');
  if (!driver) throw new Error('WebKitWebDriver was not found (install the webkitgtk packages from the test browsers branch, as root).');
  var port = opts.port || await freePort(), useX = opts.xvfb === undefined ? !process.env.DISPLAY : opts.xvfb, argv = [], cmd;
  if (which('dbus-run-session')) { argv.push('dbus-run-session', '--'); }
  if (useX) { if (!which('xvfb-run')) throw new Error('xvfb-run was not found and there is no display.'); argv.push('xvfb-run', '-a', '-s', '-screen 0 1280x1024x24'); }
  argv.push(driver, '--port=' + port); cmd = argv.shift();
  var env = Object.assign({}, process.env, { GTK_A11Y: 'none', WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: '1' });
  var proc = cp.spawn(cmd, argv, { env: env, detached: true, stdio: 'ignore' }), closed = false, exited = false;
  proc.on('exit', function () { exited = true; });
  var killAll = function () { if (!closed) { closed = true; try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) { /* gone */ } } };
  process.on('exit', killAll);
  try {
    var up = false; for (var i = 0; i < 100 && !up && !exited; i++) { try { await call(port, 'GET', '/status', undefined, 1000); up = true; } catch (e) { await sleep(150); } }
    if (!up) throw new Error('WebKitWebDriver did not start answering on port ' + port + '.');
    var caps = kind === 'epiphany' ? { browserName: 'Epiphany', 'webkitgtk:browserOptions': { binary: opts.binary || which('epiphany') || '/usr/bin/epiphany', args: ['--automation-mode'] } } : {};
    var s = await call(port, 'POST', '/session', { capabilities: { alwaysMatch: caps } }, 60000), sid = s.sessionId;
    await call(port, 'POST', '/session/' + sid + '/timeouts', { script: opts.timeout || 600000, pageLoad: 120000 });
    var page = makePage(port, sid), b = {
      page: page, port: port, sessionId: sid, version: (s.capabilities.browserName || kind) + ' ' + (s.capabilities.browserVersion || ''),
      close: async function () { try { await call(port, 'DELETE', '/session/' + sid, undefined, 5000); } catch (e) { /* Epiphany may exit before it answers */ } killAll(); }
    };
    await page.setViewport({ width: opts.width || 1280, height: opts.height || 800 }).catch(function () { /* some builds refuse; the default window is used */ });
    return b;
  } catch (e) { killAll(); throw e; }
}

module.exports = { launch: launch, call: call, wrapScript: wrapScript, keyChar: keyChar, version: '1.0.0' };
