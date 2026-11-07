#!/usr/bin/env node
// tab-guard against tab-election and broadcast-channel (leader election): how long the first copy takes to be in charge, and how long the next copy takes to hear it after the first one closes. Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules holding tab-election and broadcast-channel> CHROMIUM=... | FIREFOX=... [R=5 pairs of tabs] node tests/compare/tab-guard-compare-browser.js
// Two tabs must be open at once, which the WebKitGTK test driver cannot do (it serves one page at a time): Chromium and Firefox only. Exit 2 when it cannot run.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX)) { console.log('skipped: needs LIBS and CHROMIUM or FIREFOX'); process.exit(2); }
const P = require('./prep.js')(), pp = require(path.join(P.NM, 'puppeteer-core')), rd = (f) => fs.readFileSync(f, 'utf8');
const ent = (name, code) => { const f = path.join(P.out, name + '-entry.js'); fs.writeFileSync(f, code.replace(/'(tab-election|broadcast-channel)'/, (m, n) => "'" + path.join(P.NM, n) + "'")); return P.bundle(f, name); };
const L = {
  'tab-guard': { js: rd(path.resolve(__dirname, '../../modules/tab-guard/tab-guard.js')), start: `TabGuard.start({name:NAME,onClaimed:()=>{window.__lead=Date.now()},onFree:()=>{window.__free=Date.now();window.__lead=Date.now()}})` },
  'tab-election': { js: rd(ent('te', "import { Tab } from 'tab-election'; window.TabElection = { Tab };")), start: `(window.__tab=new TabElection.Tab(NAME)).waitForLeadership(()=>{window.__lead=Date.now()})` },
  'broadcast-channel': { js: rd(ent('bc', "import { BroadcastChannel, createLeaderElection } from 'broadcast-channel'; window.BC = { BroadcastChannel, createLeaderElection };")), start: `(async()=>{const ch=new BC.BroadcastChannel(NAME);const el=BC.createLeaderElection(ch);await el.awaitLeadership();window.__lead=Date.now()})()` }
};
const wait=(p,pred,ms)=>p.evaluate((pred,ms)=>new Promise(r=>{const t0=Date.now();(function f(){const v=eval(pred);if(v||Date.now()-t0>ms)r(v);else setTimeout(f,2)})()}),pred,ms);
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<!doctype html><title>x</title><body>')});await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+srv.address().port+'/';
 const exes=[['chromium',process.env.CHROMIUM],['firefox',process.env.FIREFOX]].filter(x=>x[1]);
 const R=+process.env.R||7,med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1]};
 for(const [kind,exe] of exes){
  const b=kind==='firefox'?await pp.launch({browser:'firefox',executablePath:exe,headless:true,protocol:'webDriverBiDi'}):await pp.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-gpu']});
  console.log('Browser: '+await b.version());const names=Object.keys(L),first={},fail={};
  for(let k=0;k<R;k++)for(const n of (k%2?names.slice().reverse():names)){
    const name='g'+k+n.replace(/\W/g,'');const code=L[n].start.replace(/NAME/g,JSON.stringify(name));
    const A=await b.newPage();await A.goto(url);await A.evaluate(src=>{(0,eval)(src)},L[n].js);
    const tA=await A.evaluate(code=>{const t0=performance.now();window.__t0=t0;(0,eval)(code);return t0},code);
    const okA=await wait(A,'window.__lead',3000);
    const startedLead=await A.evaluate(()=>window.__lead?performance.now()-window.__t0:-1);
    // B waits behind A
    const B=await b.newPage();await B.goto(url);await B.evaluate(src=>{(0,eval)(src)},L[n].js);await B.evaluate(code=>{(0,eval)(code)},code);
    await new Promise(r=>setTimeout(r,1100));
    const t0=Date.now();await A.close();
    const got=await wait(B,'window.__lead',8000);
    const bt=got?await B.evaluate(()=>window.__lead):0;
    (first[n]=first[n]||[]).push(startedLead);(fail[n]=fail[n]||[]).push(got?bt-t0:-1);
    await B.close();
  }
  for(const n of names)console.log('  '+n.padEnd(18)+'first copy in charge '+med(first[n]).toFixed(1)+' ms | next copy takes over after the first closes '+med(fail[n]).toFixed(0)+' ms (min '+Math.min(...fail[n])+', max '+Math.max(...fail[n])+', n='+fail[n].length+')');
  await b.close();
 }
 process.exit(0)})().catch(e=>{console.log(e);process.exit(1)});
