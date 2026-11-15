// 2.18.0: shaped rows (CT_SHAPED 23, fast and balanced): odd key sets must round-trip exactly in every mode. Node only.
const M=require(require('path').resolve(__dirname,'..','memory-compression.js'));
(async()=>{if(M.ready)await M.ready();let bad=0;
const chk=(name,rows)=>{for(const mode of ['fast','balanced','small']){const b=M.pack(rows,{mode});const r=M.unpack(b);if(JSON.stringify(r)!==JSON.stringify(rows)){bad++;console.log('MISMATCH',name,mode)}}console.log('ok',name)};
let sd=3;const R=()=>(sd=(Math.imul(sd,1664525)+1013904223)>>>0)/4294967296;
const letters='abcdefghijklmnopqrstuvwxyz';
// 40 layouts
chk('40layouts',Array.from({length:3000},(_,i)=>{const o={id:i};for(let k=0;k<6;k++)if(R()<.5)o['k'+k]=k+i%7;return o}));
// >256 layouts (fallback)
chk('300layouts',Array.from({length:4000},(_,i)=>{const o={id:i};for(let k=0;k<12;k++)if(R()<.5)o['k'+k]=k;return o}));
// proto key
chk('protokey',Array.from({length:3000},(_,i)=>{const o={id:i};if(R()<.5)o['__proto__x']=1;if(R()<.5)o['constructor']=2;if(R()<.5)o['toString']='s';if(R()<.5)o['hasOwnProperty']=null;const s=JSON.parse('{"__proto__":5,"id":'+i+'}');return R()<.2?s:o}));
// unicode / lone surrogate keys
chk('unikeys',Array.from({length:2000},(_,i)=>{const o={id:i};if(R()<.5)o['é']=1;if(R()<.5)o['ÿĀ']=2;if(R()<.5)o['a b']=3;if(R()<.5)o['']=4;if(R()<.5)o['x'+i%30]=5;return o}));
// key order differences
chk('order',Array.from({length:3000},(_,i)=>R()<.5?{a:1,b:2,c:i%5,d:R()<.3?1:undefined}:{b:2,a:1,x:i,c:i%5}));
// numeric-like keys
chk('numkeys',Array.from({length:3000},(_,i)=>{const o={};if(R()<.5)o[1]=1;if(R()<.5)o[2]='a';if(R()<.5)o['10']=3;o.z=i;for(let k=0;k<20;k++)if(R()<.15)o['q'+k]=k;return o}));
console.log(bad?'FAIL '+bad:'ALL OK');if(bad)process.exit(1)})();
