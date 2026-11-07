#!/usr/bin/env node
// spotlight-tour against driver.js, Shepherd.js and Intro.js: one page with eight targets and a six-step tour; time from the call to the card being in the page and laid out (first start, next step, whole tour). Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules> CHROMIUM=... | FIREFOX=... | WEBKIT=1 [R=5 pages] [C=12 tours per page] [MEAN=1 for the mean instead of the median: use it in Firefox, whose clock steps 1 ms] node tests/compare/spotlight-tour-compare-browser.js
// Shepherd.js and Intro.js are AGPL-3.0: they are only run here to be measured, never copied into this repository. Exit 2 when it cannot run.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX || process.env.WEBKIT)) { console.log('skipped: needs LIBS and CHROMIUM, FIREFOX or WEBKIT=1'); process.exit(2); }
const P = require('./prep.js')(), pp = require(path.join(P.NM, 'puppeteer-core')), wd = require('../webkit-shim.js'), NM = P.NM, rd = (f) => fs.readFileSync(f, 'utf8');
const css = (f) => { const o = path.join(P.out, path.basename(f) + '.min.css'); P.es.buildSync({ entryPoints: [f], minify: true, outfile: o, logLevel: 'error' }); return rd(o); };
const shep = P.bundle(path.join(NM, 'shepherd.js/dist/cjs/shepherd.cjs'), 'shepherd', { format: 'iife', globalName: 'ShepherdLib' });
const L = {
  'spotlight-tour': { js: rd(path.resolve(__dirname, '../../modules/spotlight-tour/spotlight-tour.js')), css: '' },
  'driver.js': { js: rd(P.bundle(path.join(NM, 'driver.js/dist/driver.js.iife.js'), 'driver', { bundle: false })), css: css(path.join(NM, 'driver.js/dist/driver.css')) },
  'Shepherd.js': { js: rd(shep) + ';window.ShepherdLib=(ShepherdLib.Shepherd||ShepherdLib.default||ShepherdLib);', css: css(path.join(NM, 'shepherd.js/dist/css/shepherd.css')) },
  'Intro.js': { js: rd(P.bundle(path.join(NM, 'intro.js/intro.js'), 'intro', { bundle: false })), css: css(path.join(NM, 'intro.js/introjs.css')) }
};
async function work(name,js,css,cycles){
  // page with 8 targets
  document.head.insertAdjacentHTML('beforeend','<style>'+css+'</style>');
  document.body.innerHTML='<div style="padding:20px">'+Array.from({length:8},(_,i)=>'<button id="t'+i+'" style="margin:20px;padding:10px;">Target '+i+'</button>').join('')+'</div>';
  (0,eval)(js);
  const N=6, tick=()=>new Promise(r=>setTimeout(r,0));
  const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const mk={
   'spotlight-tour':()=>{const t=SpotlightTour.create({key:null,giftKey:null,storage:null,steps:Array.from({length:N},(_,i)=>({target:'#t'+i,title:'Step '+i,text:'Look here.'}))});return {start:()=>t.start(),next:()=>{const b=document.querySelector('.stt-next');b&&b.click()},stop:()=>{try{t.destroy&&t.destroy()}catch(e){}}}},
   'driver.js':()=>{const d=window.driver.js.driver({animate:false,steps:Array.from({length:N},(_,i)=>({element:'#t'+i,popover:{title:'Step '+i,description:'Look here.'}}))});return {start:()=>d.drive(),next:()=>d.moveNext(),stop:()=>d.destroy()}},
   'Shepherd.js':()=>{const t=new ShepherdLib.Tour({useModalOverlay:true,defaultStepOptions:{scrollTo:false}});for(let i=0;i<N;i++)t.addStep({id:'s'+i,attachTo:{element:'#t'+i,on:'bottom'},title:'Step '+i,text:'Look here.',buttons:[{text:'Next',action:()=>t.next()}]});return {start:()=>t.start(),next:()=>t.next(),stop:()=>t.cancel()}},
   'Intro.js':()=>{const t=introJs.tour().setOptions({animation:false,steps:Array.from({length:N},(_,i)=>({element:'#t'+i,title:'Step '+i,intro:'Look here.'}))});return {start:()=>t.start(),next:()=>t.nextStep(),stop:()=>t.exit(true)}}
  }[name];
  const res={open:[],next:[],total:[]};
  for(let c=0;c<cycles;c++){
    const T=mk();
    let t0=performance.now();T.start();await tick();document.body.offsetHeight;const o=performance.now()-t0;
    if(c===0){const sel={'spotlight-tour':'.stt-card','driver.js':'.driver-popover','Shepherd.js':'.shepherd-element','Intro.js':'.introjs-tooltip'}[name];res.shown=!!document.querySelector(sel)}
    let nx=0;for(let s=1;s<N;s++){t0=performance.now();T.next();await tick();document.body.offsetHeight;nx+=performance.now()-t0}
    T.stop();await tick();await frames();
    res.open.push(o);res.next.push(nx/(N-1));res.total.push(o+nx);
  }
  return res;
}
(async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<!doctype html><meta name=viewport content="width=1000"><title>x</title><body>')});await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
 const exes=[['chromium',process.env.CHROMIUM],['firefox',process.env.FIREFOX],['webkit',process.env.WEBKIT]].filter(x=>x[1]);
 const R=+process.env.R||5,C=+process.env.C||12, med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1]};
 for(const [kind,exe] of exes){
  const b=kind==='webkit'?await wd.launch('webkitgtk'):kind==='firefox'?await pp.launch({browser:'firefox',executablePath:exe,headless:true,protocol:'webDriverBiDi'}):await pp.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-gpu']});
  console.log('Browser: '+await b.version());const names=Object.keys(L),got={};
  for(let k=0;k<R;k++)for(const n of (k%2?names.slice().reverse():names)){
    const p=await b.newPage();await p.goto('http://127.0.0.1:'+srv.address().port+'/');
    let r;try{r=await p.evaluate(work,n,L[n].js,L[n].css,C)}catch(e){console.log(n,'ERR',String(e).slice(0,200));if(p.close)await p.close();continue}
    const g=got[n]=got[n]||{first:[],open:[],next:[],total:[]};if(!r.shown)console.log('  WARNING no card shown for',n);g.first.push(r.open[0]);const mean=a=>a.slice(1).reduce((x,y)=>x+y,0)/(a.length-1);const f=process.env.MEAN?mean:(a=>med(a.slice(1)));g.open.push(f(r.open));g.next.push(f(r.next));g.total.push(f(r.total));
    if(p.close)await p.close();
  }
  for(const n of names){const g=got[n];if(!g){console.log('  '+n+' failed');continue}console.log('  '+n.padEnd(16)+'first open '+med(g.first).toFixed(1)+' ms | open (warm) '+med(g.open).toFixed(1)+' | next step '+med(g.next).toFixed(1)+' | 6-step tour '+med(g.total).toFixed(1)+' ms  (pages '+g.first.length+')')}
  await b.close();
 }
 process.exit(0)})().catch(e=>{console.log(e);process.exit(1)});
