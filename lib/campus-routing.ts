import walkGraph from '@/data/campus-walk-graph.json';

export interface RouteStep {
  instruction: string;
  distance_m: number;
  relative_direction?: 'straight' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'sharp_left' | 'sharp_right' | 'arrive';
}

export interface InAppRouteResult {
  success: boolean;
  is_fallback: boolean;
  fallback_reason?: string;
  distance_m: number;
  distance_km: number;
  distance_label: string;
  duration_sec: number;
  duration_min: number;
  duration_label: string;
  leave_by?: string;
  leave_by_event?: string;
  coordinates: [number, number][]; // [lat, lng][]
  steps: RouteStep[];
}

export interface LatLng {
  lat: number;
  lng: number;
}

export const CAMPUS_CENTER: [number, number] = [10.9008, 76.9025];
export const CAMPUS_MAX_RADIUS_M = 2500; // 2.5 km bounds for GPS check
export const MAX_SNAP_DISTANCE_M = 80; // Maximum allowed distance to snap to a pathway
export const WALKING_SPEED_MPS = 1.3; // 1.3 meters per second (~4.7 km/h)

// Haversine formula in meters
export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// Calculate bearing between two points in degrees [0, 360)
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function bearingToCardinal(bearing: number): string {
  const cardinals = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const index = Math.round(bearing / 45) % 8;
  return cardinals[index];
}

// Pre-build adjacency list from walkGraph
interface GraphNode {
  id: string;
  lat: number;
  lng: number;
}

interface AdjacencyEdge {
  to: string;
  distance: number;
}

const nodeById = new Map<string, GraphNode>();
const adjacency = new Map<string, AdjacencyEdge[]>();

walkGraph.nodes.forEach((n) => {
  nodeById.set(n.id, n);
  adjacency.set(n.id, []);
});

walkGraph.edges.forEach((e) => {
  adjacency.get(e.from)?.push({ to: e.to, distance: e.distance });
  adjacency.get(e.to)?.push({ to: e.from, distance: e.distance });
});

// Snap point to nearest graph node
export function snapToGraph(
  lat: number,
  lng: number
): { node: GraphNode; distance_m: number } | null {
  let bestNode: GraphNode | null = null;
  let minDist = Infinity;

  walkGraph.nodes.forEach((n) => {
    const d = haversineDistanceM(lat, lng, n.lat, n.lng);
    if (d < minDist) {
      minDist = d;
      bestNode = n;
    }
  });

  if (!bestNode) return null;
  return { node: bestNode, distance_m: minDist };
}

// Check if user is inside/near campus
export function isWithinCampusBounds(lat: number, lng: number): boolean {
  const dist = haversineDistanceM(lat, lng, CAMPUS_CENTER[0], CAMPUS_CENTER[1]);
  return dist <= CAMPUS_MAX_RADIUS_M;
}

// Generate human-friendly turn-by-turn directions from coordinates
function generateTurnSteps(
  coordinates: [number, number][],
  destinationName: string
): RouteStep[] {
  if (coordinates.length <= 1) {
    return [{ instruction: `Arrive at ${destinationName}`, distance_m: 0, relative_direction: 'arrive' }];
  }

  const steps: RouteStep[] = [];
  let currentDistance = 0;
  let currentBearing = calculateBearing(
    coordinates[0][0],
    coordinates[0][1],
    coordinates[1][0],
    coordinates[1][1]
  );
  let initialHeading = `Head ${bearingToCardinal(currentBearing)}`;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lat1, lng1] = coordinates[i];
    const [lat2, lng2] = coordinates[i + 1];
    const segDist = haversineDistanceM(lat1, lng1, lat2, lng2);
    currentDistance += segDist;

    if (i < coordinates.length - 2) {
      const [lat3, lng3] = coordinates[i + 2];
      const nextBearing = calculateBearing(lat2, lng2, lat3, lng3);
      let angleDiff = nextBearing - currentBearing;
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;

      // Check if turn exceeds threshold (>= 30 degrees) and segment is substantial
      if (Math.abs(angleDiff) >= 30 && currentDistance >= 15) {
        let turnText = 'Continue straight';
        let relDir: RouteStep['relative_direction'] = 'straight';

        if (angleDiff > 45 && angleDiff <= 130) {
          turnText = 'Turn right';
          relDir = 'right';
        } else if (angleDiff > 130) {
          turnText = 'Turn sharp right';
          relDir = 'sharp_right';
        } else if (angleDiff > 25 && angleDiff <= 45) {
          turnText = 'Slight right';
          relDir = 'slight_right';
        } else if (angleDiff < -45 && angleDiff >= -130) {
          turnText = 'Turn left';
          relDir = 'left';
        } else if (angleDiff < -130) {
          turnText = 'Turn sharp left';
          relDir = 'sharp_left';
        } else if (angleDiff < -25 && angleDiff >= -45) {
          turnText = 'Slight left';
          relDir = 'slight_left';
        }

        const stepMsg = steps.length === 0
          ? `${initialHeading} for ${Math.round(currentDistance)} m`
          : `Walk ${Math.round(currentDistance)} m`;

        steps.push({
          instruction: stepMsg,
          distance_m: Math.round(currentDistance),
          relative_direction: relDir,
        });

        steps.push({
          instruction: turnText,
          distance_m: 0,
          relative_direction: relDir,
        });

        currentDistance = 0;
        currentBearing = nextBearing;
      }
    }
  }

  if (currentDistance > 0) {
    const stepMsg = steps.length === 0
      ? `${initialHeading} for ${Math.round(currentDistance)} m`
      : `Walk ${Math.round(currentDistance)} m`;
    steps.push({
      instruction: stepMsg,
      distance_m: Math.round(currentDistance),
      relative_direction: 'straight',
    });
  }

  steps.push({
    instruction: `Arrive at ${destinationName}`,
    distance_m: 0,
    relative_direction: 'arrive',
  });

  return steps;
}

