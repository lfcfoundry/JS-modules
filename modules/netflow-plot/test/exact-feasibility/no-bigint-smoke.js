'use strict';
global.BigInt = undefined;
global.NetflowScene = require('../../../netflow-scene/netflow-scene.js');
const P = require('./netflow-plot-full-exact.js');
const rows = [1e308, 1e308, 1].map((v,i)=>({attrs:{x:i<2?'large':'small',v:v}}));
for (const backend of ['limb','hybrid']) {
  const s = P.makeStage5(rows,{type:'donut',x:'x',y:'v'},{width:600,height:400},global.NetflowScene,backend);
  if (s.marks.length !== 2 || !s.labels.some(l=>l.t==='Out of range')) throw new Error('BigInt-free '+backend+' chart did not preserve extended totals.');
  if (!s.polys.every(p=>p.pts.every(Number.isFinite))) throw new Error('BigInt-free '+backend+' chart emitted non-finite scene coordinates.');
}
console.log('BigInt-unavailable limb and hybrid full-chart smoke passed.');
