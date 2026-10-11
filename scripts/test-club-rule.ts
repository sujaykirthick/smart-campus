import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getClientFor(email: string) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: 'demo1234',
  });
  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }
  return client;
}

async function run() {
  console.log('====================================================');
  console.log('TESTING CLUB EXCLUSIVITY RULE (scripts/test-club-rule.ts)');
  console.log('====================================================\n');

  // 1. Get a club and a valid hall
  const { data: club } = await admin.from('organizations').select('id, name').eq('type', 'club').limit(1).single();
  const { data: hall } = await admin.from('halls').select('id').limit(1).single();

  if (!club || !hall) {
    console.error('Missing sample club or hall.');
    return;
  }

  console.log(`Target Club: "${club.name}" (${club.id})`);
  console.log(`Target Hall ID: ${hall.id}\n`);

  // Sign in as student4 (non-member)
  const student4Client = await getClientFor('student4@demo.edu');

  // Ensure student4 is definitely not in organization_members for this club
  await admin.from('organization_members').delete().match({ organization_id: club.id, email: 'student4@demo.edu' });

  // -------------------------------------------------------------------------
  // TEST 1: Non-member insert blocked
  // -------------------------------------------------------------------------
  console.log('1. Testing non-member (student4) direct insert for club event...');
  const { error: nonMemberInsertErr } = await student4Client.from('events').insert({
    title: 'Hacked Club Event by Non-Member',
    description: 'Should be rejected',
    organizer_type: 'club',
    organization_id: club.id,
    organizer_email: 'student4@demo.edu',
    status: 'draft',
    approval_stage: 'student_affairs',
    hall_id: hall.id,
    start_time: new Date(Date.now() + 86400000 * 5).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(),
  });

  const expectedErrMsg = 'You are not authorized to host events for this club. Ask Student Affairs to add you.';
  if (nonMemberInsertErr && nonMemberInsertErr.message.includes(expectedErrMsg)) {
    console.log(`[PASS] Non-member insert blocked: "${nonMemberInsertErr.message}"`);
  } else {
    console.error(`[FAIL] Non-member insert was NOT blocked as expected:`, nonMemberInsertErr);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Member insert allowed
  // -------------------------------------------------------------------------
  console.log('\n2. Testing member (student1) direct insert for club event...');
  // Ensure student1 is a member of the target club
  await admin.from('organization_members').upsert({
    organization_id: club.id,
    email: 'student1@demo.edu',
    member_role: 'member',
  });

  const student1Client = await getClientFor('student1@demo.edu');
  const { data: memberEvent, error: memberInsertErr } = await student1Client
    .from('events')
    .insert({
      title: 'Legitimate Club Event by Member',
      description: 'Authorized proposal',
      organizer_type: 'club',
      organization_id: club.id,
      organizer_email: 'student1@demo.edu',
      status: 'draft',
      approval_stage: 'student_affairs',
      hall_id: hall.id,
      start_time: new Date(Date.now() + 86400000 * 6).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 6 + 3600000).toISOString(),
    })
    .select('id')
    .single();

  if (memberInsertErr) {
    console.error(`[FAIL] Member insert failed:`, memberInsertErr.message);
  } else {
    console.log(`[PASS] Member insert allowed: Event ID ${memberEvent.id}`);
    // Clean up created event
    await admin.from('events').delete().eq('id', memberEvent.id);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Non-member changing organization_id on a draft blocked
  // -------------------------------------------------------------------------
  console.log('\n3. Testing non-member (student4) updating organization_id on draft to unauthorized club...');
  // Create an authorized standalone draft by student4
  const { data: draftEvent, error: draftErr } = await student4Client
    .from('events')
    .insert({
      title: 'Valid Standalone Draft by student4',
      description: 'Draft',
      organizer_type: 'standalone',
      organization_id: null,
      organizer_email: 'student4@demo.edu',
      status: 'draft',
      approval_stage: 'student_affairs',
      hall_id: hall.id,
      start_time: new Date(Date.now() + 86400000 * 7).toISOString(),
      end_time: new Date(Date.now() + 86400000 * 7 + 3600000).toISOString(),
    })
    .select('id')
    .single();

  if (draftErr || !draftEvent) {
    console.error('Could not create standalone draft for student4:', draftErr?.message);
    return;
  }

  // Try updating the draft to the unauthorized club
  const { error: updateClubErr } = await student4Client
    .from('events')
    .update({
      organizer_type: 'club',
      organization_id: club.id,
    })
    .eq('id', draftEvent.id);

  if (updateClubErr && updateClubErr.message.includes(expectedErrMsg)) {
    console.log(`[PASS] Non-member changing organization_id on draft blocked: "${updateClubErr.message}"`);
  } else {
    console.error(`[FAIL] Non-member draft update was NOT blocked as expected:`, updateClubErr);
  }

  // Clean up draft
  await admin.from('events').delete().eq('id', draftEvent.id);

  console.log('\n====================================================');
  console.log('CLUB EXCLUSIVITY RULE VERIFICATION COMPLETE');
  console.log('====================================================');
}

run().catch(console.error);
