// Copyright (c) 2026 LFC Foundry. MIT License.
// node tools/real-corpus/layers-crossings.js   (after setup.sh). OPT='{"dir":"TB","tagLen":8}' picks netflow-layers options; KS=n300,n1000; NL=path to netflow-layers.js.
// Drawn crossings: each link as the polyline actually drawn (netflow-layers: centers + pts, tag links are stubs and are left out; dagre: its edge points).
const L=require(process.env.NL||require('path').join(__dirname,'../../modules/netflow-layers/netflow-layers.js'));const dagre=require('/tmp/pp/node_modules/dagre');const fs=require('fs');
const Lg=JSON.parse(fs.readFileSync(process.env.LG||'/tmp/real-corpus/layers.json'));const opt=process.env.OPT?JSON.parse(process.env.OPT):{dir:'TB'};
function count(lines){let c=0;const o=(a,b,p)=>Math.sign((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
 const segs=[];lines.forEach((l,i)=>{for(let k=0;k+1<l.pts.length;k++){const a=l.pts[k],b=l.pts[k+1];segs.push([a,b,i,l.s,l.t,Math.min(a[0],b[0]),Math.max(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[1],b[1])])}});
 segs.sort((x,y)=>x[5]-y[5]);
 for(let i=0;i<segs.length;i++){const A=segs[i];for(let j=i+1;j<segs.length&&segs[j][5]<=A[6];j++){const B=segs[j];if(A[2]===B[2]||A[3]===B[3]||A[3]===B[4]||A[4]===B[3]||A[4]===B[4])continue;if(B[8]<A[7]||B[7]>A[8])continue;
  if(o(A[0],A[1],B[0])*o(A[0],A[1],B[1])<0&&o(B[0],B[1],A[0])*o(B[0],B[1],A[1])<0)c++}}return c}
const out={};
for(const k of (process.env.KS||'n300,n1000').split(',')){const g=Lg[k];const n=g.nodes.length;const edges=g.edges.sort((a,b)=>b.count-a.count).slice(0,2*n);
 const R=L.layout({root:g.nodes[0],nodes:g.nodes.map(id=>({id,w:140,h:44})),edges:edges.map(e=>({from:e.from,to:e.to,count:e.count}))},opt);
 const P={};R.nodes.forEach(x=>P[x.id]=[x.x,x.y]);
 const nl=R.edges.filter(e=>e.kind!=='tag').map(e=>({s:e.from,t:e.to,pts:[P[e.from]].concat(e.pts||[],[P[e.to]])}));
 const straight=edges.map(e=>({s:e.from,t:e.to,pts:[P[e.from],P[e.to]]}));
 const G=new dagre.graphlib.Graph({multigraph:true});G.setGraph({rankdir:'TB'});G.setDefaultEdgeLabel(()=>({}));g.nodes.forEach(id=>G.setNode(id,{width:140,height:44}));edges.forEach((e,i)=>G.setEdge(e.from,e.to,{},'e'+i));dagre.layout(G);
 const dl=edges.map((e,i)=>({s:e.from,t:e.to,pts:G.edge(e.from,e.to,'e'+i).points.map(p=>[p.x,p.y])}));
 const Q={};g.nodes.forEach(id=>{const x=G.node(id);Q[id]=[x.x,x.y]});const dstraight=edges.map(e=>({s:e.from,t:e.to,pts:[Q[e.from],Q[e.to]]}));
 out[k]={links:edges.length,tags:R.edges.length-nl.length,layers_drawn:count(nl),dagre_drawn:count(dl),layers_straight:count(straight),dagre_straight:count(dstraight)}}
console.log(JSON.stringify(out));
