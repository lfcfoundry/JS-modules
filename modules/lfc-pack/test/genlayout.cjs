const JF=require('../lfc-pack.js'), fs=require('fs');
// Writes vectors/layout/: small files that put every block feature (nested blocks, every flat column type, key-order lists, stored frames, several blocks) in front of a second reader.
// Writes with templates:true so the log-template column does not depend on timing. Run from the lfc-pack folder: node test/genlayout.cjs [outdir]. Then: python3 test/layoutcheck.py
const out=process.argv[2]||require('path').join(__dirname,'..','vectors','layout'); fs.mkdirSync(out,{recursive:true});
const L=(a)=>a.map(x=>JSON.stringify(x)).join('\n')+'\n';
const hex=(n)=>{let s='';for(let i=0;i<16;i++)s+='0123456789abcdef'[(n*7+i*3)%16];return s;};
const rows=[];
for(let i=0;i<40;i++) rows.push({
  seq:i, wob:(i*37)%11-5, price:Math.round(i*13.37*100)/100, f:i/3, big:2**40+i,
  hex:hex(i), id:'123e4567-e89b-42d3-a456-4266141740'+String(10+i), ip:'10.0.'+i+'.'+(i*5%256),
  flag:i%3===0, lvl:['info','warn','error'][i%3], note:'no '+i+' ok at '+(1000+i*3),
  links:[i,i+2,i+9], back:[i+5,i], mix:i%4===0?{a:i}:[i], ni:i%5?null:7, log:'GET /item/'+i+' took '+(i*7%90)+' ms from '+(i%3?'cache':'origin')+' id='+hex(i)+i });
