const L=require('../lfc-pack.js');const {rows}=require('./eqbytes-gen.cjs');
function rng(s){return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
(async()=>{await L.init();let bad=0,tot=0;
 const sets=[];
 for(const n of [0,1,2,7,40,700,20000]) sets.push(['gen'+n,rows(n,n+3)]);
 // sparse / nulls / unicode / numbers-as-strings
 {const r=rng(9),R=[];for(let i=0;i<6000;i++){const o={id:i};const x=r();if(x<0.3)o.t=null;else if(x<0.5){}else if(x<0.6)o.t='';else o.t=['plain','é','é','😀','𐐷','long-'+(i%997)][(r()*6)|0]+(r()<0.5?'':String(i));
  if(r()<0.7)o.u=['11111111-2222-4333-a444-555555555555','aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee'][(r()*2)|0]; else if(r()<0.5)o.u=null; if(r()<0.8)o.ip=(i%250)+'.0.0.'+(i%7); else o.ip=null; o.s='x'+i+(i%3?'':'é'); sets.push;R.push(o);} sets.push(['sparse',R]);}
 {const R=[];for(let i=0;i<5000;i++)R.push({a:'k'+(i%2000)+'x'.repeat(i%5),b:i%3?null:'k'+i,h:(i*2654435761>>>0).toString(16).padStart(8,'0')+'0123456789abcdef'});sets.push(['ascii',R]);}
 {const G=rows(3000,5);G.forEach((o,i)=>{if(i%5===0){o.uuid=null;o.ip=null;o.sha=null;o.msg=null;o.email=null;}if(i%7===0){delete o.uuid;delete o.msg;}});sets.push(['nullfix',G]);}
 for(const [name,R] of sets){const ty={};for(const b of L.stats(L.packRows(R)))for(const k of b.keys||[])ty[k.key+':'+k.type]=1;console.log(name,Object.keys(ty).join(' '));for(const opts of [undefined,{blockBytes:65536}]){const f=L.packRows(R,opts);const all=L.unpack(f);
  const keys=new Set();R.forEach(o=>Object.keys(o).forEach(k=>keys.add(k)));
  for(const k of keys){const vals=new Set([null,'',undefined,'nope','0.0.0.0','1.2.3.4','0'.repeat(32),'é',5,0]);for(let i=0;i<R.length;i+=Math.max(1,R.length>>4))vals.add(R[i][k]);
   for(const v of vals){if(v===undefined)continue;for(const cache of [false,true]){tot++;const a=JSON.stringify(L.unpack(f,{equals:{key:k,value:v},cache})),b=JSON.stringify(all.filter(o=>o[k]===v));if(a!==b){bad++;if(bad<6)console.log('MISMATCH',name,k,JSON.stringify(v),a.slice(0,120),b.slice(0,120));}
    const ka=JSON.stringify(L.unpack(f,{equals:{key:k,value:v},keys:['id',k]})),kb=JSON.stringify(all.filter(o=>o[k]===v).map(o=>{const z={};for(const q of Object.keys(o))if(q==='id'||q===k)z[q]=o[q];return z;}));tot++;if(ka!==kb){bad++;if(bad<6)console.log('KEYS MISMATCH',name,k,v);}}}}}}
 console.log('checks',tot,'bad',bad);})();
