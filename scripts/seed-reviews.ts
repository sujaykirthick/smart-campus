import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local first, fallback to .env
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
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEFAULT_PASSWORD = 'demo1234';

// 8 demo student accounts
const STUDENTS = [
  { email: 'student1@demo.edu', name: 'Aarav Sharma', roll_no: 'cb.ps.i5das24049', dept: 'Data Science' },
  { email: 'student2@demo.edu', name: 'Diya Patel', roll_no: 'cb.en.u4cse23108', dept: 'Computer Science' },
  { email: 'student3@demo.edu', name: 'Rohan Kumar', roll_no: 'cb.en.u4aie24201', dept: 'AI Engineering' },
  { email: 'student4@demo.edu', name: 'Ananya Iyer', roll_no: 'cb.ps.i5das24050', dept: 'Data Science' },
  { email: 'student5@demo.edu', name: 'Vikram Menon', roll_no: 'cb.en.u4ece22091', dept: 'Electronics' },
  { email: 'student6@demo.edu', name: 'Pooja Hegde', roll_no: 'cb.en.u4aie23112', dept: 'AI Engineering' },
  { email: 'student7@demo.edu', name: 'Siddharth Rao', roll_no: 'cb.en.u4cys24015', dept: 'Cyber Security' },
  { email: 'student8@demo.edu', name: 'Sneha Reddy', roll_no: 'cb.en.u4mec23055', dept: 'Mechanical' },
];

// Realistic mixed reviews from 6 checked-in students (ratings 2-5)
const REVIEWS_DATA = [
  {
    student_email: 'student1@demo.edu',
    rating: 5,
    comment: 'Exceptional hands-on workshop on neural architectures. The live coding walkthrough and code snippets were very well prepared by the mentors.',
  },
  {
    student_email: 'student2@demo.edu',
    rating: 4,
    comment: 'The session content was super engaging and practical. However, the venue acoustics were slightly echoey towards the back rows.',
  },
  {
    student_email: 'student3@demo.edu',
    rating: 5,
    comment: 'Great pacing and insightful Q&A session. Really appreciated the hands-on lab exercises and detailed architecture diagrams.',
  },
  {
    student_email: 'student4@demo.edu',
    rating: 3,
    comment: 'Solid presentation, but the schedule started 25 minutes late and lunch distribution felt disorganized with long queues.',
  },
  {
    student_email: 'student5@demo.edu',
    rating: 2,
    comment: 'The microphone kept producing feedback noise during the keynote and the room was overcrowded with limited charging ports.',
  },
  {
    student_email: 'student6@demo.edu',
    rating: 4,
    comment: 'Good introduction to agentic pipelines. Would have loved more time for individual project critiques at the end.',
  },
];

