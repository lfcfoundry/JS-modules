// Real maps for the comparison bench. Copyright (c) 2026 LFC Foundry. MIT License.
// node prep-real.js   (needs /tmp/real-corpus from tools/real-corpus/setup.sh)
// Writes /tmp/real-corpus/eng-<name>-<n>.js as `window.__REAL={n,edges}`: the connected piece of n items found by a breadth-first walk from the best-connected item, with every link between them (duplicates and loops dropped).
const fs = require('fs'), cp = require('child_process'), W = '/tmp/real-corpus/', SIZES = (process.env.SIZES || '300,1000,3000').split(',').map(Number);
function fromTable(cmd, delim, cols, chain) {
  const L = cp.execSync(cmd, { maxBuffer: 1e9 }).toString('utf8').split(/\r?\n/), h = L[0].split(delim), ix = cols.map((c) => h.indexOf(c)), ids = new Map(), E = new Set();
  const id = (k) => { let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
  for (let i = 1; i < L.length; i++) { const r = L[i].split(delim); if (r.length !== h.length) continue; const v = ix.map((j) => r[j]); if (v.some((x) => !x)) continue;
    let prev = null; chain(v).forEach((k) => { const a = id(k); if (prev !== null && prev !== a) E.add(prev + ',' + a); prev = a; }); }
  return { n: ids.size, edges: [...E].map((s) => s.split(',').map(Number)) };
}
const sba = fromTable('unzip -p /mnt/project-files/FY2025_073_Assistance_Full_20261106.zip | head -c 300000000', ',', ['awarding_sub_agency_name', 'recipient_state_name', 'recipient_county_name', 'recipient_zip_code'],
  (v) => ['a:' + v[0], 's:' + v[1], 'c:' + v[1] + '/' + v[2], 'z:' + v[3]]);
const G = JSON.parse(fs.readFileSync(W + 'graphs.json')), F = JSON.parse(fs.readFileSync(W + 'graphs-fhir.json'));
const maps = { sba_agency_state_county_zip: sba, retail_customer_product: { n: G.retail_customer_to_product.n, edges: G.retail_customer_to_product.f.map((a, i) => [a, G.retail_customer_to_product.t[i]]) },
  sec_filing_tag: { n: G.sec_filing_to_tag.n, edges: G.sec_filing_to_tag.f.map((a, i) => [a, G.sec_filing_to_tag.t[i]]) },
  fhir_training_references: { n: F.fhir_reference_graph.n, edges: F.fhir_reference_graph.f.map((a, i) => [a, F.fhir_reference_graph.t[i]]) } };
for (const [name, g] of Object.entries(maps)) {
  const seen = new Set(), E = []; for (const [a, b] of g.edges) { if (a === b) continue; const k = a < b ? a + ',' + b : b + ',' + a; if (seen.has(k)) continue; seen.add(k); E.push([a, b]); }
  const adj = Array.from({ length: g.n }, () => []); E.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  let root = 0; for (let i = 1; i < g.n; i++) if (adj[i].length > adj[root].length) root = i;
  for (const n of SIZES) {
    const at = new Map([[root, 0]]), q = [root]; for (let h = 0; h < q.length && at.size < n; h++) for (const v of adj[q[h]]) { if (at.size >= n) break; if (!at.has(v)) { at.set(v, at.size); q.push(v); } }
    const edges = []; for (const [a, b] of E) if (at.has(a) && at.has(b)) edges.push(g.edges.length && [at.get(a), at.get(b)]);
    fs.writeFileSync(W + `eng-${name}-${n}.js`, 'window.__REAL=' + JSON.stringify({ n: at.size, edges }) + ';');
    console.log(name, n, 'items', at.size, 'links', edges.length, 'of', E.length, 'in the whole map of', g.n);
  }
}
