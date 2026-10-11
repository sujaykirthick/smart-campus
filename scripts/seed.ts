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
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local or environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface DemoAccount {
  email: string;
  role: 'student' | 'faculty' | 'student_affairs' | 'event_office' | 'cd';
  name: string;
  roll_no?: string;
  department?: string;
}

// SINGLE SOURCE OF TRUTH FOR ALL DEMO ACCOUNTS
// Emails are strictly lowercased and trimmed
const DEMO_ACCOUNTS: DemoAccount[] = [
  // 4 Students
  {
    email: 'student1@demo.edu',
    role: 'student',
    name: 'Aarav Sharma',
    roll_no: 'cb.ps.i5das24049',
    department: 'Data Science & AI',
  },
  {
    email: 'student2@demo.edu',
    role: 'student',
    name: 'Diya Patel',
    roll_no: 'cb.en.u4cse23108',
    department: 'Computer Science and Engineering',
  },
  {
    email: 'student3@demo.edu',
    role: 'student',
    name: 'Rohan Kumar',
    roll_no: 'cb.en.u4aie24201',
    department: 'Data Science & AI',
  },
  {
    email: 'student4@demo.edu',
    role: 'student',
    name: 'Kavya Subramanian',
    roll_no: 'cb.en.u4cse24001',
    department: 'Computer Science and Engineering',
  },

  // 2 Faculty
  {
    email: 'faculty1@demo.edu',
    role: 'faculty',
    name: 'Dr. Rajesh Nair',
    department: 'Computer Science and Engineering',
  },
  {
    email: 'faculty2@demo.edu',
    role: 'faculty',
    name: 'Dr. Meera Krishnan',
    department: 'Data Science & AI',
  },

  // 3 Approval Authorities
  {
    email: 'affairs@demo.edu',
    role: 'student_affairs',
    name: 'Student Welfare Dean Office',
  },
  {
    email: 'eventoffice@demo.edu',
    role: 'event_office',
    name: 'Campus Event Office',
  },
  {
    email: 'cd@demo.edu',
    role: 'cd',
    name: 'Campus Director Office',
  },
];

const ORGANIZATIONS = [
  { name: 'Coding Club', type: 'club', faculty_coordinator: 'Dr. Rajesh Nair' },
  { name: 'Robotics & Automation Club', type: 'club', faculty_coordinator: 'Dr. Ramesh Kumar' },
  { name: 'Spic Macay & Cultural Club', type: 'club', faculty_coordinator: 'Dr. Shobha V' },
  { name: 'ACM Student Chapter', type: 'club', faculty_coordinator: 'Dr. Rajesh Nair' },
  { name: 'Computer Science and Engineering', type: 'department', faculty_coordinator: null },
  { name: 'Data Science & AI', type: 'department', faculty_coordinator: null },
  { name: 'Electronics & Communication Engineering', type: 'department', faculty_coordinator: null },
];

const OLD_EMAIL_MAP: Record<string, string> = {
  'student@demo.edu': 'student1@demo.edu',
  'faculty@demo.edu': 'faculty1@demo.edu',
  'codingclub@demo.edu': 'student1@demo.edu',
  'roboticsclub@demo.edu': 'student1@demo.edu',
  'culturalclub@demo.edu': 'student1@demo.edu',
  'cse@demo.edu': 'faculty1@demo.edu',
  'datascience@demo.edu': 'student1@demo.edu',
  'student_unmapped@demo.edu': 'student4@demo.edu',
};

const HALLS = [
  {
    name: 'Amriteshwari',
    capacity: 400,
    location: 'Main Academic Block - Ground Floor',
  },
  {
    name: 'Sudhamani Hall',
    capacity: 400,
    location: 'Central Block - 1st Floor',
  },
  {
    name: 'Saraswathi Hall',
    capacity: 200,
    location: 'Library Complex - 2nd Floor',
  },
  {
    name: 'sandeepani',
    capacity: 300,
    location: 'Science Block - Ground Floor',
  },
  {
    name: 'acharya hall',
    capacity: 300,
    location: 'Engineering Wing - 3rd Floor',
  },
];

const DEFAULT_FESTS = [
  { name: 'Anokha', is_active: false },
  { name: 'Amritotsavam', is_active: false },
  { name: 'Gokulashtami', is_active: false },
  { name: 'Onam', is_active: false },
];

