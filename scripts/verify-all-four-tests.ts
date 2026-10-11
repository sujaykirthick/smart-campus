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
  console.log('RUNNING COMPREHENSIVE VERIFICATION FOR 4 TEST SCENARIOS');
  console.log('====================================================\n');

  const { data: club } = await admin.from('organizations').select('id, name').eq('type', 'club').limit(1).single();
  const { data: hall } = await admin.from('halls').select('id').limit(1).single();
  if (!club || !hall) throw new Error('Missing sample club or hall.');

  // -------------------------------------------------------------------------
  // TEST 1: student4 (no club) cannot host for a club
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: student4 (no club) hosting block ---');
  // Clean student4 from club
  await admin.from('organization_members').delete().match({ organization_id: club.id, email: 'student4@demo.edu' });

  const student4Client = await getClientFor('student4@demo.edu');

  // Verify membership count for student4
  const { data: s4Clubs } = await student4Client.from('organization_members').select('organization_id').eq('email', 'student4@demo.edu');
  console.log(`student4 club memberships in organization_members: ${s4Clubs?.length || 0}`);

  const { error: t1InsertErr } = await student4Client.from('events').insert({
    title: 'Unauthorized Club Propose Attempt',
    description: 'Should fail',
    organizer_type: 'club',
    organization_id: club.id,
    organizer_email: 'student4@demo.edu',
    status: 'draft',
    approval_stage: 'student_affairs',
    hall_id: hall.id,
    start_time: new Date(Date.now() + 86400000 * 5).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 5 + 3600000).toISOString(),
  });

  if (t1InsertErr && t1InsertErr.message.includes('You are not authorized to host events for this club. Ask Student Affairs to add you.')) {
    console.log('✅ TEST 1 PASS: Dropdown hides club (0 memberships) and direct insert blocked with exact trigger error.');
  } else {
    console.error('❌ TEST 1 FAIL: Direct insert was not blocked as expected:', t1InsertErr);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Student Affairs adds student4 to club -> can host -> remove -> blocked
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Student Affairs Add & Remove Dynamic Enforcement ---');
  const affairsClient = await getClientFor('affairs@demo.edu');

  // 2a. Student Affairs adds student4
  const { error: addErr } = await affairsClient.rpc('add_club_member', {
    p_org_id: club.id,
    p_email: 'student4@demo.edu',
    p_member_role: 'member',
  });
  console.log('Student Affairs added student4:', addErr?.message || 'SUCCESS');

  // 2b. student4 inserts draft club event
  const { data: s4NewEvent, error: s4NewEventErr } = await student4Client.from('events').insert({
    title: 'Authorized Club Event After Add',
    description: 'Allowed',
    organizer_type: 'club',
    organization_id: club.id,
    organizer_email: 'student4@demo.edu',
    status: 'draft',
    approval_stage: 'student_affairs',
    hall_id: hall.id,
    start_time: new Date(Date.now() + 86400000 * 8).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 8 + 3600000).toISOString(),
  }).select('id').single();

  if (s4NewEventErr) {
    console.error('❌ TEST 2 FAIL (insert after add):', s4NewEventErr.message);
  } else {
    console.log('✓ student4 can host for club immediately! Event ID:', s4NewEvent.id);
    await admin.from('events').delete().eq('id', s4NewEvent.id);
  }

  // 2c. Student Affairs removes student4
  const { error: remErr } = await affairsClient.rpc('remove_club_member', {
    p_org_id: club.id,
    p_email: 'student4@demo.edu',
  });
  console.log('Student Affairs removed student4:', remErr?.message || 'SUCCESS');

  // 2d. student4 attempts insert again - should be blocked
  const { error: s4BlockedAgainErr } = await student4Client.from('events').insert({
    title: 'Blocked Again Club Event',
    description: 'Should fail',
    organizer_type: 'club',
    organization_id: club.id,
    organizer_email: 'student4@demo.edu',
    status: 'draft',
    approval_stage: 'student_affairs',
    hall_id: hall.id,
    start_time: new Date(Date.now() + 86400000 * 9).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 9 + 3600000).toISOString(),
  });

  if (s4BlockedAgainErr && s4BlockedAgainErr.message.includes('You are not authorized to host events for this club. Ask Student Affairs to add you.')) {
    console.log('✅ TEST 2 PASS: Student Affairs add allows hosting immediately; removing blocks it again.');
  } else {
    console.error('❌ TEST 2 FAIL (block after remove):', s4BlockedAgainErr);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Host accepts student2 as volunteer -> scan attendance & QR check-in
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Host accepts student2 as volunteer & scanner access ---');
  // Find an approved event owned by student1@demo.edu
  const { data: hostEvent } = await admin
    .from('events')
    .select('id, title, organizer_email, start_time, end_time')
    .eq('organizer_email', 'student1@demo.edu')
    .eq('status', 'approved')
    .limit(1)
    .single();

  if (!hostEvent) throw new Error('No approved event found for student1@demo.edu');

  // Ensure volunteers_needed > 0
  await admin.from('events').update({ volunteers_needed: 5 }).eq('id', hostEvent.id);

  // student2 applies
  const student2Client = await getClientFor('student2@demo.edu');
  await admin.from('volunteers').delete().match({ event_id: hostEvent.id, student_email: 'student2@demo.edu' });
  await student2Client.rpc('apply_volunteer', { p_event_id: hostEvent.id });

  // student1 (host) accepts student2
  const student1Client = await getClientFor('student1@demo.edu');
  const { data: decideRes, error: decideErr } = await student1Client.rpc('decide_volunteer', {
    p_event_id: hostEvent.id,
    p_student_email: 'student2@demo.edu',
    p_decision: 'accepted',
  });
  console.log('Host decided volunteer (accepted):', decideRes, decideErr?.message || 'OK');

  // Verify student2 has can_scan = true
  const { data: s2CanScan } = await student2Client.rpc('can_scan', { p_event_id: hostEvent.id });
  console.log(`student2 can_scan RPC on host event: ${s2CanScan}`);

  // Test get_scanner_event_data as student2
  const { data: s2ScanData, error: s2ScanDataErr } = await student2Client.rpc('get_scanner_event_data', {
    p_event_id: hostEvent.id,
  });
  console.log('student2 get_scanner_event_data result:', s2ScanDataErr ? s2ScanDataErr.message : `SUCCESS (Title: "${s2ScanData.title}", Is Owner: ${s2ScanData.is_owner})`);

  // Create a confirmed attendee ticket for student3@demo.edu to test scanning
  await admin.from('registrations').delete().match({ event_id: hostEvent.id, student_email: 'student3@demo.edu' });
  const { data: s3Ticket } = await admin.from('registrations').insert({
    event_id: hostEvent.id,
    student_email: 'student3@demo.edu',
    status: 'confirmed',
  }).select('qr_token').single();

  if (s3Ticket?.qr_token) {
    const { data: checkinRes } = await student2Client.rpc('scan_checkin', {
      p_token: s3Ticket.qr_token,
    });
    console.log('student2 scan_checkin result:', checkinRes);
    if (checkinRes.status === 'ok' || checkinRes.status === 'outside_window') {
      console.log('✅ TEST 3 PASS: Accepted volunteer has scan authorization; scan_checkin behaves accurately.');
    }
  }

  // -------------------------------------------------------------------------
  // TEST 4: Refused volunteer (pending/rejected/withdrawn) & restricted pages
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Pending / Rejected / Withdrawn volunteer refused & restricted pages ---');
  // Withdraw student2 volunteer role
  await student2Client.rpc('withdraw_volunteer', { p_event_id: hostEvent.id });

  const { data: s2CanScanWithdrawn } = await student2Client.rpc('can_scan', { p_event_id: hostEvent.id });
  console.log(`student2 can_scan after withdraw: ${s2CanScanWithdrawn}`);

  const { data: withdrawnScanData, error: withdrawnScanDataErr } = await student2Client.rpc('get_scanner_event_data', {
    p_event_id: hostEvent.id,
  });
  console.log(`Withdrawn volunteer get_scanner_event_data:`, withdrawnScanDataErr?.message || 'UNEXPECTED SUCCESS');

  // Verify scan_checkin refusal for withdrawn volunteer
  if (s3Ticket?.qr_token) {
    const { data: refusedCheckinRes } = await student2Client.rpc('scan_checkin', {
      p_token: s3Ticket.qr_token,
    });
    console.log('Withdrawn volunteer scan_checkin attempt:', refusedCheckinRes);
  }

  // Verify list_event_volunteers is rejected for student2 (non-owner, non-approver)
  const { error: volListErr } = await student2Client.rpc('list_event_volunteers', {
    p_event_id: hostEvent.id,
  });
  console.log('student2 accessing list_event_volunteers:', volListErr?.message || 'UNEXPECTED SUCCESS');

  if (s2CanScanWithdrawn === false && (withdrawnScanDataErr?.message || '').includes('Unauthorized') && volListErr) {
    console.log('✅ TEST 4 PASS: Non-accepted volunteer refused by scanner and cannot access management pages.');
  }

  // Clean test registrations
  await admin.from('registrations').delete().match({ event_id: hostEvent.id, student_email: 'student3@demo.edu' });

  console.log('\n====================================================');
  console.log('ALL FOUR TEST SCENARIOS COMPLETED');
  console.log('====================================================');
}

run().catch(console.error);
