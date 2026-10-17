/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for webkit-driver.js that need no browser: a pretend WebDriver server answers, and the checks look at what the runner sent.
 *   node test/run.js */
'use strict';
var http = require('http'), WD = require('../webkit-driver.js'), fails = 0;
function ok(c, t) { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t); }
(async function () {
  var seen = [], reply = function () { return { value: null }; };
  var srv = http.createServer(function (req, res) {
    var b = ''; req.on('data', function (c) { b += c; }); req.on('end', function () {
      var body = b ? JSON.parse(b) : undefined; seen.push({ m: req.method, u: req.url, b: body });
      var r = reply(req.method, req.url, body); res.statusCode = r.status || 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(r.json || r));
    });
  });
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); }); var port = srv.address().port;

  var v = await WD.call(port, 'GET', '/status'); ok(v === null, 'an answer with a null value comes back as null');
  reply = function () { return { status: 404, json: { value: { error: 'no such element', message: 'gone' } } }; };
  var err = null; try { await WD.call(port, 'GET', '/x'); } catch (e) { err = e; } ok(err && err.wdError === 'no such element' && /gone/.test(err.message), 'a driver error becomes an Error that names the driver error');
  reply = function () { return { status: 200, json: { value: { error: 'unsupported operation', message: 'no wheel' } } }; };
  err = null; try { await WD.call(port, 'POST', '/x', {}); } catch (e) { err = e; } ok(err && err.wdError === 'unsupported operation', 'an error value inside a 200 answer is also an error');
  ok(WD.keyChar('Escape') === '' && WD.keyChar('ArrowRight') === '' && WD.keyChar('a') === 'a', 'key names map to WebDriver key codes, letters stay as they are');

  /* the script sent for evaluate(): run it in node with a fake window to see what it answers */
  var src = WD.wrapScript('function (x) { return { sum: x + 1, u: undefined }; }');
  var out = await new Promise(function (resolve) {
    var win = { __wd: null, addEventListener: function () { } }, con = { error: function () { } };
    new Function('window', 'console', 'arguments_', 'return (function () {' + src + '}).apply(null, arguments_);')(win, con, [41, resolve]);
  });
  var o = JSON.parse(out); ok(o.v && o.v.sum === 42 && o.l.length === 0, 'the script calls the function with the argument and answers with JSON');
  src = WD.wrapScript('function () { throw new Error("boom"); }');
  out = await new Promise(function (resolve) { new Function('window', 'console', 'arguments_', 'return (function () {' + src + '}).apply(null, arguments_);')({ addEventListener: function () { } }, { error: function () { } }, [null, resolve]); });
  o = JSON.parse(out); ok(/boom/.test(o.e), 'a thrown error is sent back with its message');
  src = WD.wrapScript('async function (a) { await null; return a * 2; }');
  out = await new Promise(function (resolve) { new Function('window', 'console', 'arguments_', 'return (function () {' + src + '}).apply(null, arguments_);')({ addEventListener: function () { } }, { error: function () { } }, [21, resolve]); });
  ok(JSON.parse(out).v === 42, 'an async function is awaited');
  srv.close(); console.log(fails ? fails + ' FAILED' : 'webkit-driver checks passed'); process.exit(fails ? 1 : 0);
})();
