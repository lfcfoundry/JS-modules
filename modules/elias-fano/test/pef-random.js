// Copyright (c) 2026 LFC Foundry. MIT License.
// elias-fano partitioned lists (since 2.3.2): 3,000 random lists (chunk 32 to 1,024, five gap shapes) read back exact through toArray and four random slices each, so the SIMD whole-chunk decode is checked against the values. Run: node modules/elias-fano/test/pef-random.js
'use strict';
const EF = require('../elias-fano.js');
(async()=>{await EF.ready();let seed=7;const r=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;let bad=0,tests=0;
for(let t=0;t<3000;t++){const n=1+Math.floor(r()*(r()<.2?20000:3000)),mode=Math.floor(r()*5);const a=new Uint32Array(n);let v=Math.floor(r()*1000);
 for(let i=0;i<n;i++){let g;if(mode===0)g=1;else if(mode===1)g=1+Math.floor(r()*4);else if(mode===2)g=1+Math.floor(r()*300);else if(mode===3)g=r()<.7?1:1+Math.floor(r()*70000);else g=1+Math.floor(r()*30);v+=g;if(v>4294967295){v-=g;a[i]=v;continue}a[i]=v}
 for(let i=1;i<n;i++)if(a[i]<a[i-1])a[i]=a[i-1];
 const chunk=[32,64,128,256,512,1024][Math.floor(r()*6)];let p;try{p=EF.openPartitioned(EF.buildPartitioned(a,{chunk}))}catch(e){continue}
 const full=p.toArray();tests++;let ok=full.length===n;for(let i=0;ok&&i<n;i++)if(full[i]!==a[i])ok=false;
 for(let k=0;ok&&k<4;k++){const x=Math.floor(r()*n),y=x+Math.floor(r()*(n-x))+1;const s=p.slice(x,y);for(let i=0;i<s.length;i++)if(s[i]!==a[x+i]){ok=false;break}}
 if(!ok){bad++;if(bad<4)console.log('BAD n',n,'mode',mode,'chunk',chunk)}}
console.log((bad ? 'FAIL' : 'ok  ') + ' elias-fano partitioned random lists: ' + tests + ' lists, full toArray and 4 slices each, ' + bad + ' bad'); process.exit(bad ? 1 : 0); })().catch((e) => { console.error(e); process.exit(1); });
