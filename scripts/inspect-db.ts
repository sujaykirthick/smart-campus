import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('--- Inspecting DB state ---');

  // Check if is_org_member exists
  const { data: orgs } = await admin.from('organizations').select('id, name, type').limit(3);
  console.log('Sample orgs:', orgs);

  if (orgs && orgs.length > 0) {
    const testOrg = orgs[0];
    const { data: isMember, error: isMemberErr } = await admin.rpc('is_org_member', {
      p_org_id: testOrg.id,
      p_email: 'student4@demo.edu',
    });
    console.log(`rpc is_org_member(p_org_id, p_email):`, isMember, isMemberErr?.message || 'No error');
  }

  // Check student4 credentials
  const student4Client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: s4Auth, error: s4AuthErr } = await student4Client.auth.signInWithPassword({
    email: 'student4@demo.edu',
    password: 'demo1234',
  });
  console.log('student4 sign in:', s4Auth?.user?.email, s4AuthErr?.message || 'OK');

  // Get a club org
  const { data: club } = await admin.from('organizations').select('id, name').eq('type', 'club').limit(1).single();
  const { data: hall } = await admin.from('halls').select('id').limit(1).single();

  console.log('Target club:', club?.name, club?.id);

  // Attempt insert as student4
  if (club && hall && !s4AuthErr) {
    const { data: insertedEvent, error: insertErr } = await student4Client.from('events').insert({
      title: 'Testing Club Exclusivity Insert',
      description: 'Test',
      organizer_type: 'club',
      organization_id: club.id,
      organizer_email: 'student4@demo.edu',
      status: 'draft',
      approval_stage: 'draft',
      hall_id: hall.id,
      start_time: new Date(Date.now() + 86400000 * 5).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(),
    }).select('id').single();

    if (insertErr) {
      console.log('student4 insert result: BLOCKED ->', insertErr.message);
    } else {
      console.log('student4 insert result: ALLOWED (UNEXPECTED!) ->', insertedEvent?.id);
      // Clean up
      await admin.from('events').delete().eq('id', insertedEvent.id);
    }
  }
}

main().catch(console.error);
