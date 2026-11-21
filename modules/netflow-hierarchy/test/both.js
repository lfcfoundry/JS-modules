/* Copyright (c) 2026 LFC Foundry. MIT License. The two view modules together, shaped like Netflow Map's own charts file, so the app's checks run unchanged. */
'use strict';
if (process.env.NH_FILE) global.NetflowHierarchy = require(process.env.NH_FILE ? require('path').resolve(process.env.NH_FILE) : '../netflow-hierarchy.js');   /* NH_FILE=path checks another copy (the minified file); the circular views then build on that copy too */
const H = require(process.env.NH_FILE ? require('path').resolve(process.env.NH_FILE) : '../netflow-hierarchy.js'), C = require('../../netflow-circular/netflow-circular.js');
module.exports = {
  VIEWS: C.VIEWS.concat(H.VIEWS), IS: Object.assign({}, C.IS, H.IS), NESTED: Object.assign({}, C.NESTED, H.NESTED),
  layout: (v, G, o) => (C.IS[v] ? C.layout(v, G, o) : H.layout(v, G, o)),
  scene: (L, o, NS) => (L.chart && C.IS[L.chart.type] ? C.scene(L, o, NS) : H.scene(L, o, NS)),
  hierarchy: H.hierarchy, packSiblings: H.packSiblings, enclose: H.enclose, bsplineToBezier: C.bsplineToBezier, linkValue: H.linkValue
};
