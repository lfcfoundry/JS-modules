// Copyright (c) 2026 LFC Foundry. MIT License.
// WebKitGTK through WebDriver: xvfb-run -a env GTK_A11Y=none WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 dbus-run-session node run-webkit.js test...
const WD=require(__dirname+'/../webkit-driver/webkit-driver.js');const http=require('http'),fs=require('fs'),path=require('path');
const tests=process.argv.slice(2);
const srv=http.createServer((q,r)=>{const f=path.join('/tmp/real-corpus',(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end()}else{r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':'application/octet-stream'});r.end(d)}})}).listen(0,async()=>{
 const port=srv.address().port;const b=await WD.launch({width:1280,height:1024});const p=b.page;const res={browser:'webkitgtk',version:b.version};
 for(const t of tests){await p.goto('http://127.0.0.1:'+port+'/?'+t);await p.evaluate(function(n){window.RES=null;window.runTest(n).then(function(r){window.RES=r})},t);
  await p.waitForFunction(function(){return window.RES!==null},null,{timeout:120000});res[t]=await p.evaluate(function(){return window.RES})}
 await b.close();srv.close();console.log(JSON.stringify(res))});
