// ISO date-time columns (2.17.1 day cache in tsFixed): 3,459 cases of valid and broken date-times at 40, 3,000 and 5,000 rows, three steps, with and without milliseconds, three modes, a bad value at the start, middle and end; every one must round-trip exactly. At release the bytes were also compared to 2.17.0 (3,459 same, 0 different). Node only.
const B=require(require("path").resolve(__dirname,"..","memory-compression.js")).jso,A={pack:(x,o)=>B.pack(x,o)};let cases=0,bad=0;
function eq(x,o){const a=A.pack(x,o),b=B.pack(x,o);cases++;if(Buffer.compare(Buffer.from(a),Buffer.from(b))){bad++;console.log("DIFF",cases,JSON.stringify(x.filter(s=>bads.includes(s))),x.length)}if(JSON.stringify(B.unpack(b))!==JSON.stringify(x)){bad++;console.log('ROUND',cases)}}
const iso=(t,ms)=>{const s=new Date(t).toISOString();return ms?s:s.slice(0,19)+'Z'};
const bads=['2025-02-29T00:00:00Z','2024-02-30T00:00:00Z','2025-13-01T00:00:00Z','2025-00-10T00:00:00Z','2025-01-00T00:00:00Z','2025-01-32T00:00:00Z','2025-01-01T24:00:00Z','2025-01-01T00:60:00Z','2025-01-01T00:00:60Z','2025-01-0:T00:00:00Z','2025-01-01T0/:00:00Z','2025/01-01T00:00:00Z','2025-01-01T00:00:00z','2025-17-01T00:00:00Z','2024-17-05T00:00:00Z','2025-01-01T00:00:00.12Z','202a-01-01T00:00:00Z','2024-02-29T00:00:00Z','2100-02-29T00:00:00Z','2000-02-29T00:00:00Z','0000-03-01T00:00:00Z'];
const opts=[{},{mode:'fast'},{mode:'small'}];
for(const ms of [0,1])for(const n of [40,3000,5000])for(const step of [1000,45000,86400000*3]){const base=[];let t=Date.UTC(2023,11,28);for(let i=0;i<n;i++){t+=step;base.push(iso(t,ms))}
 for(const o of opts){eq(base,o);for(const b of bads){for(const at of [0,n>>1,n-1]){const c=base.slice();c[at]=b;eq(c,o)}}}}
// a day repeated after an invalid month that would collide in a packed key
for(const o of opts){const c=[];for(let i=0;i<5000;i++)c.push(i%2?'2026-01-05T00:00:00Z':'2025-17-05T00:00:00Z');eq(c,o)}
console.log('cases',cases,'bad',bad);
if(bad)process.exit(1);
