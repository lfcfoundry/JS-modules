const fs=require('fs'),path=require('path'),JF=require('../../lfc-pack.js');
const out=process.argv[2]; let s=5; const r=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296, pick=a=>a[Math.floor(r()*a.length)];
const hex=n=>Array.from({length:n},()=>'0123456789abcdef'[Math.floor(r()*16)]).join('');
const N=8000, mk=f=>Array.from({length:N},(_, i)=>JSON.stringify(f(i))).join('\n')+'\n';
const sets={
 fl:mk(i=>({x:r()*1e6-5e5,y:Math.sqrt(i)})),
 tf:mk(i=>({a:r()<.5,b:r()<.1})),
 uu:mk(i=>({u:[hex(8),hex(4),'4'+hex(3),'a'+hex(3),hex(12)].join('-')})),
 ls:mk(i=>({a:Array.from({length:Math.floor(r()*6)},(_, k)=>k*7+i), d:Array.from({length:Math.floor(r()*4)},()=>Math.floor(r()*1000)-500)})),
 tpl:mk(i=>({m:`${pick(['GET','POST'])} /api/v${i%3}/items/${Math.floor(r()*99999)} 200 ${Math.floor(r()*5000)}ms client=${hex(6)} retry=${i%4}`})),
 tpl2:mk(i=>({m:`Accepted connection from 192.168.${i%255}.${Math.floor(r()*255)} port ${Math.floor(r()*60000)} after ${Math.floor(r()*99)} tries`})),
 mono:mk(i=>({t:1700000000+i*2,v:i%10,sc:Math.round(r()*1e5)/1000})),
 dict:mk(i=>({c:pick(['alpha','beta','gamma','delta']),w:'k'+Math.floor(r()*400)})),
};
(async()=>{await JF.init(); for(const [n,t] of Object.entries(sets)) for(const x of [false,true]){const p=JF.pack(Buffer.from(t),{exact:x}); fs.writeFileSync(path.join(out,n+(x?'.x':'')+'.json.lfc'),p); fs.writeFileSync(path.join(out,n+(x?'.x':'')+'.expect'),Buffer.from(JF.unpackText(p)));}
})();