async function main() {
  console.log('🌱 Running idempotent seed for demo accounts, past event, and reviews...\n');

  // 1. Ensure organizer account exists
  const organizerEmail = 'codingclub@demo.edu';
  await supabase.from('allowed_users').upsert({
    email: organizerEmail,
    role: 'club',
    name: 'Coding Club',
    club_name: 'Coding Club',
  });

  const { data: orgUserList } = await supabase.auth.admin.listUsers();
  const existingOrgUser = orgUserList?.users?.find((u) => u.email === organizerEmail);
  if (!existingOrgUser) {
    await supabase.auth.admin.createUser({
      email: organizerEmail,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: 'Coding Club',
        role: 'club',
      },
    });
  } else {
    await supabase.auth.admin.updateUserById(existingOrgUser.id, {
      password: DEFAULT_PASSWORD,
      email_confirm: true,
    });
  }

  // 2. Ensure all 8 student accounts in allowed_users & auth with demo1234
  for (const student of STUDENTS) {
    await supabase.from('allowed_users').upsert({
      email: student.email,
      role: 'student',
      name: student.name,
      roll_no: student.roll_no,
      department: student.dept,
    });

    const existingStudentUser = orgUserList?.users?.find((u) => u.email === student.email);
    if (!existingStudentUser) {
      const { error: signUpError } = await supabase.auth.admin.createUser({
        email: student.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name: student.name,
          role: 'student',
          roll_no: student.roll_no,
        },
      });

      if (signUpError && !signUpError.message.toLowerCase().includes('already')) {
        console.warn(`Auth user note for ${student.email}:`, signUpError.message);
      }
    } else {
      await supabase.auth.admin.updateUserById(existingStudentUser.id, {
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      });
    }
  }

  console.log('✅ 8 student accounts configured (student1..student8@demo.edu, password: demo1234)');

  // 3. Hall setup
  const { data: halls } = await supabase.from('halls').select('id, name').limit(1);
  let hallId: string;
  if (!halls || halls.length === 0) {
    const { data: newHall } = await supabase
      .from('halls')
      .upsert({ name: 'Saraswathi Hall', capacity: 200, location: 'Academic Block 2' }, { onConflict: 'name' })
      .select('id')
      .single();
    hallId = newHall!.id;
  } else {
    hallId = halls[0].id;
  }

  // 4. Temporarily set event time in future so registration trigger allows insertions
  const tempFutureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const tempFutureEnd = new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString();
  const eventTitle = 'Full-Stack Agentic AI Workshop';

  const { data: existingEvents } = await supabase
    .from('events')
    .select('id')
    .eq('title', eventTitle)
    .limit(1);

  let eventId: string;
  if (existingEvents && existingEvents.length > 0) {
    eventId = existingEvents[0].id;
    await supabase
      .from('events')
      .update({
        organizer_email: organizerEmail,
        club_or_dept: 'Coding Club',
        hall_id: hallId,
        start_time: tempFutureStart,
        end_time: tempFutureEnd,
        status: 'approved',
        description: 'Hands-on technical workshop on building autonomous developer agents and LLM tool pipelines.',
      })
      .eq('id', eventId);
  } else {
    const { data: newEvent, error: evErr } = await supabase
      .from('events')
      .insert({
        title: eventTitle,
        organizer_email: organizerEmail,
        club_or_dept: 'Coding Club',
        hall_id: hallId,
        start_time: tempFutureStart,
        end_time: tempFutureEnd,
        status: 'approved',
        description: 'Hands-on technical workshop on building autonomous developer agents and LLM tool pipelines.',
      })
      .select('id')
      .single();

    if (evErr || !newEvent) {
      throw new Error(`Failed to create event: ${evErr?.message}`);
    }
    eventId = newEvent.id;
  }

  // 5. Seed 8 registrations: 6 checked-in, 2 unverified/absent
  for (let i = 0; i < STUDENTS.length; i++) {
    const st = STUDENTS[i];
    const isCheckedIn = i < 6;
    const checkinTime = isCheckedIn
      ? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + (9 + Math.floor(i / 2)) * 60 * 60 * 1000).toISOString()
      : null;

    const { error: regErr } = await supabase.from('registrations').upsert(
      {
        event_id: eventId,
        student_email: st.email,
        roll_no: st.roll_no,
        status: 'confirmed',
        checked_in_at: checkinTime,
        checked_in_by: isCheckedIn ? organizerEmail : null,
      },
      { onConflict: 'event_id,student_email' }
    );

    if (regErr) {
      console.warn(`Registration note for ${st.email}:`, regErr.message);
    }
  }

  console.log(`✅ 8 registrations inserted (6 checked in, 2 absent/unscanned)`);

  // 6. Update event times to past (ended 3 days ago)
  const pastStartTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString();
  const pastEndTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 13 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('events')
    .update({
      start_time: pastStartTime,
      end_time: pastEndTime,
    })
    .eq('id', eventId);

  console.log(`✅ Past ended event configured: "${eventTitle}" (ID: ${eventId})`);

  // 7. Seed 6 reviews from the 6 checked-in students
  for (const rev of REVIEWS_DATA) {
    const { error: revErr } = await supabase.from('reviews').upsert(
      {
        event_id: eventId,
        student_email: rev.student_email,
        rating: rev.rating,
        comment: rev.comment,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'event_id,student_email' }
    );

    if (revErr) {
      console.warn(`Review note for ${rev.student_email}:`, revErr.message);
    }
  }

  console.log(`✅ 6 student reviews (ratings 2-5 with mixed comments) seeded`);
  console.log(`\n========================================================`);
  console.log(`🎉 SUCCESS! Seed completed.`);
  console.log(`👉 Event ID: ${eventId}`);
  console.log(`👉 View Insights: /organizer/events/${eventId}/insights`);
  console.log(`========================================================\n`);
}

main().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
