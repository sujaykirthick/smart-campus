import fs from 'fs';

interface LatLng {
  lat: number;
  lng: number;
}

interface Node {
  id: string;
  lat: number;
  lng: number;
}

interface Edge {
  from: string;
  to: string;
  distance: number; // in meters
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const geojson = JSON.parse(fs.readFileSync('./data/campus-buildings.json', 'utf-8'));
const locations = JSON.parse(fs.readFileSync('./data/campus-locations.json', 'utf-8'));

// 1. Collect all road / path segments
const rawLines: Array<Array<[number, number]>> = [];

for (const f of geojson.features) {
  if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
    rawLines.push(f.geometry.coordinates);
  }
}

console.log(`Found ${rawLines.length} road/path LineStrings.`);

// 2. Extract and cluster nodes within 8m threshold
const rawPoints: Array<{ lat: number; lng: number }> = [];
const linePointIndices: number[][] = [];

rawLines.forEach((line) => {
  const indices: number[] = [];
  line.forEach(([lng, lat]) => {
    rawPoints.push({ lat, lng });
    indices.push(rawPoints.length - 1);
  });
  linePointIndices.push(indices);
});

// Cluster raw points within 8 meters into unique nodes
const nodeMap: number[] = new Array(rawPoints.length).fill(-1);
const clusteredNodes: Node[] = [];

for (let i = 0; i < rawPoints.length; i++) {
  if (nodeMap[i] !== -1) continue;

  const cluster = [i];
  let sumLat = rawPoints[i].lat;
  let sumLng = rawPoints[i].lng;

  for (let j = i + 1; j < rawPoints.length; j++) {
    if (nodeMap[j] !== -1) continue;
    const dist = haversineM(rawPoints[i].lat, rawPoints[i].lng, rawPoints[j].lat, rawPoints[j].lng);
    if (dist <= 8.0) {
      cluster.push(j);
      sumLat += rawPoints[j].lat;
      sumLng += rawPoints[j].lng;
    }
  }

  const newNodeId = `n${clusteredNodes.length}`;
  const avgLat = sumLat / cluster.length;
  const avgLng = sumLng / cluster.length;

  clusteredNodes.push({
    id: newNodeId,
    lat: avgLat,
    lng: avgLng,
  });

  const nodeIdx = clusteredNodes.length - 1;
  cluster.forEach((ptIdx) => {
    nodeMap[ptIdx] = nodeIdx;
  });
}

console.log(`Clustered ${rawPoints.length} points into ${clusteredNodes.length} nodes (<= 8m threshold).`);

// Also link path ends that are within 8m of each other or any node
// 3. Build unique edge set
const edgeSet = new Map<string, { from: string; to: string; distance: number }>();

function addEdge(n1Idx: number, n2Idx: number) {
  if (n1Idx === n2Idx) return;
  const id1 = clusteredNodes[n1Idx].id;
  const id2 = clusteredNodes[n2Idx].id;
  const key = n1Idx < n2Idx ? `${id1}_${id2}` : `${id2}_${id1}`;
  if (!edgeSet.has(key)) {
    const dist = haversineM(
      clusteredNodes[n1Idx].lat,
      clusteredNodes[n1Idx].lng,
      clusteredNodes[n2Idx].lat,
      clusteredNodes[n2Idx].lng
    );
    edgeSet.set(key, { from: id1, to: id2, distance: Math.round(dist * 10) / 10 });
  }
}

// Add consecutive edges from lines
linePointIndices.forEach((line) => {
  for (let i = 0; i < line.length - 1; i++) {
    const n1 = nodeMap[line[i]];
    const n2 = nodeMap[line[i + 1]];
    addEdge(n1, n2);
  }
});

// Join nearby path ends / nodes within 8 meters that might be slightly disjoint
for (let i = 0; i < clusteredNodes.length; i++) {
  for (let j = i + 1; j < clusteredNodes.length; j++) {
    const d = haversineM(
      clusteredNodes[i].lat,
      clusteredNodes[i].lng,
      clusteredNodes[j].lat,
      clusteredNodes[j].lng
    );
    if (d <= 8.0) {
      addEdge(i, j);
    }
  }
}

const edges: Edge[] = Array.from(edgeSet.values());
console.log(`Created ${edges.length} walking edges.`);

// 4. Compute connected components (BFS)
const adj = new Map<string, Array<{ to: string; dist: number }>>();
clusteredNodes.forEach((n) => adj.set(n.id, []));

edges.forEach((e) => {
  adj.get(e.from)?.push({ to: e.to, dist: e.distance });
  adj.get(e.to)?.push({ to: e.from, dist: e.distance });
});

const visited = new Set<string>();
const components: string[][] = [];

clusteredNodes.forEach((n) => {
  if (!visited.has(n.id)) {
    const comp: string[] = [];
    const queue = [n.id];
    visited.add(n.id);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      const neighbors = adj.get(cur) || [];
      neighbors.forEach((nb) => {
        if (!visited.has(nb.to)) {
          visited.add(nb.to);
          queue.push(nb.to);
        }
      });
    }

    components.push(comp);
  }
});

components.sort((a, b) => b.length - a.length);
console.log(`Total disconnected components: ${components.length}`);
console.log(`Main component contains ${components[0].length} of ${clusteredNodes.length} nodes (${Math.round((components[0].length / clusteredNodes.length) * 100)}%).`);

const mainCompSet = new Set(components[0]);

// 5. Check which campus locations are closest to the main component vs a disconnected component
const locComponentInfo: Array<{ id: string; name: string; nearestComp: number; distToNodeM: number; inMainComp: boolean }> = [];

locations.forEach((loc: any) => {
  let bestNode: any = null;
  let minDist = Infinity;

  clusteredNodes.forEach((n) => {
    const d = haversineM(loc.lat, loc.lng, n.lat, n.lng);
    if (d < minDist) {
      minDist = d;
      bestNode = n;
    }
  });

  const inMain = bestNode ? mainCompSet.has(bestNode.id) : false;
  let compIndex = 0;
  if (bestNode) {
    for (let c = 0; c < components.length; c++) {
      if (components[c].includes(bestNode.id)) {
        compIndex = c;
        break;
      }
    }
  }

  locComponentInfo.push({
    id: loc.id,
    name: loc.name,
    nearestComp: compIndex,
    distToNodeM: Math.round(minDist),
    inMainComp: inMain,
  });
});

const disconnectedLocations = locComponentInfo.filter((l) => !l.inMainComp);
console.log(`\nLocations in disconnected components: ${disconnectedLocations.length}`);
disconnectedLocations.forEach((l) => {
  console.log(`- ${l.id} (${l.name}): Nearest node is in component #${l.nearestComp} (${l.distToNodeM}m away)`);
});

// 6. Save data/campus-walk-graph.json
const graphData = {
  metadata: {
    source: "OpenStreetMap contributors (ODbL)",
    generated_at: new Date().toISOString(),
    total_nodes: clusteredNodes.length,
    total_edges: edges.length,
    components_count: components.length,
    main_component_nodes: components[0].length,
  },
  nodes: clusteredNodes,
  edges,
};

fs.writeFileSync('./data/campus-walk-graph.json', JSON.stringify(graphData, null, 2), 'utf-8');
console.log('Saved data/campus-walk-graph.json successfully.');
