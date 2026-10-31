const fs=require('fs'),path=require('path'),JF=require('../../lfc-pack.js'),g=require('../../test/gen.cjs');
const out=process.argv[2]; fs.mkdirSync(out,{recursive:true});
let s=1; const r=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296, pick=a=>a[Math.floor(r()*a.length)];
const hex=n=>Array.from({length:n},()=>'0123456789abcdef'[Math.floor(r()*16)]).join('');
const sets={
 logs:g.logs(20000), events:g.events(20000),
 ids:Array.from({length:6000},(_, i)=>JSON.stringify({u:[hex(8),hex(4),'4'+hex(3),'a'+hex(3),hex(12)].join('-'),h:hex(32),ip:`10.${i%256}.${Math.floor(r()*256)}.7`,seq:i*3,list:Array.from({length:Math.floor(r()*5)},(_, k)=>k*7+i),f:r()*1000,neg:-Math.floor(r()*1e6),b:r()<.5,c:pick(['red','green','blue']),mix:r()<.5?i:'s'+i,dec:Math.round(r()*1e4)/100})).join('\n')+'\n',
 tmpl:Array.from({length:8000},(_, i)=>JSON.stringify({line:`${pick(['INFO','WARN'])} worker-${i%7} handled request ${Math.floor(r()*1e6)} in ${Math.floor(r()*900)} ms from 10.0.${i%9}.1`})).join('\n')+'\n',
 sparse:Array.from({length:5000},(_, i)=>{const o={t:i};for(const k of 'abcdefgh')if(r()<.3)o[k]=r()<.5?Math.floor(r()*100):'v'+Math.floor(r()*50);return JSON.stringify(o)}).join('\n')+'\n',
 weird:Array.from({length:3000},(_, i)=>JSON.stringify({'9':i,'10':'x','b':'\ud800 lone \u0001 é 😀',n:[-0,1e21,1.5e-7,123456789012345680000,0.1+0.2],o:{'2':1,'1':[{},[],null]}})).join('\n')+'\n',
};
(async()=>{await JF.init();
 for(const [name,text] of Object.entries(sets)){
  const src=Buffer.from(text);
  for(const x of [false,true]){
   const packed=JF.pack(src,{exact:x}); fs.writeFileSync(path.join(out,name+(x?'.x':'')+'.json.lfc'),packed);
   const t=JF.unpackText?JF.unpackText(packed):null;
   fs.writeFileSync(path.join(out,name+(x?'.x':'')+'.expect'), Buffer.from(t));
  }
  fs.writeFileSync(path.join(out,name+'.ndjson'),src);
 }
 console.log(Object.keys(JF).join(' '));
})();
