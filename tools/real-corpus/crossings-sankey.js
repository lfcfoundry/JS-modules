// Copyright (c) 2026 LFC Foundry. MIT License.
const NS=require(__dirname+'/../../modules/netflow-sankey/netflow-sankey.js');const D3=require('/tmp/pp/node_modules/d3-sankey');const fs=require('fs');
const S=JSON.parse(fs.readFileSync('/tmp/real-corpus/sankey.json'));
function wcross(b){let c=0;for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){const p=b[i],q=b[j];if(p.x0!==q.x0||p.x1!==q.x1)continue;if((p.y0-q.y0)*(p.y1-q.y1)<0)c+=p.v*q.v}return c}
const out={};
for(const k of Object.keys(S)){const links=S[k];
 const R=NS.layoutFlows({links:links.map(l=>({from:l.from,to:l.to,value:l.value}))},{height:600});
 const b1=R.bands.map(b=>({x0:b.x0,x1:b.x1,y0:(b.y0a+b.y0b)/2,y1:(b.y1a+b.y1b)/2,v:b.value}));
 const Rq=NS.layoutFlows({links:links.map(l=>({from:l.from,to:l.to,value:l.value}))},{height:600,quick:true});
 const bq=wcross(Rq.bands.map(b=>({x0:b.x0,x1:b.x1,y0:(b.y0a+b.y0b)/2,y1:(b.y1a+b.y1b)/2,v:b.value})));
 const ids=[...new Set(links.flatMap(l=>[l.from,l.to]))];const idx=new Map(ids.map((x,i)=>[x,i]));
 const G=D3.sankey().nodeWidth(15).nodePadding(8).extent([[0,0],[900,600]])({nodes:ids.map(id=>({id})),links:links.map(l=>({source:idx.get(l.from),target:idx.get(l.to),value:l.value}))});
 const b2=G.links.map(l=>({x0:l.source.x1,x1:l.target.x0,y0:l.y0,y1:l.y1,v:l.value}));
 const a=wcross(b1),b=wcross(b2);out[k]={links:links.length,netflow_sankey:a,netflow_sankey_quick:bq,quick_share_of_d3:b?+(bq/b).toFixed(3):null,quick_share_of_default:a?+(bq/a).toFixed(3):null,d3_sankey:b,share:b?+(a/b).toFixed(3):null,bands:b1.length}}
console.log(JSON.stringify(out));