const CASES={
 'flat-all-types': [L(rows),{block:'flat',templates:true}],
 'flat-key-order': [L([{b:1,a:2},{a:3,b:4},{a:5}]),{block:'flat',exact:true}],
 'nested-forced': [L([{p:{q:[1,{r:'s'}],u:null},v:'w'},{p:{q:[],u:{}},v:'w2'},{p:{q:[true,false,-2.5,2**40],u:'café 😀'},v:'w'},{p:{q:[1],u:'w'},v:'w'}]),{block:'nested'}],
 'nested-deep': [L([{a:1,d:JSON.parse('['.repeat(120)+']'.repeat(120))},{a:2,d:'x'}]),{block:'nested'}],
 'nested-sparse-wide': [L(Array.from({length:300},(_,i)=>({k:'s'+(i%7),n:i*1.5,t:i%2===0,o:{z:'q'+(i%300)}}))),{block:'nested'}],
 'nested-intkeys': [L([{b:'x','1':'y'},{b:'z','1':'w'}]),{block:'nested'}],
 'nested-number-widths': [L([{u8:200,u16:60000,u32:4e9,i8:-100,i16:-30000,i32:-2e9,f:1.5,z:-0,n:{x:[1,2]}},{u8:0,u16:1,u32:70000,i8:127,i16:32767,i32:2147483647,f:-2,z:0,n:{x:[3]}},{u8:7,u16:300,u32:5,i8:-128,i16:-1,i32:-2147483648,f:1e300,z:0,n:{x:[]}}]),{block:'nested'}],
 'flat-wide-dict': [L(Array.from({length:1400},(_,i)=>({k:'label-'+(i*7%300),n:-(i*37%2000)/100,m:((i*53)%999)-500}))),{block:'flat'}],
 'flat-decimals-delta': [L(Array.from({length:600},(_,i)=>({t:+(20+Math.sin(i/9)*3+i*0.001).toFixed(3),g:+(40+Math.cos(i/50)*0.01).toFixed(5),q:((i*7919)%1000)/10,w:i%5?-i:i*3}))),{block:'flat'}],
 'nested-decimals': [L(Array.from({length:400},(_,i)=>({id:1000000+i,p:{lat:+(40+Math.sin(i/30)*0.01).toFixed(5),lon:+(-74+i*0.00001).toFixed(5)},price:((i*7919)%10000)/100,k:[i%3,i%5]}))),{block:'nested'}],
 'nested-coordinate-pairs': [L(Array.from({length:300},(_,i)=>({g:{c:[+(-74+i*0.00013).toFixed(5),+(40+Math.sin(i/20)*0.002).toFixed(5)]},n:i}))),{block:'nested'}],
 'flat-negatives': [L([{a:-5,b:-0.25,c:3},{a:-1,b:100.5,c:-9007199254740},{a:-300,b:0,c:2}]),{block:'flat'}],
 'flat-surrogates': [L([{s:'\ud800 lone',t:'ok'},{s:'x',t:'\udc00'},{s:'a\u0000b',t:'y'}]),{block:'flat'}],
 'nested-surrogates': [L([{s:'\ud800 lone',t:{u:'ok'}},{s:'x',t:{u:'\udc00'}},{s:'a\u0000b',t:{u:'y'}}]),{block:'nested'}],
 'nested-astral-key': [L([{'\ud83d\ude00':1,'é':2,'k':'v'},{'\ud83d\ude00':3,'é':4,'k':'w'}]),{block:'nested'}],
 'nested-paths': [L(Array.from({length:90},(_,i)=>i%9===0?'s'+(i%2):i===45?{a:1,d:JSON.parse('['.repeat(120)+']'.repeat(120))}:({'1':'x'+(i%2),t:'k'+(i%4),a:{b:['u','v','\u00e9'][i%3],c:['k'+(i%4),'k'+((i+1)%4)]},n:i,q:i%3?'same':'k1'}))),{block:'nested',paths:true,blockBytes:1500}],
 'nested-shared': [L(Array.from({length:120},(_,i)=>({type:'Feature',p:{name:'pt'+(i*7%23),kind:['a','b','é'][i%3]},g:i%4?{c:[i,i*2]}:{c:[i],x:null}}))),{block:'nested',share:true,blockBytes:1200}],
 'multi-block': [L(Array.from({length:30},(_,i)=>({i,s:'r'+i}))),{block:'flat',blockBytes:200}],
};
for(const k in CASES){const [src,o]=CASES[k]; fs.writeFileSync(out+'/'+k+'.ndjson',src);}
(async()=>{await JF.init();
 for(const k in CASES){const [src,o]=CASES[k]; const f=JF.pack(Buffer.from(src),o); fs.writeFileSync(out+'/'+k+'.json.lfc',f);
  if(!o.exact){const x=JF.pack(Buffer.from(src),Object.assign({},o,{exact:true}));fs.writeFileSync(out+'/'+k+'.x.json.lfc',x); if(!Buffer.from(JF.unpackText(x)).equals(Buffer.from(src))) console.log('BYTE-EXACT MISMATCH',k);}
  const want=src.split('\n').filter(Boolean).map(l=>JSON.parse(l));
  try{require('assert').deepStrictEqual(JF.unpack(f),want);console.log('js ok',k,f.length);}catch(e){console.log('JS MISMATCH',k,e.message.slice(0,200));}
  if(o.exact){const g=JF.pack(Buffer.from(src),Object.assign({},o)); }
 }
 // several tables and a plain value in one file (header "tables", block table index): tables.json.lfc and tables.expected.json
 const tb={people:[{id:1,n:'a'},{id:2,n:'b'}],cfg:{v:[1,2,{x:null}]},logs:[{t:1,m:'GET /1'},{t:2,m:'GET /2'}]};
 fs.writeFileSync(out+'/tables.json.lfc',JF.packTables(tb)); fs.writeFileSync(out+'/tables.expected.json',JSON.stringify(tb));
 require('assert').deepStrictEqual(JF.unpackTables(fs.readFileSync(out+'/tables.json.lfc')),tb); console.log('js ok tables');
})();
