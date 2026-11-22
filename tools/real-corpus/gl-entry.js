// Copyright (c) 2026 LFC Foundry. MIT License.
const Graph=require('graphology');const {connectedComponents,stronglyConnectedComponents}=require('graphology-components');const {singleSourceLength:unweightedSingleSource}=require('graphology-shortest-path/unweighted');
window.GL={Graph,connectedComponents,stronglyConnectedComponents,bfs:unweightedSingleSource};
