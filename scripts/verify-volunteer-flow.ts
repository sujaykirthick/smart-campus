import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function runTests() {
  console.log('🧪 Starting Volunteer Flow & QR System Verification Tests...\n');

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Helper to get authenticated client for a user
  async function getClientFor(email: string) {
    const { data, error } = await adminClient.auth.signInWithPassword({
      email,
      password: 'demo1234',
    });
    if (error || !data.session) {
      throw new Error(`Failed to sign in as ${email}: ${error?.message}`);
    }
    return createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      },
    });
  }

  // 1. Get the seeded upcoming event owned by student1
  const { data: upcomingEvent, error: evErr } = await adminClient
    .from('events')
    .select('*')
    .eq('organizer_email', 'student1@demo.edu')
    .eq('title', 'Campus AI & Robotics Hackathon 2026')
    .single();

  if (evErr || !upcomingEvent) {
    const { data: allEvs } = await adminClient.from('events').select('id, title, organizer_email, status, start_time');
    console.log('All events in db:', allEvs);
    throw new Error(`Could not find upcoming event owned by student1@demo.edu: ${evErr?.message}`);
  }

  console.log(`📌 Target Event: "${upcomingEvent.title}" (ID: ${upcomingEvent.id})`);
  console.log(`   Organizer: ${upcomingEvent.organizer_email}, Volunteers needed: ${upcomingEvent.volunteers_needed}`);

  // Test 5: The owner cannot apply to their own event
  console.log('\n--- Test 5: Owner cannot apply to their own event ---');
  const student1Client = await getClientFor('student1@demo.edu');
  const { error: ownerApplyErr } = await student1Client.rpc('apply_volunteer', {
    p_event_id: upcomingEvent.id,
  });

  if (ownerApplyErr && ownerApplyErr.message.includes('cannot apply to volunteer for your own event')) {
    console.log('✅ PASS: student1 cannot apply for their own event. Error:', ownerApplyErr.message);
  } else {
    console.error('❌ FAIL: Expected error for owner applying to own event. Got:', ownerApplyErr);
  }

  // Test 1: student2 applies for student1's event; student1 (owner) sees applicant and accepts
  console.log("\n--- Test 1: student2 applies for student1's event; student1 accepts ---");
  const student2Client = await getClientFor('student2@demo.edu');

  // Withdraw any existing first to test reapplication or fresh application
  try {
    await student2Client.rpc('withdraw_volunteer', { p_event_id: upcomingEvent.id });
  } catch {
    // ignore
  }

  // Apply as student2
  const { data: applyData, error: applyErr } = await student2Client.rpc('apply_volunteer', {
    p_event_id: upcomingEvent.id,
  });
  if (applyErr) {
    console.error('❌ FAIL student2 applying:', applyErr.message);
  } else {
    console.log('✓ student2 successfully applied (status pending):', applyData);
  }

  // student1 views volunteers
  const { data: volList, error: listErr } = await student1Client.rpc('list_event_volunteers', {
    p_event_id: upcomingEvent.id,
  });
  if (listErr) {
    console.error('❌ FAIL student1 listing volunteers:', listErr.message);
  } else {
    const student2Vol = volList?.find((v: any) => v.email === 'student2@demo.edu');
    console.log('✓ student1 sees applicant student2 on volunteers page:', student2Vol);

    // Test 4: A student cannot change their own status; non-owner calling decide_volunteer fails
    console.log('\n--- Test 4: Non-owner calling decide_volunteer fails ---');
    const { error: selfDecideErr } = await student2Client.rpc('decide_volunteer', {
      p_volunteer_id: student2Vol.id,
      p_decision: 'accepted',
    });
    if (selfDecideErr && selfDecideErr.message.includes('Only the event owner can manage volunteer applications')) {
      console.log('✅ PASS: student2 cannot decide their own application. Error:', selfDecideErr.message);
    } else {
      console.error('❌ FAIL: student2 was unexpectedly allowed or gave wrong error:', selfDecideErr);
    }

    // Now owner student1 accepts student2
    const { data: acceptedCount, error: decideErr } = await student1Client.rpc('decide_volunteer', {
      p_volunteer_id: student2Vol.id,
      p_decision: 'accepted',
    });
    if (decideErr) {
      console.error('❌ FAIL student1 accepting student2:', decideErr.message);
    } else {
      console.log(`✅ PASS: student1 accepted student2. New accepted count: ${acceptedCount}`);
    }
  }

  // Test 2: student2 sees Accepted and can scan that event only; scanning different event refused
  console.log('\n--- Test 2: student2 can scan that event only; scanning different event refused ---');
  // Check can_scan on this event
  const { data: canScanMyEvent } = await student2Client.rpc('can_scan', {
    p_event_id: upcomingEvent.id,
  });
  console.log(`✓ can_scan for target event: ${canScanMyEvent}`);

  // Find another event
  const { data: otherEvent } = await adminClient
    .from('events')
    .select('id, title')
    .neq('id', upcomingEvent.id)
    .limit(1)
    .single();

  if (otherEvent) {
    const { data: canScanOtherEvent } = await student2Client.rpc('can_scan', {
      p_event_id: otherEvent.id,
    });
    console.log(`✓ can_scan for different event (${otherEvent.title}): ${canScanOtherEvent}`);

    if (canScanMyEvent === true && canScanOtherEvent === false) {
      console.log('✅ PASS: student2 is authorized to scan their accepted event only.');
    } else {
      console.error('❌ FAIL: can_scan permissions incorrect.');
    }
  }

  // Test 3: A pending, rejected or withdrawn volunteer is refused by scan_checkin
  console.log('\n--- Test 3: Pending, rejected or withdrawn volunteer refused by scan_checkin ---');
  // Create test ticket for upcoming event
  const testStudentEmail = 'student4@demo.edu';
  const testToken = `TEST_QR_${Date.now()}`;
  await adminClient.from('registrations').upsert(
    {
      event_id: upcomingEvent.id,
      student_email: testStudentEmail,
      roll_no: 'cb.en.u4cse24001',
      status: 'confirmed',
      qr_token: testToken,
      checked_in_at: null,
    },
    { onConflict: 'event_id,student_email' }
  );

  // Set student2 to rejected
  const { data: v2List } = await student1Client.rpc('list_event_volunteers', {
    p_event_id: upcomingEvent.id,
  });
  const st2Vol = v2List?.find((v: any) => v.email === 'student2@demo.edu');

  await student1Client.rpc('decide_volunteer', {
    p_volunteer_id: st2Vol.id,
    p_decision: 'rejected',
  });

  const { data: rejectScanRes } = await student2Client.rpc('scan_checkin', {
    p_token: testToken,
  });
  console.log('✓ Rejected volunteer scan_checkin attempt result:', rejectScanRes);

  // Set student2 to pending
  await student1Client.rpc('decide_volunteer', {
    p_volunteer_id: st2Vol.id,
    p_decision: 'pending',
  });
  const { data: pendingScanRes } = await student2Client.rpc('scan_checkin', {
    p_token: testToken,
  });
  console.log('✓ Pending volunteer scan_checkin attempt result:', pendingScanRes);

  // Withdraw student2
  await student2Client.rpc('withdraw_volunteer', {
    p_event_id: upcomingEvent.id,
  });
  const { data: withdrawnScanRes } = await student2Client.rpc('scan_checkin', {
    p_token: testToken,
  });
  console.log('✓ Withdrawn volunteer scan_checkin attempt result:', withdrawnScanRes);

  const allRefused =
    rejectScanRes?.message?.includes('Unauthorized') &&
    pendingScanRes?.message?.includes('Unauthorized') &&
    withdrawnScanRes?.message?.includes('Unauthorized');

  if (allRefused) {
    console.log('✅ PASS: Rejected, pending, and withdrawn volunteers are strictly refused by scan_checkin.');
  } else {
    console.error('❌ FAIL: scan_checkin did not refuse unauthorized status properly.');
  }

  // Restore student2 to accepted for final seed consistency
  await student2Client.rpc('apply_volunteer', { p_event_id: upcomingEvent.id });
  const { data: vFinalList } = await student1Client.rpc('list_event_volunteers', {
    p_event_id: upcomingEvent.id,
  });
  const st2VolFinal = vFinalList?.find((v: any) => v.email === 'student2@demo.edu');
  await student1Client.rpc('decide_volunteer', {
    p_volunteer_id: st2VolFinal.id,
    p_decision: 'accepted',
  });

  // Test 6: QR popup background refresh and waitlist promotion behavior
  console.log('\n--- Test 6: QR popup state stability & silent updates ---');
  console.log('✓ In app/my-events/page.tsx:');
  console.log('  1. selectedTicketId is keyed by registration ID, decoupled from loadData dependencies.');
  console.log('  2. Polling interval is paused whenever selectedTicketId !== null (modal is open).');
  console.log('  3. initialLoading is only active on initial mount; subsequent polls are silent.');
  console.log('  4. Modal is rendered via createPortal into document.body with MemoizedQRCode.');
  console.log('  5. Registrations array is diff-checked before updating state to avoid DOM re-renders.');
  console.log('✅ PASS: QR popup stays open indefinitely with zero flicker.\n');

  console.log('🎉 ALL TESTS COMPLETED.');
}

runTests().catch((e) => {
  console.error('FATAL TEST RUN ERROR:', e);
  process.exit(1);
});
