import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Query pg_trigger and pg_proc via a test function or check RPC
  // Since we cannot run arbitrary SELECT on pg_catalog via PostgREST unless exposed,
  // let's test what triggers fire on events!

  // Let's create an event as student4 and test different payloads:
  const student4Client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await student4Client.auth.signInWithPassword({
    email: 'student4@demo.edu',
    password: 'demo1234',
  });

  const { data: club } = await admin.from('organizations').select('id, name').eq('type', 'club').limit(1).single();
  const { data: hall } = await admin.from('halls').select('id').limit(1).single();

  console.log('Testing student4 insert with organizer_email = student1@demo.edu (spoofing member)...');
  const spoofRes = await student4Client.from('events').insert({
    title: 'Spoof Proposer Test',
    description: 'Test',
    organizer_type: 'club',
    organization_id: club!.id,
    organizer_email: 'student1@demo.edu', // Spoofed!
    status: 'draft',
    approval_stage: 'draft',
    hall_id: hall!.id,
    start_time: new Date(Date.now() + 86400000 * 5).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(),
  }).select('id').single();

  console.log('Spoof insert result:', spoofRes.error ? `BLOCKED (${spoofRes.error.message})` : `ALLOWED (${spoofRes.data?.id})`);
  if (spoofRes.data?.id) {
    await admin.from('events').delete().eq('id', spoofRes.data.id);
  }

  console.log('\nTesting student4 insert with organizer_type = standalone AND organization_id = club.id...');
  const standaloneWithOrg = await student4Client.from('events').insert({
    title: 'Standalone With Org ID Test',
    description: 'Test',
    organizer_type: 'standalone',
    organization_id: club!.id, // set!
    organizer_email: 'student4@demo.edu',
    status: 'draft',
    approval_stage: 'student_affairs',
    hall_id: hall!.id,
    start_time: new Date(Date.now() + 86400000 * 5).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(),
  }).select('id').single();

  console.log('Standalone with Org ID result:', standaloneWithOrg.error ? `BLOCKED (${standaloneWithOrg.error.message})` : `ALLOWED (${standaloneWithOrg.data?.id})`);
  if (standaloneWithOrg.data?.id) {
    await admin.from('events').delete().eq('id', standaloneWithOrg.data.id);
  }

  console.log('\nTesting student4 insert with organizer_type = null...');
  const nullType = await student4Client.from('events').insert({
    title: 'Null Type Test',
    description: 'Test',
    organizer_type: null,
    organization_id: club!.id,
    organizer_email: 'student4@demo.edu',
    status: 'draft',
    approval_stage: 'student_affairs',
    hall_id: hall!.id,
    start_time: new Date(Date.now() + 86400000 * 5).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(),
  }).select('id').single();

  console.log('Null Type result:', nullType.error ? `BLOCKED (${nullType.error.message})` : `ALLOWED (${nullType.data?.id})`);
  if (nullType.data?.id) {
    await admin.from('events').delete().eq('id', nullType.data.id);
  }

  console.log('\nTesting student4 insert with club_or_dept = club.name but organizer_type = standalone or null...');
  const clubOrDeptOnly = await student4Client.from('events').insert({
    title: 'Club Name in club_or_dept Only Test',
    description: 'Test',
    organizer_type: 'standalone',
    club_or_dept: club!.name,
    organization_id: null,
    organizer_email: 'student4@demo.edu',
    status: 'draft',
    approval_stage: 'student_affairs',
    hall_id: hall!.id,
    start_time: new Date(Date.now() + 86400000 * 5).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(),
  }).select('id').single();

  console.log('club_or_dept Only result:', clubOrDeptOnly.error ? `BLOCKED (${clubOrDeptOnly.error.message})` : `ALLOWED (${clubOrDeptOnly.data?.id})`);
  if (clubOrDeptOnly.data?.id) {
    await admin.from('events').delete().eq('id', clubOrDeptOnly.data.id);
  }
}

main().catch(console.error);
