// Copyright (c) 2026 LFC Foundry. MIT License.
// node run.js chromium|firefox test...   runs the real-data tests (see README) and prints one JSON line. BROWSERS=folder made by the test-browsers install.sh
const puppeteer=require('/tmp/pp/node_modules/puppeteer-core');const http=require('http'),fs=require('fs'),path=require('path');
const which=process.argv[2],tests=process.argv.slice(3);
const srv=http.createServer((q,r)=>{const f=path.join('/tmp/real-corpus',q.url==='/'?'index.html':q.url.split('?')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end()}else{r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':f.endsWith('.wasm')?'application/wasm':'application/octet-stream'});r.end(d)}})}).listen(0,async()=>{
 const port=srv.address().port;const B=(process.env.BROWSERS||'/home/claude/browsers')+'/';
 const opts=which==='chromium'?{executablePath:B+'ungoogled-chromium-156.0.8078.79-1-x86_64_linux/chrome',args:['--no-sandbox','--headless=new','--disable-gpu'],headless:true}:{browser:'firefox',executablePath:B+'firefox/firefox',headless:true};
 const br=await puppeteer.launch(opts);const res={browser:which,version:await br.version()};
 for(const t of tests){const pg=await br.newPage();await pg.goto('http://127.0.0.1:'+port+'/');res[t]=await pg.evaluate(n=>window.runTest(n),t);await pg.close()}
 await br.close();srv.close();console.log(JSON.stringify(res));});