// A* / Dijkstra algorithm to find shortest walking route
export function calculateInAppRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  destinationName = 'Destination',
  upcomingEvents?: Array<{ title: string; start_time: string }>
): InAppRouteResult {
  // Case 1: Start and destination are identical
  const directDist = haversineDistanceM(startLat, startLng, endLat, endLng);
  if (directDist < 5) {
    return {
      success: true,
      is_fallback: false,
      distance_m: 0,
      distance_km: 0,
      distance_label: '0 m',
      duration_sec: 0,
      duration_min: 0,
      duration_label: '0 min',
      coordinates: [[startLat, startLng]],
      steps: [{ instruction: `You are already at ${destinationName}`, distance_m: 0, relative_direction: 'arrive' }],
    };
  }

  // Case 2: Snap start & end to nearest pathway nodes
  const startSnap = snapToGraph(startLat, startLng);
  const endSnap = snapToGraph(endLat, endLng);

  // Fallback straight line if snap distance exceeds 80m
  if (
    !startSnap ||
    !endSnap ||
    startSnap.distance_m > MAX_SNAP_DISTANCE_M ||
    endSnap.distance_m > MAX_SNAP_DISTANCE_M
  ) {
    const fallbackReason = !startSnap || startSnap.distance_m > MAX_SNAP_DISTANCE_M
      ? `Start location is too far from campus walking paths (${startSnap ? Math.round(startSnap.distance_m) : 99}m away)`
      : `Destination is too far from campus walking paths (${endSnap ? Math.round(endSnap.distance_m) : 99}m away)`;

    const totalDist = Math.round(directDist);
    const durSec = Math.round(totalDist / WALKING_SPEED_MPS);
    const durMin = Math.max(1, Math.round(durSec / 60));

    return {
      success: true,
      is_fallback: true,
      fallback_reason: `Approximate straight-line distance (no mapped walking path): ${fallbackReason}`,
      distance_m: totalDist,
      distance_km: Math.round((totalDist / 1000) * 10) / 10,
      distance_label: totalDist >= 1000 ? `${(totalDist / 1000).toFixed(2)} km` : `${totalDist} m`,
      duration_sec: durSec,
      duration_min: durMin,
      duration_label: `${durMin} min`,
      coordinates: [[startLat, startLng], [endLat, endLng]],
      steps: [
        { instruction: `Head directly toward ${destinationName}`, distance_m: totalDist, relative_direction: 'straight' },
        { instruction: `Arrive at ${destinationName}`, distance_m: 0, relative_direction: 'arrive' },
      ],
    };
  }

  // A* Search on walking graph
  const startId = startSnap.node.id;
  const targetId = endSnap.node.id;

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const openSet = new Set<string>([startId]);

  gScore.set(startId, 0);
  fScore.set(
    startId,
    haversineDistanceM(startSnap.node.lat, startSnap.node.lng, endSnap.node.lat, endSnap.node.lng)
  );

  let pathFound = false;

  while (openSet.size > 0) {
    // Find node in openSet with lowest fScore
    let currentId: string | null = null;
    let lowestF = Infinity;

    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentId = id;
      }
    }

    if (!currentId) break;

    if (currentId === targetId) {
      pathFound = true;
      break;
    }

    openSet.delete(currentId);
    const curG = gScore.get(currentId) ?? Infinity;
    const neighbors = adjacency.get(currentId) || [];

    for (const edge of neighbors) {
      const tentativeG = curG + edge.distance;
      const nbG = gScore.get(edge.to) ?? Infinity;

      if (tentativeG < nbG) {
        cameFrom.set(edge.to, currentId);
        gScore.set(edge.to, tentativeG);
        const nbNode = nodeById.get(edge.to)!;
        const h = haversineDistanceM(nbNode.lat, nbNode.lng, endSnap.node.lat, endSnap.node.lng);
        fScore.set(edge.to, tentativeG + h);
        openSet.add(edge.to);
      }
    }
  }

  // Fallback straight-line if disconnected component (no path between start and end)
  if (!pathFound) {
    const totalDist = Math.round(directDist);
    const durSec = Math.round(totalDist / WALKING_SPEED_MPS);
    const durMin = Math.max(1, Math.round(durSec / 60));

    return {
      success: true,
      is_fallback: true,
      fallback_reason: 'Approximate straight-line distance (no mapped walking path between these campus areas)',
      distance_m: totalDist,
      distance_km: Math.round((totalDist / 1000) * 10) / 10,
      distance_label: totalDist >= 1000 ? `${(totalDist / 1000).toFixed(2)} km` : `${totalDist} m`,
      duration_sec: durSec,
      duration_min: durMin,
      duration_label: `${durMin} min`,
      coordinates: [[startLat, startLng], [endLat, endLng]],
      steps: [
        { instruction: `Walk straight towards ${destinationName}`, distance_m: totalDist, relative_direction: 'straight' },
        { instruction: `Arrive at ${destinationName}`, distance_m: 0, relative_direction: 'arrive' },
      ],
    };
  }

  // Reconstruct path
  const pathNodeIds: string[] = [];
  let curr: string | undefined = targetId;
  while (curr) {
    pathNodeIds.unshift(curr);
    curr = cameFrom.get(curr);
  }

  // Build complete coordinate array including exact start and end points
  const rawCoords: [number, number][] = [[startLat, startLng]];
  pathNodeIds.forEach((id) => {
    const n = nodeById.get(id);
    if (n) rawCoords.push([n.lat, n.lng]);
  });
  rawCoords.push([endLat, endLng]);

  // Remove consecutive duplicates
  const coordinates: [number, number][] = [];
  rawCoords.forEach((pt) => {
    if (
      coordinates.length === 0 ||
      coordinates[coordinates.length - 1][0] !== pt[0] ||
      coordinates[coordinates.length - 1][1] !== pt[1]
    ) {
      coordinates.push(pt);
    }
  });

  // Calculate actual total distance along route
  let totalDistance = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalDistance += haversineDistanceM(
      coordinates[i][0],
      coordinates[i][1],
      coordinates[i + 1][0],
      coordinates[i + 1][1]
    );
  }
  const roundedDist = Math.round(totalDistance);
  const durationSec = Math.round(roundedDist / WALKING_SPEED_MPS);
  const durationMin = Math.max(1, Math.round(durationSec / 60));

  // Turn-by-turn steps
  const steps = generateTurnSteps(coordinates, destinationName);

  // Compute "Leave by HH:MM" if there are upcoming events today
  let leaveBy: string | undefined;
  let leaveByEvent: string | undefined;

  if (upcomingEvents && upcomingEvents.length > 0) {
    const now = new Date();
    const todayYMD = now.toISOString().split('T')[0];

    const todayEvents = upcomingEvents.filter((e) => {
      const evDate = new Date(e.start_time);
      return evDate.toISOString().split('T')[0] === todayYMD && evDate.getTime() > now.getTime();
    });

    if (todayEvents.length > 0) {
      // Pick earliest upcoming event today
      todayEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      const ev = todayEvents[0];
      const evTime = new Date(ev.start_time).getTime();
      const leaveTime = new Date(evTime - durationSec * 1000 - 2 * 60 * 1000); // 2-min cushion

      if (leaveTime.getTime() > now.getTime()) {
        leaveBy = leaveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        leaveByEvent = ev.title;
      }
    }
  }

  return {
    success: true,
    is_fallback: false,
    distance_m: roundedDist,
    distance_km: Math.round((roundedDist / 1000) * 10) / 10,
    distance_label: roundedDist >= 1000 ? `${(roundedDist / 1000).toFixed(2)} km` : `${roundedDist} m`,
    duration_sec: durationSec,
    duration_min: durationMin,
    duration_label: `${durationMin} min`,
    leave_by: leaveBy,
    leave_by_event: leaveByEvent,
    coordinates,
    steps,
  };
}
