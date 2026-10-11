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

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING VERIFICATION SUITE FOR HOST & CLUB PROTECTION');
  console.log('====================================================\n');

  // Test 1: The host opens their own approved event; registering as the owner fails with DB error.
  console.log('--- TEST 1: Host Protection & Registration Block ---');
  // Find an approved event owned by student1@demo.edu
  const { data: hostEvent } = await admin
    .from('events')
    .select('id, title, organizer_email, status')
    .eq('organizer_email', 'student1@demo.edu')
    .eq('status', 'approved')
    .limit(1)
    .single();

  if (!hostEvent) {
    console.error('❌ Could not find an approved event for student1@demo.edu');
    return;
  }
  console.log(`Target Event: "${hostEvent.title}" (ID: ${hostEvent.id}) owned by ${hostEvent.organizer_email}`);

  // Test registering as owner using student1 client
  const student1Client = await getClientFor('student1@demo.edu');
  const { error: hostRegErr } = await student1Client.from('registrations').insert({
    event_id: hostEvent.id,
    student_email: 'student1@demo.edu',
    status: 'confirmed',
  });

  if (hostRegErr && hostRegErr.message.includes('You are hosting this event and cannot register for it')) {
    console.log('✅ PASS: Owner registration blocked with exact DB error:', hostRegErr.message);
  } else {
    console.error('❌ FAIL: Expected owner registration to be blocked. Got:', hostRegErr);
  }

  // Ensure non-owner (student2@demo.edu) can register or see their registration
  const student2Client = await getClientFor('student2@demo.edu');
  const { data: s2ExistingReg } = await admin
    .from('registrations')
    .select('*')
    .eq('event_id', hostEvent.id)
    .eq('student_email', 'student2@demo.edu')
    .maybeSingle();

    const { data: validHall } = await admin.from('halls').select('id').limit(1).single();
    const hallId = validHall?.id;

    if (!s2ExistingReg) {
      const { error: s2RegErr } = await student2Client.from('registrations').insert({
        event_id: hostEvent.id,
        student_email: 'student2@demo.edu',
        status: 'confirmed',
      });
      console.log('Non-owner student2 registration attempt:', s2RegErr ? s2RegErr.message : 'SUCCESS');
    } else {
      console.log('✓ student2 is registered as attendee:', s2ExistingReg.id);
    }

    // Test 2: Dashboard counters & volunteer decision
    console.log('\n--- TEST 2: Host Dashboard & Volunteer Decisions ---');
    // Check volunteer applicants
    const { data: volList, error: volErr } = await student1Client.rpc('list_event_volunteers', {
      p_event_id: hostEvent.id,
    });
    console.log(`Volunteers listed by host: ${volList?.length ?? 0} rows. Error: ${volErr?.message ?? 'None'}`);

    // Have student2 apply if not applied
    try {
      await student2Client.rpc('apply_volunteer', { p_event_id: hostEvent.id });
    } catch {}

    // student1 decides on volunteer
    const { data: decidedVol, error: decideErr } = await student1Client.rpc('decide_volunteer', {
      p_event_id: hostEvent.id,
      p_student_email: 'student2@demo.edu',
      p_decision: 'accepted',
    });
    if (decideErr) {
      console.log('Volunteer decision result:', decideErr.message);
    } else {
      console.log('✅ PASS: decide_volunteer accepted successfully:', decidedVol);
    }

    // Test 3: Club whitelist enforcement on event creation
    console.log('\n--- TEST 3: Club Whitelist on Insert ---');
    // Get a club that student1 is NOT a member of
    const { data: clubs } = await admin.from('organizations').select('id, name').eq('type', 'club');
    const { data: memberships } = await admin.from('organization_members').select('organization_id').eq('email', 'student1@demo.edu');
    const memberOrgIds = new Set((memberships || []).map((m: any) => m.organization_id));
    const unauthorizedClub = clubs?.find((c: any) => !memberOrgIds.has(c.id));

    if (unauthorizedClub && hallId) {
      console.log(`Testing insert for unauthorized club: "${unauthorizedClub.name}" (${unauthorizedClub.id})`);
      const { error: unauthInsertErr } = await student1Client.from('events').insert({
        title: 'Hacked Club Event Attempt',
        description: 'Should fail',
        organizer_type: 'club',
        organization_id: unauthorizedClub.id,
        organizer_email: 'student1@demo.edu',
        status: 'draft',
        approval_stage: 'draft',
        start_time: new Date(Date.now() + 86400000).toISOString(),
        end_time: new Date(Date.now() + 90000000).toISOString(),
        hall_id: hallId,
      });

      if (unauthInsertErr && unauthInsertErr.message.includes('You are not authorized to host events for this club. Ask Student Affairs to add you.')) {
        console.log('✅ PASS: Insert for unauthorized club blocked with exact trigger error:', unauthInsertErr.message);
      } else {
        console.error('❌ FAIL: Expected unauthorized club insert to be blocked. Got:', unauthInsertErr);
      }
    }

    // Test 4: Student Affairs adds student to club -> can host immediately -> removed -> blocked again
    console.log('\n--- TEST 4: Student Affairs Add & Remove Dynamic Enforcement ---');
    const affairsClient = await getClientFor('affairs@demo.edu');
    if (unauthorizedClub && hallId) {
      // 1. Add student1 to the unauthorized club
      const { error: addMemberErr } = await affairsClient.rpc('add_club_member', {
        p_org_id: unauthorizedClub.id,
        p_email: 'student1@demo.edu',
        p_member_role: 'member',
      });
      console.log(`Student Affairs added student1 to "${unauthorizedClub.name}":`, addMemberErr ? addMemberErr.message : 'SUCCESS');

      // 2. Try inserting draft event now - should succeed
      const { data: newDraftEvent, error: authDraftErr } = await student1Client
        .from('events')
        .insert({
          title: 'Authorized Club Event After Add',
          description: 'Should succeed',
          organizer_type: 'club',
          organization_id: unauthorizedClub.id,
          organizer_email: 'student1@demo.edu',
          status: 'draft',
          approval_stage: 'draft',
          start_time: new Date(Date.now() + 86400000 * 2).toISOString(),
          end_time: new Date(Date.now() + 86400000 * 2 + 3600000).toISOString(),
          hall_id: hallId,
        })
        .select('id')
        .single();

      if (authDraftErr) {
        console.error('❌ FAIL: Insertion after being added failed:', authDraftErr.message);
      } else {
        console.log('✅ PASS: Successfully created event for club after being added! Event ID:', newDraftEvent.id);

        // Clean up test draft
        await admin.from('events').delete().eq('id', newDraftEvent.id);
      }

      // 3. Remove student1 from the club
      const { error: removeMemberErr } = await affairsClient.rpc('remove_club_member', {
        p_org_id: unauthorizedClub.id,
        p_email: 'student1@demo.edu',
      });
      console.log(`Student Affairs removed student1 from "${unauthorizedClub.name}":`, removeMemberErr ? removeMemberErr.message : 'SUCCESS');

      // 4. Try inserting again - should be blocked
      const { error: postRemoveErr } = await student1Client.from('events').insert({
        title: 'Blocked Again Event',
        description: 'Should fail',
        organizer_type: 'club',
        organization_id: unauthorizedClub.id,
        organizer_email: 'student1@demo.edu',
        status: 'draft',
        approval_stage: 'draft',
        start_time: new Date(Date.now() + 86400000 * 3).toISOString(),
        end_time: new Date(Date.now() + 86400000 * 3 + 3600000).toISOString(),
        hall_id: hallId,
      });
      if (postRemoveErr && postRemoveErr.message.includes('You are not authorized to host events for this club. Ask Student Affairs to add you.')) {
        console.log('✅ PASS: Post-removal insertion blocked again with exact error:', postRemoveErr.message);
      } else {
        console.error('❌ FAIL: Expected insertion after removal to be blocked. Got:', postRemoveErr);
      }
    }

    // Test 5: Changing organization_id to an unauthorized club on a draft is blocked
    console.log('\n--- TEST 5: Changing organization_id on Draft to Unauthorized Club ---');
    if (hallId && unauthorizedClub) {
      // Create a standalone draft by student1
      const { data: standaloneDraft, error: standaloneDraftErr } = await student1Client
        .from('events')
        .insert({
          title: 'Student Standalone Event Draft',
          description: 'Test draft',
          organizer_type: 'standalone',
          organization_id: null,
          organizer_email: 'student1@demo.edu',
          status: 'draft',
          approval_stage: 'draft',
          start_time: new Date(Date.now() + 86400000 * 4).toISOString(),
          end_time: new Date(Date.now() + 86400000 * 4 + 3600000).toISOString(),
          hall_id: hallId,
        })
        .select('id')
        .single();

      if (standaloneDraft) {
        console.log(`Created standalone draft: ${standaloneDraft.id}. Attempting to update organization_id to ${unauthorizedClub.name}...`);
        const { error: hackOrgErr } = await student1Client
          .from('events')
          .update({
            organizer_type: 'club',
            organization_id: unauthorizedClub.id,
          })
          .eq('id', standaloneDraft.id);

        if (hackOrgErr && hackOrgErr.message.includes('You are not authorized to host events for this club. Ask Student Affairs to add you.')) {
          console.log('✅ PASS: Changing organization_id to unauthorized club blocked on update:', hackOrgErr.message);
        } else {
          console.error('❌ FAIL: Expected update to unauthorized club to be blocked. Got:', hackOrgErr);
        }

        // Clean up draft
        await admin.from('events').delete().eq('id', standaloneDraft.id);
      }
    }

  console.log('\n====================================================');
  console.log('ALL VERIFICATION TESTS COMPLETED');
  console.log('====================================================');
}

runTests().catch(console.error);
