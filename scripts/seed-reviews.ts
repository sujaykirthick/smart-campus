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
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEFAULT_PASSWORD = 'DemoPass123!';

// 12 Students for Registration and Review testing
const STUDENTS = [
  { email: 'student1@demo.edu', name: 'Aarav Sharma', roll_no: 'cb.ps.i5das24049', dept: 'Data Science' },
  { email: 'student2@demo.edu', name: 'Diya Patel', roll_no: 'cb.en.u4cse23108', dept: 'Computer Science' },
  { email: 'student3@demo.edu', name: 'Rohan Kumar', roll_no: 'cb.en.u4aie24201', dept: 'AI Engineering' },
  { email: 'student4@demo.edu', name: 'Ananya Iyer', roll_no: 'cb.en.u4cse23044', dept: 'Computer Science' },
  { email: 'student5@demo.edu', name: 'Vikram Menon', roll_no: 'cb.en.u4ece22091', dept: 'Electronics' },
  { email: 'student6@demo.edu', name: 'Pooja Hegde', roll_no: 'cb.en.u4aie23112', dept: 'AI Engineering' },
  { email: 'student7@demo.edu', name: 'Siddharth Rao', roll_no: 'cb.en.u4cys24015', dept: 'Cyber Security' },
  { email: 'student8@demo.edu', name: 'Sneha Reddy', roll_no: 'cb.en.u4cse22199', dept: 'Computer Science' },
  { email: 'student9@demo.edu', name: 'Karthik Nair', roll_no: 'cb.en.u4mec23055', dept: 'Mechanical' },
  { email: 'student10@demo.edu', name: 'Meera Nambiar', roll_no: 'cb.en.u4eee24088', dept: 'Electrical' },
  { email: 'student11@demo.edu', name: 'Aditya Varma', roll_no: 'cb.en.u4cse24120', dept: 'Computer Science' },
  { email: 'student12@demo.edu', name: 'Tanvi Joshi', roll_no: 'cb.en.u4aie22031', dept: 'AI Engineering' },
];

const REVIEWS_DATA = [
  {
    student_email: 'student1@demo.edu',
    rating: 5,
    comment: 'The hands-on workshop on building LLM agents was incredible! The mentors helped debug our API code quickly and the practical exercises were very engaging.',
  },
  {
    student_email: 'student2@demo.edu',
    rating: 4,
    comment: 'Great session and very insightful architecture breakdown. The speaker covered prompt evaluation thoroughly. The venue AC was a bit too cold in the morning though.',
  },
  {
    student_email: 'student3@demo.edu',
    rating: 5,
    comment: 'Best technical event of the semester! Really appreciated the live coding demo and free cloud API credits provided to participants.',
  },
  {
    student_email: 'student4@demo.edu',
    rating: 3,
    comment: 'Content was top notch, but the Q&A session felt slightly rushed at the end. Would love longer breakout rooms and more time for networking.',
  },
  {
    student_email: 'student5@demo.edu',
    rating: 5,
    comment: 'Awesome energy throughout the day! The organizers explained multimodal interactions super clearly. Looking forward to the next hackathon.',
  },
  {
    student_email: 'student6@demo.edu',
    rating: 2,
    comment: 'Wi-Fi in the hall dropped repeatedly during the hands-on lab which caused delays for several teams trying to pull container images.',
  },
  {
    student_email: 'student7@demo.edu',
    rating: 4,
    comment: 'Very well coordinated QR check-in queue and great event swag bag. Would appreciate more intermediate-level code repositories next time.',
  },
];

async function main() {
  console.log('🌱 Starting reviews and past ended event seed...');

  // 1. Ensure organizer allowed_user and auth user
  const organizerEmail = 'codingclub@demo.edu';
  await supabase.from('allowed_users').upsert({
    email: organizerEmail,
    role: 'club',
    name: 'Coding Club Admin',
    club_name: 'Coding Club',
  });

  // 2. Ensure students in allowed_users and auth
  for (const student of STUDENTS) {
    await supabase.from('allowed_users').upsert({
      email: student.email,
      role: 'student',
      name: student.name,
      roll_no: student.roll_no,
      department: student.dept,
    });

    // Create auth account if not exists
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
      console.warn(`Auth user creation note for ${student.email}:`, signUpError.message);
    }
  }

  // 3. Find or get a hall
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

  // 4. Create/Upsert past ended approved event (e.g., 3 days ago)
  const pastStartTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000).toISOString(); // 10 AM 3 days ago
  const pastEndTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000).toISOString();   // 4 PM 3 days ago

  const eventTitle = 'Generative AI Developer Summit 2026';

  // Check if already exists
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
        start_time: pastStartTime,
        end_time: pastEndTime,
        status: 'approved',
        description: 'Deep dive into Google Gemini 2.5, agentic workflows, and multimodal engineering with hands-on lab demos.',
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
        start_time: pastStartTime,
        end_time: pastEndTime,
        status: 'approved',
        description: 'Deep dive into Google Gemini 2.5, agentic workflows, and multimodal engineering with hands-on lab demos.',
      })
      .select('id')
      .single();

    if (evErr || !newEvent) {
      throw new Error(`Failed to create past event: ${evErr?.message}`);
    }
    eventId = newEvent.id;
  }

  console.log(`✅ Past ended event configured: "${eventTitle}" (ID: ${eventId})`);

  // 5. Seed 12 registrations (9 scanned, 3 no-shows)
  for (let i = 0; i < STUDENTS.length; i++) {
    const st = STUDENTS[i];
    const isCheckedIn = i < 9; // First 9 are scanned
    const checkinTime = isCheckedIn
      ? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + (10 + Math.floor(i / 2)) * 60 * 60 * 1000).toISOString()
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
      console.warn(`Registration upsert note for ${st.email}:`, regErr.message);
    }
  }

  console.log(`✅ 12 student registrations created (9 scanned attendees, 3 no-shows).`);

  // 6. Seed 7 reviews with realistic comments from 7 scanned students
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
      console.warn(`Review upsert note for ${rev.student_email}:`, revErr.message);
    }
  }

  console.log(`✅ 7 student reviews seeded successfully.`);
  console.log(`🎉 Seeding complete! You can now test AI Summaries on event ID: ${eventId}`);
}

main().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
