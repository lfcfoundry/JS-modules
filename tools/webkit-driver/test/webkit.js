/* Copyright (c) 2026 LFC Foundry. MIT License. Drives a real WebKitGTK (or GNOME Web with `epiphany`) through webkit-driver.js: about 10 checks, 5 seconds.
 *   node test/webkit.js [webkitgtk|epiphany]      Skips with a note when WebKitWebDriver is not installed. Never run it while another browser is running. */
'use strict';
var WD = require('../webkit-driver.js'), kind = process.argv[2] || 'webkitgtk', fails = 0;
function ok(c, t) { if (c === false) fails++; console.log((c === true ? 'ok   ' : c === false ? 'FAIL ' : 'note ') + t); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var PAGE = 'data:text/html,<title>t</title><body style="margin:0"><button id=b style="position:absolute;left:100px;top:100px;width:80px;height:40px" onclick="document.title=%27clicked%27">x</button><div style="position:absolute;left:300px;top:300px;width:200px;height:200px;background:red"></div>';
(async function () {
  var b; try { b = await WD.launch({ browser: kind, width: 900, height: 600 }); } catch (e) { console.log('note skipped: ' + e.message); process.exit(0); }
  try {
    var p = b.page, errs = []; p.on('pageerror', function (e) { errs.push('pageerror ' + e.message); }); p.on('console', function (m) { errs.push('console ' + m.type() + ' ' + m.text()); });
    ok(/2\.\d+|\d+\.\d+/.test(b.version), 'browser: ' + b.version);
    await p.goto(PAGE);
    ok((await p.evaluate(function (x) { return x + 1; }, 41)) === 42, 'evaluate passes an argument and returns the answer');
    var o = await p.evaluate(async function () { await new Promise(function (r) { setTimeout(r, 50); }); return { a: [1, 2, 3], s: 'é' }; });
    ok(o.a.length === 3 && o.s === 'é', 'evaluate waits for a promise and returns objects');
    await p.mouse.click(120, 120); await sleep(150);
    ok((await p.evaluate(function () { return document.title; })) === 'clicked', 'a mouse click lands on the button');
    await p.evaluate(function () { window.ev = []; ['mousedown', 'mouseup', 'keydown', 'wheel'].forEach(function (n) { addEventListener(n, function (e) { ev.push(n + (e.key ? ':' + e.key : '')); }); }); addEventListener('mousemove', function (e) { window.last = [e.clientX, e.clientY]; }); });
    await p.mouse.move(310, 310); await p.mouse.down(); await p.mouse.move(400, 350, { steps: 4 }); await p.mouse.up();
    await p.keyboard.press('ArrowRight'); await p.keyboard.press('Escape'); await p.mouse.wheel(0, 120); await sleep(200);
    var ev = await p.evaluate(function () { return { e: ev.join(','), last: last }; });
    ok(/mousedown/.test(ev.e) && /mouseup/.test(ev.e) && ev.last[0] === 400 && ev.last[1] === 350, 'a drag presses, moves in steps to the end point and releases');
    ok(/keydown:ArrowRight,keydown:Escape/.test(ev.e), 'key presses arrive in order');
    ok(/wheel/.test(ev.e), 'the wheel scrolls at the pointer');
    await p.evaluate(function () { console.error('boom'); setTimeout(function () { throw new Error('late'); }, 10); }); await sleep(200); await p.evaluate(function () { return 1; });
    ok(errs.some(function (e) { return /console error boom/.test(e); }) && errs.some(function (e) { return /^pageerror/.test(e); }), 'console errors and uncaught errors are reported');
    var thrown = null; try { await p.evaluate(function () { throw new Error('bad thing'); }); } catch (e) { thrown = e; } ok(thrown && /bad thing/.test(thrown.message), 'an error thrown in the page is thrown here with its message');
    var to = null; try { await p.waitForFunction(function () { return false; }, null, { timeout: 300 }); } catch (e) { to = e; } ok(!!to && /timed out/.test(to.message), 'waitForFunction gives up after its timeout');
    await p.setViewport({ width: 800, height: 500 }); var vp = await p.evaluate(function () { return [innerWidth, innerHeight]; });
    ok(vp[0] === 800 && vp[1] === 500, 'the page area is resized to ' + vp.join('x'));
    var png = await p.screenshot(); ok(png.length > 500 && png[1] === 0x50, 'a screenshot is a PNG (' + png.length + ' bytes)');
  } finally { await b.close(); }
  console.log(fails ? fails + ' FAILED' : 'webkit checks passed (' + b.version + ')'); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
