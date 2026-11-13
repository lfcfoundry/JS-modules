const { chromium } = require('playwright'); (async () => { const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
 for (let r = 0; r < 2; r++) for (const v of process.argv[3].split(',')) { const p = await b.newPage(); await p.goto('http://127.0.0.1:8765/bt.html#' + v + ':' + process.argv[2]); await p.waitForFunction(() => !!window.run);
 console.log(v, JSON.stringify(await p.evaluate(() => run()))); await p.close(); } await b.close(); })();
