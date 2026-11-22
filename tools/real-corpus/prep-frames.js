// Copyright (c) 2026 LFC Foundry. MIT License.
// Real frames: 30 screenshots (400 x 300) of the shipped Fancy Banana game, 100 and 300 ms apart (the Pineapple Defense start screen was a static tour card, so it was dropped), for gif-writer. Needs the game repos next to this one.
const puppeteer=require('/tmp/pp/node_modules/puppeteer-core');const fs=require('fs'),path=require('path'),http=require('http');
const W='/tmp/real-corpus/',B=(process.env.BROWSERS||'/home/claude/browsers')+'/';
const f0=path.resolve(__dirname,'../../../fancy-banana/play/index.html');const games={banana:[f0,100],banana300:[f0,300]};
(async()=>{const br=await puppeteer.launch({executablePath:B+'ungoogled-chromium-156.0.8078.79-1-x86_64_linux/chrome',args:['--no-sandbox','--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
 for(const [n,[f,gap]] of Object.entries(games)){const pg=await br.newPage();await pg.setViewport({width:400,height:300});await pg.goto('file://'+f);await new Promise(r=>setTimeout(r,3000));
  try{await pg.mouse.click(200,150)}catch(e){}
  for(let i=0;i<30;i++){await pg.screenshot({path:W+'frame-'+n+'-'+String(i).padStart(2,'0')+'.png'});await new Promise(r=>setTimeout(r,gap))}
  await pg.close()}
 await br.close()})();
