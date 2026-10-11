import fs from 'fs';
import path from 'path';

interface BuildingRecord {
  id: string;
  name?: string;
  category?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  entrance?: any;
  point_type?: string;
  source_serial_number?: number;
}

interface CanonicalLocation {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  lat: number;
  lng: number;
  accuracy: 'verified' | 'approximate';
  source_notes?: string;
}

const copy1Path = 'C:/Users/sujay/Desktop/campus_digital_twin_starter/campus_digital_twin_starter/data/buildings.json';
const copy2Path = 'C:/Users/sujay/Desktop/campus_digital_twin_starter/campus_digital_twin_starter/frontend/src/data/buildings.json';

const copy1: BuildingRecord[] = JSON.parse(fs.readFileSync(copy1Path, 'utf8')).filter((x: any) => x && x.id);
const copy2: BuildingRecord[] = JSON.parse(fs.readFileSync(copy2Path, 'utf8')).filter((x: any) => x && x.id);

const map1 = new Map(copy1.map((b) => [b.id, b]));
const map2 = new Map(copy2.map((b) => [b.id, b]));

const allIds = Array.from(new Set([...map1.keys(), ...map2.keys()])).sort();

// Collect all records to compute campus median
const allValidPoints: { lat: number; lng: number }[] = [];
for (const b of [...copy1, ...copy2]) {
  const lat = Number(b.latitude);
  const lng = Number(b.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    allValidPoints.push({ lat, lng });
  }
}

const sortedLats = allValidPoints.map((p) => p.lat).sort((a, b) => a - b);
const sortedLngs = allValidPoints.map((p) => p.lng).sort((a, b) => a - b);
const medianLat = sortedLats[Math.floor(sortedLats.length / 2)];
const medianLng = sortedLngs[Math.floor(sortedLngs.length / 2)];

// Bounding box: campus boundary is ~1.5km around median (~0.015 degrees)
const MIN_LAT = medianLat - 0.015;
const MAX_LAT = medianLat + 0.015;
const MIN_LNG = medianLng - 0.015;
const MAX_LNG = medianLng + 0.015;

const canonicalList: CanonicalLocation[] = [];
const conflictingList: { id: string; name: string; copy1: any; copy2: any }[] = [];
const singleSourceList: { id: string; name: string; source: string }[] = [];

// Alias mapping dictionary for high-traffic places
const aliasMap: Record<string, string[]> = {
  P001: ['Ettimadai Station', 'Railway Station'],
  P002: ['AB2', 'AB-2', 'Academic Block 2'],
  P003: ['AB3', 'AB-3', 'Academic Block 3'],
  P004: ['AB1', 'AB-1', 'Academic Block 1'],
  P008: ['Amriteshwari', 'Amriteshwari Auditorium'],
  P010: ['Sopanam', 'Main Canteen'],
  P016: ['AB1', 'Academic Block 1'],
  P020: ['Samudara', 'IT Canteen'],
  P027: ['Library', 'Central Library'],
  P028: ['Temple', 'Kalari'],
  P032: ['Ammachi', 'Robotics Lab'],
  P036: ['AOC', 'Office of Communication'],
};

for (const id of allIds) {
  const r1 = map1.get(id);
  const r2 = map2.get(id);

  let name = r2?.name || r1?.name || id;
  let category = r2?.category || r1?.category || 'campus_location';
  let lat = Number(r2?.latitude ?? r1?.latitude ?? 0);
  let lng = Number(r2?.longitude ?? r1?.longitude ?? 0);
  let accuracy: 'verified' | 'approximate' = 'verified';
  let sourceNotes: string | undefined = undefined;

  const aliases: string[] = aliasMap[id] ? [...aliasMap[id]] : [];
  if (r1?.name && r2?.name && r1.name !== r2.name) {
    if (!aliases.includes(r1.name)) aliases.push(r1.name);
    if (!aliases.includes(r2.name)) aliases.push(r2.name);
  }

  if (r1 && r2) {
    const lat1 = Number(r1.latitude);
    const lng1 = Number(r1.longitude);
    const lat2 = Number(r2.latitude);
    const lng2 = Number(r2.longitude);

    const latDiff = Math.abs(lat1 - lat2);
    const lngDiff = Math.abs(lng1 - lng2);

    // If coordinates differ by more than ~1 meter (0.00001 deg)
    if (latDiff > 0.00001 || lngDiff > 0.00001) {
      accuracy = 'approximate';
      sourceNotes = `Coordinate discrepancy between Copy 1 (${lat1.toFixed(6)}, ${lng1.toFixed(6)}) and Copy 2 (${lat2.toFixed(6)}, ${lng2.toFixed(6)}).`;
      conflictingList.push({
        id,
        name,
        copy1: { lat: lat1, lng: lng1 },
        copy2: { lat: lat2, lng: lng2 },
      });
      // Prefer Copy 2 (frontend surveyed) coordinates
      lat = lat2;
      lng = lng2;
    } else {
      accuracy = 'verified';
    }
  } else {
    // Only in one copy
    accuracy = 'approximate';
    sourceNotes = r1 ? 'Present only in Copy 1 (data/buildings.json).' : 'Present only in Copy 2 (frontend/src/data/buildings.json).';
    singleSourceList.push({
      id,
      name,
      source: r1 ? 'Copy 1 only' : 'Copy 2 only',
    });
  }

  // Check bounding box
  const outOfRange = lat < MIN_LAT || lat > MAX_LAT || lng < MIN_LNG || lng > MAX_LNG;
  if (outOfRange) {
    accuracy = 'approximate';
    sourceNotes = (sourceNotes ? sourceNotes + ' ' : '') + 'Out of typical campus bounding box.';
  }

  canonicalList.push({
    id,
    name,
    category,
    aliases,
    lat: Number(lat.toFixed(7)),
    lng: Number(lng.toFixed(7)),
    accuracy,
    ...(sourceNotes ? { source_notes: sourceNotes } : {}),
  });
}

const outDir = path.resolve('data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'campus-locations.json');
fs.writeFileSync(outPath, JSON.stringify(canonicalList, null, 2), 'utf8');

console.log(`✓ Generated ${canonicalList.length} canonical campus locations at: ${outPath}`);
console.log(`- Verified records: ${canonicalList.filter((x) => x.accuracy === 'verified').length}`);
console.log(`- Approximate records: ${canonicalList.filter((x) => x.accuracy === 'approximate').length}`);
console.log(`- Conflicting coordinates count: ${conflictingList.length}`);
console.log(`- Single-source count: ${singleSourceList.length}`);
console.log(`- Campus Center Median: Lat ${medianLat.toFixed(6)}, Lng ${medianLng.toFixed(6)}`);
console.log(`- Campus Bounding Box: [${MIN_LAT.toFixed(4)}, ${MIN_LNG.toFixed(4)}] to [${MAX_LAT.toFixed(4)}, ${MAX_LNG.toFixed(4)}]`);
