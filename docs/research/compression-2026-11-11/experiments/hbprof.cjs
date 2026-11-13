const { chromium } = require('playwright'), fs = require('fs');
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
 for (const f of process.argv[2].split(',')) for (let r = 0; r < 3; r++) { const c = await b.newContext(), p = await c.newPage(); await p.goto('http://127.0.0.1:8765/hb2.html#100:' + f + ':none'); await p.waitForFunction(() => !!window.stage1);
  await p.evaluate(([f, m]) => m ? stage0(f) : stage1(f), [f, process.env.COLD]); const s = await c.newCDPSession(p); await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', { interval: 100 }); await s.send('Profiler.start');
  const ms = await p.evaluate(() => stage2()); const { profile } = await s.send('Profiler.stop'); fs.writeFileSync(process.env.S + '/hbp' + (process.env.COLD ? 'c' : '') + '-' + f + '-' + r + '.cpuprofile', JSON.stringify(profile)); console.log(f, r, ms.toFixed(0)); await c.close(); }
 await b.close(); })();
