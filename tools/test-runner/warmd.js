/* Copyright (c) 2026 LFC Foundry. MIT License. The warm-browser daemon: starts the browsers it is given, one at a time, keeps them open and writes where to find each one into the warm folder.
   Run by `cli.js warm start`; stop it with `cli.js warm stop`. Usage: node warmd.js chromium firefox webkit epiphany */
'use strict';
const fs = require('fs'), path = require('path'), R = require('./runner.js');
const want = process.argv.slice(2).filter((b) => R.BROWSERS.includes(b)), dir = R.warmDir(), keep = [];
fs.mkdirSync(dir, { recursive: true });
const mark = (which, info) => { const f = path.join(dir, which + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(Object.assign({ pid: process.pid, browser: which }, info))); fs.renameSync(f + '.tmp', f); };
const bye = () => { for (const b of keep) { try { b.kill(); } catch (e) { /* gone */ } } for (const w of want) { try { fs.unlinkSync(path.join(dir, w + '.json')); } catch (e) { /* gone */ } } process.exit(0); };
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((s) => process.on(s, bye));
(async () => {
  for (const which of want) {
    try {
      if (which === 'webkit' || which === 'epiphany') {
        const WD = require('../webkit-driver/webkit-driver.js'), b = await WD.launch({ browser: which === 'epiphany' ? 'epiphany' : 'webkitgtk', width: 1280, height: 800 });
        keep.push({ kill: () => b.close() }); mark(which, { port: b.port, sessionId: b.sessionId, version: b.version });
      } else {
        const pup = R.needPuppeteer(), ff = which === 'firefox';
        if (ff) {   // Firefox allows one automation session at a time, so the daemon only starts it and every client opens (and ends) its own session
          const cp = require('child_process'), prof = fs.mkdtempSync(path.join(require('os').tmpdir(), 'warm-ff-'));
          const child = cp.spawn(process.env.FIREFOX, ['--headless', '--no-remote', '-profile', prof, '--remote-debugging-port=0'], { stdio: ['ignore', 'pipe', 'pipe'] });
          const endpoint = await new Promise((ok, no) => {
            let seen = ''; const t = setTimeout(() => no(new Error('Firefox did not report its port')), 60000);
            const on = (d) => { seen += d; const m = /ws:\/\/127\.0\.0\.1:\d+/.exec(seen); if (m) { clearTimeout(t); ok(m[0] + '/session'); } };
            child.stdout.on('data', on); child.stderr.on('data', on); child.on('exit', () => no(new Error('Firefox exited')));
          });
          keep.push({ kill: () => { try { child.kill(); } catch (e) { /* gone */ } try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* gone */ } } });
          const b = await pup.connect({ browserWSEndpoint: endpoint, protocol: 'webDriverBiDi', protocolTimeout: 600000 }), version = await b.version(); await b.disconnect();
          mark(which, { endpoint, version });
        } else {
          const b = await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] });
          keep.push({ kill: () => b.close() }); mark(which, { endpoint: b.wsEndpoint(), version: await b.version() });
        }
      }
    } catch (e) { fs.writeFileSync(path.join(dir, which + '.error'), String(e && e.stack || e)); }
  }
  fs.writeFileSync(path.join(dir, 'READY'), String(Date.now()));
})();
setInterval(() => {}, 1 << 30);
