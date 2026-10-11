import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local if available, else .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Tables to delete in strict foreign-key dependency order
const TABLES_TO_RESET = [
  'event_ai_summaries',
  'organization_ai_advice',
  'reviews',
  'volunteers',
  'registrations',
  'event_approvals',
  'events',
] as const;

async function getTableRowCount(tableName: string): Promise<number> {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (error) {
    // If table doesn't exist or error, return 0
    return 0;
  }
  return count ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const hasConfirm = args.includes('--confirm');

  console.log('====================================================');
  console.log('DEMO DATA RESET UTILITY');
  console.log('====================================================\n');

  // 1. Fetch current counts for each table
  console.log('Current table row counts:');
  const counts: Record<string, number> = {};
  for (const table of TABLES_TO_RESET) {
    const c = await getTableRowCount(table);
    counts[table] = c;
    console.log(`  - ${table.padEnd(25)} : ${c} row${c === 1 ? '' : 's'}`);
  }

  // 2. If --confirm is NOT provided, refuse to run and exit
  if (!hasConfirm) {
    console.log('\n⚠️  Refusing to delete data without the --confirm flag.');
    console.log('To perform a complete reset, run:');
    console.log('  npm run demo:reset -- --confirm\n');
    console.log('Exiting safely without making any changes.');
    process.exit(0);
  }

  // 3. Perform deletion in dependency order
  console.log('\n🚨 --confirm detected. Deleting event data in dependency order...\n');

  for (const table of TABLES_TO_RESET) {
    const countBefore = counts[table] || 0;
    if (countBefore === 0) {
      console.log(`  ✓ ${table.padEnd(25)} : 0 rows (skipped)`);
      continue;
    }

    let delQuery;
    if (table === 'organization_ai_advice') {
      delQuery = supabase.from(table).delete().neq('organization_id', '00000000-0000-0000-0000-000000000000');
    } else if (table === 'event_ai_summaries') {
      delQuery = supabase.from(table).delete().neq('event_id', '00000000-0000-0000-0000-000000000000');
    } else {
      delQuery = supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { error } = await delQuery;
    if (error) {
      console.error(`  ❌ Failed to delete from ${table}:`, error.message);
      continue;
    }

    const countAfter = await getTableRowCount(table);
    const deletedCount = Math.max(0, countBefore - countAfter);
    console.log(`  ✓ Deleted ${deletedCount} rows from ${table} (remaining: ${countAfter})`);
  }

  console.log('\n====================================================');
  console.log('DEMO DATA RESET COMPLETED');
  console.log('Preserved tables: auth.users, allowed_users, halls,');
  console.log('organizations, organization_members, course_code_departments, fests');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Fatal error during demo reset:', err);
  process.exit(1);
});
