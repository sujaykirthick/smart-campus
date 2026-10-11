import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface CampusLocation {
  id: string;
  name: string;
  category: string;
  aliases?: string[];
  lat: number;
  lng: number;
  accuracy: 'verified' | 'approximate';
}

async function main() {
  const locationsFile = path.resolve(process.cwd(), 'data/campus-locations.json');
  const locations: CampusLocation[] = JSON.parse(fs.readFileSync(locationsFile, 'utf-8'));

  const { data: halls, error } = await supabase.from('halls').select('*');
  if (error) {
    console.error('Error fetching halls:', error);
    process.exit(1);
  }

  console.log(`Fetched ${halls?.length || 0} halls from database:`);

  // Build lookup index: lower-cased exact name and aliases
  const locIndex = new Map<string, CampusLocation>();
  for (const loc of locations) {
    locIndex.set(loc.name.trim().toLowerCase(), loc);
    if (loc.aliases) {
      for (const a of loc.aliases) {
        locIndex.set(a.trim().toLowerCase(), loc);
      }
    }
  }

  const matched: { hall: string; location_id: string; locName: string }[] = [];
  const unmatched: string[] = [];

  for (const h of halls || []) {
    const normName = h.name.trim().toLowerCase();
    const match = locIndex.get(normName);
    if (match) {
      matched.push({ hall: h.name, location_id: match.id, locName: match.name });
      // Update DB if location_id column exists
      const { error: upErr } = await supabase
        .from('halls')
        .update({ location_id: match.id })
        .eq('id', h.id);
      if (upErr) {
        console.warn(`  Warning updating hall ${h.name}:`, upErr.message);
      }
    } else {
      unmatched.push(h.name);
    }
  }

  console.log('\n--- MATCHED HALLS ---');
  for (const m of matched) {
    console.log(`✓ "${m.hall}" -> ${m.location_id} (${m.locName})`);
  }

  console.log('\n--- UNMATCHED HALLS ---');
  for (const u of unmatched) {
    console.log(`✗ "${u}" (no match in campus-locations.json)`);
  }
}

main().catch(console.error);
