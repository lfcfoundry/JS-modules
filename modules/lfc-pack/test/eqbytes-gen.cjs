// deterministic fixtures
function rng(s){return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const words='alpha beta gamma delta error timeout cache miss user login failed retry disk full network reset ok done start stop'.split(' ');
exports.rows=function(n,seed=7){const r=rng(seed),out=new Array(n);
 for(let i=0;i<n;i++){const w=[];for(let k=0;k<6;k++)w.push(words[(r()*words.length)|0]);
  const h=(x)=>Math.floor(x*0xffffffff).toString(16).padStart(8,'0');
  out[i]={id:i,level:['INFO','WARN','ERROR','DEBUG'][(r()*4)|0],
   msg:w.join(' ')+' #'+((r()*100000)|0),          // mostly unique text
   email:'user'+((r()*n)|0)+'@example.com',          // high-card text
   city:'City-'+((r()*400)|0),                        // medium-card text
   uuid:h(r())+'-'+h(r()).slice(0,4)+'-4'+h(r()).slice(0,3)+'-a'+h(r()).slice(0,3)+'-'+h(r())+h(r()).slice(0,4),
   ip:((r()*256)|0)+'.'+((r()*256)|0)+'.'+((r()*256)|0)+'.'+((r()*256)|0),
   sha:h(r())+h(r())+h(r())+h(r())};}
 return out;};
