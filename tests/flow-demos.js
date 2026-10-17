#!/usr/bin/env node
// Demo checks for gif-writer, zip-open, river-layout and walker-sim. Copyright (c) 2026 LFC Foundry. MIT License.
// Opens each demo page in a real browser and checks that it works (a real GIF comes out, a zip bomb stops, the chart draws, the walkers match the exact odds).
// Needs puppeteer-core. Run: CHROMIUM=/path/to/chrome FIREFOX=/path/to/firefox node tests/flow-demos.js   (either one or both, one browser at a time).
// Exit code 2 (skipped) when puppeteer-core or both browser paths are missing.
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const root = require('path').resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX]].filter(x => x[1]);
if (!pp || !exes.length) { console.log('skipped: needs puppeteer-core and CHROMIUM and/or FIREFOX set to a browser path'); process.exit(2); }
(async()=>{
  let allFails=0;
 for (const [kind, exe] of exes) {
 const b = kind==='firefox' ? await pp.launch({browser:'firefox',executablePath:exe,headless:true,protocol:'webDriverBiDi'}) : await pp.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-gpu']});
 console.log('Browser:',await b.version());
 let fails=0;const T=async(n,f)=>{try{const r=await f();console.log('  ok  ',n,r||'');}catch(e){fails++;console.log('  FAIL',n,String(e&&e.message||e).split('\n')[0]);}};
 const open=async(m)=>{const p=await b.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(String(e.message||e)));p.on('console',m=>{if(m.type()==='error')p.errs.push('console: '+m.text());});await p.setViewport({width:412,height:800});await p.goto('file://'+root+'modules/'+m+'/demo.html');return p;};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 await T('gif-writer demo makes a real GIF',async()=>{const p=await open('gif-writer');await p.select('#sz','320x200');await p.click('#go');await p.waitForSelector('#out img',{timeout:30000});
  const r=await p.evaluate(async()=>{const u=document.querySelector('#out img').src;const buf=new Uint8Array(await (await fetch(u)).arrayBuffer());const im=document.querySelector('#out img');await im.decode();return{head:String.fromCharCode(...buf.slice(0,6)),n:buf.length,w:im.naturalWidth,h:im.naturalHeight,txt:document.getElementById('out').innerText.split('\n').pop()};});
  if(r.head!=='GIF89a'||r.w!==320||r.h!==200)throw new Error(JSON.stringify(r));if(p.errs.length)throw new Error(p.errs[0]);return r.txt.slice(0,110);});
 await T('zip-open demo: sample zip',async()=>{const p=await open('zip-open');await p.click('#s1');await sleep(500);const t=await p.evaluate(()=>document.getElementById('out').innerText);if(!/2 files read/.test(t)||!/Ada,10/.test(t))throw new Error(t.slice(0,200));if(p.errs.length)throw new Error(p.errs[0]);return t.split('\n')[0];});
 await T('zip-open demo: 64 MB bomb stops safely',async()=>{const p=await open('zip-open');const t0=Date.now();await p.click('#s2');await p.waitForFunction(()=>/bad|no files/.test(document.getElementById('out').innerHTML),{timeout:60000});const t=await p.evaluate(()=>document.getElementById('out').innerText);if(p.errs.length)throw new Error(p.errs[0]);return (Date.now()-t0)+' ms incl. building it: '+t.slice(0,120);});
 await T('river-layout demo draws and redraws',async()=>{const p=await open('river-layout');const r1=await p.evaluate(()=>({paths:document.querySelectorAll('#out svg path').length,msg:document.getElementById('msg').textContent}));if(r1.paths<9)throw new Error(JSON.stringify(r1));await p.evaluate(()=>{const t=document.getElementById('t');t.value+='\nRent > Wages : 2';t.dispatchEvent(new Event('input'));});const r2=await p.evaluate(()=>document.getElementById('msg').textContent);if(p.errs.length)throw new Error(p.errs[0]);return r1.msg.slice(0,70)+' | after edit: '+r2.slice(0,60);});
 await T('walker-sim demo agrees with exact odds',async()=>{const p=await open('walker-sim');const r=await p.evaluate(()=>({rows:[...document.querySelectorAll('#out tr')].slice(1).map(tr=>[...tr.children].map(c=>c.textContent)),msg:document.getElementById('msg').textContent}));if(r.rows.length<3)throw new Error(JSON.stringify(r));const worst=Math.max(...r.rows.map(x=>parseFloat(x[3])));if(!(worst<1))throw new Error('gap '+worst);if(p.errs.length)throw new Error(p.errs[0]);return r.rows.length+' ends, worst gap '+worst+'%; '+r.msg.slice(0,70);});
 await b.close();console.log(fails?fails+' FAILED':'all demo checks passed');allFails+=fails;
 }
 process.exit(allFails?1:0);
})();
