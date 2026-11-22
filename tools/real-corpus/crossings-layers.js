// Copyright (c) 2026 LFC Foundry. MIT License.
const L=require(__dirname+'/../../modules/netflow-layers/netflow-layers.js');const dagre=require('/tmp/pp/node_modules/dagre');const fs=require('fs');
const Lg=JSON.parse(fs.readFileSync('/tmp/real-corpus/layers.json'));
function cross(pos,edges){let c=0;const E=edges.map(e=>[pos[e.from],pos[e.to],e.from,e.to]);
 const o=(a,b,p)=>Math.sign((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
 for(let i=0;i<E.length;i++)for(let j=i+1;j<E.length;j++){const [a,b,s1,t1]=E[i],[p,q,s2,t2]=E[j];if(s1===s2||s1===t2||t1===s2||t1===t2)continue;
  if(o(a,b,p)*o(a,b,q)<0&&o(p,q,a)*o(p,q,b)<0)c++}return c}
const out={};
for(const k of ['n300','n1000']){const g=Lg[k];const n=g.nodes.length;const edges=g.edges.sort((a,b)=>b.count-a.count).slice(0,2*n);
 const R=L.layout({root:g.nodes[0],nodes:g.nodes.map(id=>({id,w:140,h:44})),edges:edges.map(e=>({from:e.from,to:e.to,count:e.count}))},{dir:'TB',tagLen:8});
 const p1={};R.nodes.forEach(x=>p1[x.id]=[x.x,x.y]);
 const G=new dagre.graphlib.Graph();G.setGraph({rankdir:'TB'});G.setDefaultEdgeLabel(()=>({}));g.nodes.forEach(id=>G.setNode(id,{width:140,height:44}));edges.forEach(e=>G.setEdge(e.from,e.to));dagre.layout(G);
 const p2={};g.nodes.forEach(id=>{const x=G.node(id);p2[id]=[x.x,x.y]});
 out[k]={nodes:n,links:edges.length,netflow_layers_straight_line_crossings:cross(p1,edges),dagre:cross(p2,edges),netflow_layers_row_crossings_reported:R.crossings}}
console.log(JSON.stringify(out));