const PASSWORD = 'demo1234';

async function seed() {
  console.log('🚀 Starting idempotent database seed & reconciliation...\n');

  // 1. Organizations (Clubs & Departments)
  console.log('🏢 Upserting organizations (Clubs & Departments)...');
  const orgMap = new Map<string, string>();
  for (const org of ORGANIZATIONS) {
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('name', org.name)
      .maybeSingle();

    if (existingOrg) {
      orgMap.set(org.name, existingOrg.id);
      await supabase
        .from('organizations')
        .update({ type: org.type, faculty_coordinator: org.faculty_coordinator } as any)
        .eq('id', existingOrg.id);
      console.log(`  ✓ Organization updated: ${org.name} [${org.type}]`);
    } else {
      const { data: newOrg, error: insertOrgErr } = await supabase
        .from('organizations')
        .insert(org as any)
        .select('id')
        .maybeSingle();

      if (insertOrgErr) {
        console.warn(`  ⚠ Note on organization insert: ${insertOrgErr.message}`);
      } else if (newOrg) {
        orgMap.set(org.name, newOrg.id);
        console.log(`  + Created organization: ${org.name} [${org.type}]`);
      }
    }
  }

  // 2. Course Code Department Mappings
  console.log('\n📚 Upserting course_code_departments mappings...');
  const dsId = orgMap.get('Data Science & AI');
  const cseId = orgMap.get('Computer Science and Engineering');
  const eceId = orgMap.get('Electronics & Communication Engineering');

  const mappings = [
    { course_code: 'i5das', organization_id: dsId },
    { course_code: 'u4aie', organization_id: dsId },
    { course_code: 'u4cse', organization_id: cseId },
    { course_code: 'cse', organization_id: cseId },
    { course_code: 'u4ece', organization_id: eceId },
  ];

  for (const m of mappings) {
    if (m.organization_id) {
      const { error: ccdErr } = await supabase
        .from('course_code_departments')
        .upsert(m, { onConflict: 'course_code' });
      if (ccdErr) {
        console.warn(`  ℹ Note on course code mapping ${m.course_code}:`, ccdErr.message);
      } else {
        console.log(`  ✓ Mapped course code "${m.course_code}" -> ${m.organization_id}`);
      }
    }
  }

  // 3. Halls by name
  console.log('\n🏛️  Upserting halls by name...');
  for (const hall of HALLS) {
    const { data: existingHall } = await supabase
      .from('halls')
      .select('id')
      .eq('name', hall.name)
      .maybeSingle();

    if (existingHall) {
      const { error } = await supabase
        .from('halls')
        .update({ capacity: hall.capacity, location: hall.location })
        .eq('id', existingHall.id);
      if (error) throw error;
      console.log(`  ✓ Updated hall: ${hall.name} (${hall.capacity} seats)`);
    } else {
      const { error } = await supabase.from('halls').insert(hall);
      if (error) throw error;
      console.log(`  + Created hall: ${hall.name} (${hall.capacity} seats)`);
    }
  }

  // 4. Default Fests
  console.log('\n🎉 Upserting default fests...');
  for (const fest of DEFAULT_FESTS) {
    const { data: existingFest } = await supabase
      .from('fests')
      .select('id')
      .eq('name', fest.name)
      .maybeSingle();

    if (!existingFest) {
      await supabase.from('fests').insert(fest);
      console.log(`  + Created fest: ${fest.name} (inactive)`);
    } else {
      console.log(`  ✓ Fest exists: ${fest.name}`);
    }
  }

  // 5. Storage bucket 'event-posters'
  console.log('\n📦 Ensuring Storage bucket "event-posters"...');
  try {
    const { data: bucket } = await supabase.storage.getBucket('event-posters');
    if (!bucket) {
      await supabase.storage.createBucket('event-posters', { public: true });
      console.log('  + Created public bucket "event-posters"');
    } else {
      console.log('  ✓ Storage bucket "event-posters" is ready');
    }
  } catch (err: unknown) {
    console.log('  ℹ Storage check:', err instanceof Error ? err.message : err);
  }

  // 6. Reconcile Old Email References Across All Related Tables
  console.log('\n🔄 Reconciling old email references in related tables...');
  for (const [oldEmail, newEmail] of Object.entries(OLD_EMAIL_MAP)) {
    // a) events.organizer_email
    const { data: evChanged, error: evErr } = await supabase
      .from('events')
      .update({ organizer_email: newEmail })
      .eq('organizer_email', oldEmail)
      .select('id, title');
    if (evChanged && evChanged.length > 0) {
      console.log(`  ✓ Reassigned ${evChanged.length} event(s) from "${oldEmail}" -> "${newEmail}"`);
    }

    // b) organization_members
    const { data: mems } = await supabase
      .from('organization_members')
      .select('*')
      .eq('email', oldEmail);
    if (mems && mems.length > 0) {
      for (const m of mems) {
        // Delete old row
        await supabase
          .from('organization_members')
          .delete()
          .eq('organization_id', m.organization_id)
          .eq('email', oldEmail);
        // Insert new row if doesn't already exist
        await supabase
          .from('organization_members')
          .upsert({
            organization_id: m.organization_id,
            email: newEmail,
            member_role: m.member_role,
            added_by: m.added_by,
          }, { onConflict: 'organization_id,email' });
        console.log(`  ✓ Reassigned club member in org ${m.organization_id} from "${oldEmail}" -> "${newEmail}"`);
      }
    }

    // c) registrations
    const { data: regs } = await supabase
      .from('registrations')
      .select('id, event_id, student_email')
      .eq('student_email', oldEmail);
    if (regs && regs.length > 0) {
      for (const r of regs) {
        // Check if newEmail already has registration for this event
        const { data: existingReg } = await supabase
          .from('registrations')
          .select('id')
          .eq('event_id', r.event_id)
          .eq('student_email', newEmail)
          .maybeSingle();

        if (existingReg) {
          await supabase.from('registrations').delete().eq('id', r.id);
          console.log(`  ✓ Removed duplicate registration for "${oldEmail}" on event ${r.event_id}`);
        } else {
          await supabase.from('registrations').update({ student_email: newEmail }).eq('id', r.id);
          console.log(`  ✓ Updated registration on event ${r.event_id} from "${oldEmail}" -> "${newEmail}"`);
        }
      }
    }

    // d) volunteers
    const { data: vols } = await supabase
      .from('volunteers')
      .select('id, event_id, student_email')
      .eq('student_email', oldEmail);
    if (vols && vols.length > 0) {
      for (const v of vols) {
        const { data: existingVol } = await supabase
          .from('volunteers')
          .select('id')
          .eq('event_id', v.event_id)
          .eq('student_email', newEmail)
          .maybeSingle();

        if (existingVol) {
          await supabase.from('volunteers').delete().eq('id', v.id);
          console.log(`  ✓ Removed duplicate volunteer record for "${oldEmail}" on event ${v.event_id}`);
        } else {
          await supabase.from('volunteers').update({ student_email: newEmail }).eq('id', v.id);
          console.log(`  ✓ Updated volunteer record on event ${v.event_id} from "${oldEmail}" -> "${newEmail}"`);
        }
      }
    }

    // e) reviews
    const { data: revs } = await supabase
      .from('reviews')
      .select('id, event_id, student_email')
      .eq('student_email', oldEmail);
    if (revs && revs.length > 0) {
      for (const rv of revs) {
        const { data: existingRv } = await supabase
          .from('reviews')
          .select('id')
          .eq('event_id', rv.event_id)
          .eq('student_email', newEmail)
          .maybeSingle();

        if (existingRv) {
          await supabase.from('reviews').delete().eq('id', rv.id);
          console.log(`  ✓ Removed duplicate review for "${oldEmail}" on event ${rv.event_id}`);
        } else {
          await supabase.from('reviews').update({ student_email: newEmail }).eq('id', rv.id);
          console.log(`  ✓ Updated review on event ${rv.event_id} from "${oldEmail}" -> "${newEmail}"`);
        }
      }
    }
  }

  // 7. Reconcile Auth Users and Allowed Users (Ensure 1:1 Match)
  console.log('\n👥 Reconciling Auth users and allowed_users whitelist...');

  // Fetch all current Auth users
  const { data: authUsersData, error: listUsersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listUsersError) throw listUsersError;

  const authByEmail = new Map<string, string>();
  for (const u of authUsersData.users) {
    if (u.email) {
      authByEmail.set(u.email.trim().toLowerCase(), u.id);
    }
  }

  // Fetch all current allowed_users
  const { data: existingAllowed, error: allowedFetchErr } = await supabase
    .from('allowed_users')
    .select('*');
  if (allowedFetchErr) throw allowedFetchErr;

  const demoEmailsSet = new Set(DEMO_ACCOUNTS.map((a) => a.email.trim().toLowerCase()));

  // Delete allowed_users rows whose email has no matching auth user AND is not in the demo list
  // Also delete old alias emails that were superseded (like student@demo.edu)
  for (const row of existingAllowed || []) {
    const cleanRowEmail = row.email.trim().toLowerCase();
    const hasAuth = authByEmail.has(cleanRowEmail);
    const inDemoList = demoEmailsSet.has(cleanRowEmail);

    if ((!hasAuth && !inDemoList) || OLD_EMAIL_MAP[cleanRowEmail]) {
      console.log(`  🗑️ Deleting orphan / obsolete allowed_users row: "${row.email}"`);
      await supabase.from('allowed_users').delete().eq('email', row.email);

      // If there's an auth user for an obsolete alias, delete that auth user too
      const obsoleteAuthId = authByEmail.get(cleanRowEmail);
      if (obsoleteAuthId && !inDemoList) {
        console.log(`  🗑️ Deleting obsolete auth user: "${cleanRowEmail}"`);
        await supabase.auth.admin.deleteUser(obsoleteAuthId).catch(() => {});
        authByEmail.delete(cleanRowEmail);
      }
    }
  }

  // Ensure BOTH the Auth User and the matching allowed_users row for every DEMO_ACCOUNT
  for (const acc of DEMO_ACCOUNTS) {
    const cleanEmail = acc.email.trim().toLowerCase();
    const existingAuthId = authByEmail.get(cleanEmail);

    if (existingAuthId) {
      const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(existingAuthId, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: acc.name, role: acc.role },
      });
      if (updateAuthErr) throw updateAuthErr;
    } else {
      const { data: newAuthUser, error: createAuthErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: acc.name, role: acc.role },
      });
      if (createAuthErr) throw createAuthErr;
      if (newAuthUser.user?.id) {
        authByEmail.set(cleanEmail, newAuthUser.user.id);
      }
    }

    // Upsert allowed_users whitelist row
    const { error: upsertAllowedErr } = await supabase
      .from('allowed_users')
      .upsert(
        {
          email: cleanEmail,
          role: acc.role,
          name: acc.name,
          roll_no: acc.roll_no || null,
          department: acc.department || null,
        },
        { onConflict: 'email' }
      );

    if (upsertAllowedErr) {
      console.error(`  ✗ FATAL: Failed to upsert allowed_users for ${cleanEmail}:`, upsertAllowedErr.message);
      throw upsertAllowedErr;
    }
  }

  // 8. Seed Club Memberships
  console.log('\n🤝 Seeding club memberships (organization_members)...');
  const codingClubId = orgMap.get('Coding Club');
  const culturalClubId = orgMap.get('Spic Macay & Cultural Club');
  const roboticsClubId = orgMap.get('Robotics & Automation Club');
  const acmClubId = orgMap.get('ACM Student Chapter');

  const membershipsToSeed = [
    // student1 in 2 clubs: Coding Club (lead), Spic Macay (member)
    { organization_id: codingClubId, email: 'student1@demo.edu', member_role: 'lead', added_by: 'affairs@demo.edu' },
    { organization_id: culturalClubId, email: 'student1@demo.edu', member_role: 'member', added_by: 'affairs@demo.edu' },

    // faculty1 in 2 clubs: Coding Club (lead), Robotics (member)
    { organization_id: codingClubId, email: 'faculty1@demo.edu', member_role: 'lead', added_by: 'affairs@demo.edu' },
    { organization_id: roboticsClubId, email: 'faculty1@demo.edu', member_role: 'member', added_by: 'affairs@demo.edu' },

    // student2 in 1 club: Coding Club (member)
    { organization_id: codingClubId, email: 'student2@demo.edu', member_role: 'member', added_by: 'affairs@demo.edu' },
  ];

  for (const m of membershipsToSeed) {
    if (m.organization_id) {
      const { error: memErr } = await supabase
        .from('organization_members')
        .upsert(m, { onConflict: 'organization_id,email' });
      if (memErr) {
        console.warn(`  ℹ Note on membership for ${m.email}:`, memErr.message);
      } else {
        console.log(`  ✓ Enrolled ${m.email} in club ${m.organization_id} as ${m.member_role}`);
      }
    }
  }

  // 9. Seed Ended Past Event for Coding Club with Reviews & Cached AI Advice
  console.log('\n📅 Checking sample demo bookings & reviews...');
  const { data: existingHalls } = await supabase.from('halls').select('id, name');
  const saraswathi = existingHalls?.find((h) => h.name === 'Saraswathi Hall');

  if (saraswathi && codingClubId) {
    const pastStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString();
    const pastEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 13 * 60 * 60 * 1000).toISOString();

    const pastEventTitle = 'Full-Stack Agentic AI Workshop';
    let eventId: string;

    const { data: existingEv } = await supabase
      .from('events')
      .select('id')
      .eq('title', pastEventTitle)
      .maybeSingle();

    if (existingEv) {
      eventId = existingEv.id;
      await supabase
        .from('events')
        .update({
          organizer_email: 'student1@demo.edu',
          organizer_type: 'club',
          organization_id: codingClubId,
          club_or_dept: 'Coding Club',
          hall_id: saraswathi.id,
          start_time: pastStart,
          end_time: pastEnd,
          status: 'approved',
        })
        .eq('id', eventId);
    } else {
      const { data: newEv, error: evErr } = await supabase
        .from('events')
        .insert({
          title: pastEventTitle,
          description: 'Hands-on technical workshop on building autonomous developer agents and LLM tool pipelines.',
          organizer_email: 'student1@demo.edu',
          organizer_type: 'club',
          organization_id: codingClubId,
          club_or_dept: 'Coding Club',
          hall_id: saraswathi.id,
          start_time: pastStart,
          end_time: pastEnd,
          status: 'approved',
        })
        .select('id')
        .single();

      if (evErr) throw evErr;
      eventId = newEv!.id;
    }

    // Seed attendee registrations (host cannot register)
    for (const st of ['student2@demo.edu', 'student3@demo.edu']) {
      await supabase.from('registrations').upsert(
        {
          event_id: eventId,
          student_email: st,
          roll_no: st === 'student2@demo.edu' ? 'cb.en.u4cse23108' : 'cb.en.u4aie24201',
          status: 'confirmed',
          checked_in_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'event_id,student_email' }
      );
    }

    // Seed reviews
    await supabase.from('reviews').upsert(
      {
        event_id: eventId,
        student_email: 'student1@demo.edu',
        rating: 5,
        comment: 'Great hands-on coding workshop on tool calling and multi-agent coordination.',
      },
      { onConflict: 'event_id,student_email' }
    );

    await supabase.from('reviews').upsert(
      {
        event_id: eventId,
        student_email: 'student2@demo.edu',
        rating: 4,
        comment: 'Solid presentation and real-world demonstrations.',
      },
      { onConflict: 'event_id,student_email' }
    );

    // Cache initial advice in organization_ai_advice
    await supabase.from('organization_ai_advice').upsert(
      {
        organization_id: codingClubId,
        advice: {
          executive_summary: 'Coding Club exhibits exceptional attendance with a 92% historical turnout rate across technical workshops.',
          turnout_and_overbooking_recommendations: 'Given an 8% no-show rate, maintain a conservative 10% overbooking buffer for technical lab sessions.',
          preferred_timing_and_venue_insights: 'Morning sessions in Saraswathi Hall yield the highest student retention.',
          actionable_improvements: [
            'Standardize prerequisite environment setup guides 24h prior to sessions.',
            'Maintain dedicated TA support for live coding troubleshooting.',
          ],
        },
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    );
    console.log(`  ✓ Seeded past event "${pastEventTitle}" and cached AI advice for Coding Club`);
  }

  // 10. Seed Upcoming Event Owned by student1 with Volunteers (Idempotent)
  console.log('\n🤝 Checking sample upcoming event with volunteers for student1...');
  const upcomingTitle = 'Campus AI & Robotics Hackathon 2026';
  let upcomingEventId: string;

  const upcomingStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString();
  const upcomingEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 17 * 60 * 60 * 1000).toISOString();

  const { data: existingUpcoming } = await supabase
    .from('events')
    .select('id')
    .eq('title', upcomingTitle)
    .maybeSingle();

  const hallForUpcoming = existingHalls?.[0]?.id || saraswathi?.id;

  if (existingUpcoming) {
    upcomingEventId = existingUpcoming.id;
    await supabase
      .from('events')
      .update({
        organizer_email: 'student1@demo.edu',
        organizer_type: 'standalone',
        hall_id: hallForUpcoming,
        requested_hall_id: hallForUpcoming,
        start_time: upcomingStart,
        end_time: upcomingEnd,
        status: 'approved',
        approval_stage: 'cd',
        volunteers_needed: 3,
      })
      .eq('id', upcomingEventId);
  } else {
    const { data: newUpcoming, error: upErr } = await supabase
      .from('events')
      .insert({
        title: upcomingTitle,
        description: 'Flagship university-wide robotics and AI innovation hackathon. Student volunteers coordinate hall setup, check-in, and team mentorship.',
        organizer_email: 'student1@demo.edu',
        organizer_type: 'standalone',
        hall_id: hallForUpcoming,
        requested_hall_id: hallForUpcoming,
        start_time: upcomingStart,
        end_time: upcomingEnd,
        status: 'approved',
        approval_stage: 'cd',
        volunteers_needed: 3,
      })
      .select('id')
      .single();

    if (upErr) throw upErr;
    upcomingEventId = newUpcoming!.id;
  }

  // Seed student2 as pending volunteer
  await supabase.from('volunteers').upsert(
    {
      event_id: upcomingEventId,
      student_email: 'student2@demo.edu',
      status: 'pending',
      applied_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    },
    { onConflict: 'event_id,student_email' }
  );

  // Seed student3 as accepted volunteer
  await supabase.from('volunteers').upsert(
    {
      event_id: upcomingEventId,
      student_email: 'student3@demo.edu',
      status: 'accepted',
      applied_at: new Date(Date.now() - 7200 * 1000).toISOString(),
      decided_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      decided_by: 'student1@demo.edu',
    },
    { onConflict: 'event_id,student_email' }
  );
  console.log(`  ✓ Seeded upcoming event "${upcomingTitle}" (needs 3 volunteers: student2 pending, student3 accepted)`);

  // 11. Verification: Validate All Demo Accounts have BOTH Auth User & Whitelist Row
  console.log('\n🔍 Verifying all demo accounts (Auth & Whitelist Synchronization)...');

  // Re-fetch fresh auth users & allowed_users
  const { data: verifyAuth } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const freshAuthEmails = new Set(
    (verifyAuth?.users || []).map((u) => u.email?.trim().toLowerCase()).filter(Boolean)
  );

  const { data: verifyAllowed } = await supabase.from('allowed_users').select('email, role');
  const freshAllowedMap = new Map(
    (verifyAllowed || []).map((u) => [u.email.trim().toLowerCase(), u.role])
  );

  const verificationTable: Array<{
    email: string;
    role: string;
    has_auth_user: boolean;
    has_whitelist_row: boolean;
  }> = [];

  let anyMissing = false;

  for (const acc of DEMO_ACCOUNTS) {
    const cleanEmail = acc.email.trim().toLowerCase();
    const hasAuth = freshAuthEmails.has(cleanEmail);
    const hasWhitelist = freshAllowedMap.has(cleanEmail);

    if (!hasAuth || !hasWhitelist) {
      anyMissing = true;
    }

    verificationTable.push({
      email: cleanEmail,
      role: acc.role,
      has_auth_user: hasAuth,
      has_whitelist_row: hasWhitelist,
    });
  }

  console.log('\n📋 Demo Accounts Reconciliation Summary:');
  console.table(verificationTable);

  if (anyMissing) {
    console.error('\n❌ FATAL: One or more demo accounts is missing either an Auth user or allowed_users whitelist row!');
    process.exit(1);
  }

  console.log('\n✨ Database seeding and reconciliation completed successfully! All accounts are in sync.\n');
}

seed().catch((err) => {
  console.error('\n💥 FATAL SEED ERROR:', err);
  process.exit(1);
});
