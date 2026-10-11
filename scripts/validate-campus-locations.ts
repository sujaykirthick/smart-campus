import fs from 'fs';
import path from 'path';

interface LocationRecord {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  lat: number;
  lng: number;
  accuracy: 'verified' | 'approximate';
  source_notes?: string;
}

const targetPath = path.resolve('data/campus-locations.json');

if (!fs.existsSync(targetPath)) {
  console.error(`❌ File not found: ${targetPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(targetPath, 'utf8');
let records: LocationRecord[];

try {
  records = JSON.parse(raw);
} catch (err: any) {
  console.error(`❌ Invalid JSON syntax: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(records) || records.length === 0) {
  console.error('❌ Data must be a non-empty array.');
  process.exit(1);
}

// Campus bounding box around Ettimadai campus
const BOUNDS = {
  minLat: 10.887,
  maxLat: 10.917,
  minLng: 76.886,
  maxLng: 76.916,
};

const seenIds = new Set<string>();
const errors: string[] = [];

records.forEach((loc, index) => {
  const prefix = `Record #${index} (ID: ${loc.id || 'MISSING'})`;

  if (!loc.id || typeof loc.id !== 'string') {
    errors.push(`${prefix}: Missing or invalid 'id'.`);
  } else if (seenIds.has(loc.id)) {
    errors.push(`${prefix}: Duplicate ID '${loc.id}'.`);
  } else {
    seenIds.add(loc.id);
  }

  if (!loc.name || typeof loc.name !== 'string') {
    errors.push(`${prefix}: Missing or invalid 'name'.`);
  }

  if (!loc.category || typeof loc.category !== 'string') {
    errors.push(`${prefix}: Missing or invalid 'category'.`);
  }

  if (!Array.isArray(loc.aliases)) {
    errors.push(`${prefix}: 'aliases' must be an array.`);
  }

  if (typeof loc.lat !== 'number' || !Number.isFinite(loc.lat)) {
    errors.push(`${prefix}: 'lat' must be a finite number.`);
  } else if (loc.lat < BOUNDS.minLat || loc.lat > BOUNDS.maxLat) {
    errors.push(`${prefix}: 'lat' ${loc.lat} is outside campus bounding box [${BOUNDS.minLat}, ${BOUNDS.maxLat}].`);
  }

  if (typeof loc.lng !== 'number' || !Number.isFinite(loc.lng)) {
    errors.push(`${prefix}: 'lng' must be a finite number.`);
  } else if (loc.lng < BOUNDS.minLng || loc.lng > BOUNDS.maxLng) {
    errors.push(`${prefix}: 'lng' ${loc.lng} is outside campus bounding box [${BOUNDS.minLng}, ${BOUNDS.maxLng}].`);
  }

  if (loc.accuracy !== 'verified' && loc.accuracy !== 'approximate') {
    errors.push(`${prefix}: 'accuracy' must be 'verified' or 'approximate'. Found: '${loc.accuracy}'.`);
  }
});

if (errors.length > 0) {
  console.error(`❌ Validation failed with ${errors.length} error(s):`);
  errors.slice(0, 10).forEach((e) => console.error(`  - ${e}`));
  if (errors.length > 10) console.error(`  ... and ${errors.length - 10} more`);
  process.exit(1);
}

const verifiedCount = records.filter((r) => r.accuracy === 'verified').length;
const approxCount = records.filter((r) => r.accuracy === 'approximate').length;
const categories = Array.from(new Set(records.map((r) => r.category)));

console.log(`✅ Validation passed for data/campus-locations.json!`);
console.log(`- Total valid locations: ${records.length}`);
console.log(`- Verified locations: ${verifiedCount}`);
console.log(`- Approximate locations: ${approxCount}`);
console.log(`- Categories (${categories.length}): ${categories.join(', ')}`);
