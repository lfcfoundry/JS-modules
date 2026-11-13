const { chromium } = require('playwright'), fs = require('fs');
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); const [build, file, out] = process.argv.slice(2);
 const c = await b.newContext(), p = await c.newPage(); await p.goto('http://127.0.0.1:8765/pr.html#' + build + ':' + file); await p.waitForFunction(() => !!window.run);
 await p.evaluate(() => run(2)); const s = await c.newCDPSession(p); await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', { interval: 100 }); await s.send('Profiler.start');
 const r = await p.evaluate(() => run(4)); const { profile } = await s.send('Profiler.stop'); fs.writeFileSync(out, JSON.stringify(profile)); console.log(JSON.stringify(r)); await b.close(); })();
