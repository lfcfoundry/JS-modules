const fs=require('fs'),path=require('path'),JF=require('../../lfc-pack.js');
const out=process.argv[2]; let s=9; const r=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296, pick=a=>a[Math.floor(r()*a.length)];
const hex=n=>Array.from({length:n},()=>'0123456789abcdef'[Math.floor(r()*16)]).join('');
const N=8000, mk=f=>Array.from({length:N},(_, i)=>JSON.stringify(f(i))).join('\n')+'\n';
const sets={
 tplT:[mk(i=>({m:`${pick(['GET','POST'])} /api/v${i%3}/items/${Math.floor(r()*99999)} 200 ${Math.floor(r()*5000)}ms client=${hex(6)} retry=${i%4} café`})),{templates:true}],
 tplT2:[mk(i=>({m:`Accepted connection from 192.168.${i%255}.${Math.floor(r()*255)} port ${Math.floor(r()*60000)} after -${Math.floor(r()*99)} tries ${pick(['ok','bad'])}`,z:i})),{templates:true}],
 lsF:[mk(i=>({a:Array.from({length:Math.floor(r()*6)},(_, k)=>k*7+i), d:Array.from({length:Math.floor(r()*4)},()=>Math.floor(r()*1000)-500), e:[]})),{block:'flat'}],
 sparseF:[mk(i=>{const o={t:i};for(const k of 'abcdefgh')if(r()<.3)o[k]=r()<.5?Math.floor(r()*100):'v'+Math.floor(r()*50);return o}),{block:'flat'}],
 weirdF:[mk(i=>({'9':i,'b':'\ud800 lone \u0001 é 😀',n:[1,2],'1':{}})),{block:'flat'}],
 bigint:[mk(i=>({n:i%2?9007199254740993+i:i*1.5, m:-i*1e-7, k:1e21*i})),{block:'flat'}],
};
(async()=>{await JF.init(); for(const [n,[t,o]] of Object.entries(sets)) for(const x of [false,true]){const p=JF.pack(Buffer.from(t),Object.assign({exact:x},o)); fs.writeFileSync(path.join(out,n+(x?'.x':'')+'.json.lfc'),p); fs.writeFileSync(path.join(out,n+(x?'.x':'')+'.expect'),Buffer.from(JF.unpackText(p)));}
})();
