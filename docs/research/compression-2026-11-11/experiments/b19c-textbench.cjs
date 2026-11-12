// Copyright (c) 2026 LFC Foundry. MIT License.
// microbench: wanted strings from a \0-joined UTF-8 frame: JS byte loop (B19b today), native indexOf walk, decode+split
const fs=require('fs'); const rows=fs.readFileSync(process.argv[2],'utf8').trim().split('\n').map(JSON.parse); const key=process.argv[3], share=+process.argv[4];
const vals=rows.map(r=>r[key]).filter(v=>typeof v==='string'); const f=new TextEncoder().encode(vals.join('\0')), n=vals.length, td=new TextDecoder();
const vi=[]; for(let i=0;i<n;i++) if(Math.random()<share) vi.push(i); const m=vi.length;
function A(){var k=0,q=0,a=0,hi=0,st=new Int32Array(m),en=new Int32Array(m),o=new Array(m);for(var i=0;i<f.length;i++){var by=f[i];hi|=by;if(by===0){if(q<m&&k===vi[q]){st[q]=a;en[q++]=i;}k++;a=i+1;}} if(q<m&&k===vi[q]){st[q]=a;en[q++]=f.length;} if(hi<128){var big=td.decode(f);for(q=0;q<m;q++)o[q]=big.substring(st[q],en[q]);}else for(q=0;q<m;q++)o[q]=td.decode(f.subarray(st[q],en[q]));return o;}
function B(){var big=td.decode(f),o=new Array(m),k=0,a=0,q=0,x; if(big.length===f.length){while(q<m){x=big.indexOf('\0',a); if(x<0)x=big.length; if(k===vi[q])o[q++]=big.substring(a,x); k++; a=x+1;} return o;} var s=big.split('\0'); for(q=0;q<m;q++)o[q]=s[vi[q]]; return o;}
function C(){var s=td.decode(f).split('\0'),o=new Array(m);for(var q=0;q<m;q++)o[q]=s[vi[q]];return o;}
const ref=JSON.stringify(C()); for(const g of [A,B]) if(JSON.stringify(g())!==ref) console.log('DIFF',g.name);
for(const [nm,g] of [['js-loop',A],['indexOf',B],['split',C],['js-loop',A],['indexOf',B],['split',C]]){for(let i=0;i<10;i++)g(); const t=performance.now(); for(let i=0;i<40;i++)g(); console.log(key,share,nm,((performance.now()-t)/40).toFixed(2),'ms', 'bytes',f.length,'n',n,'m',m);}
