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

interface AllowedUserSeed {
  email: string;
  role: 'student' | 'club' | 'department' | 'affairs';
  name: string;
  club_name?: string;
  department?: string;
  roll_no?: string;
}

const USERS: AllowedUserSeed[] = [
  // 3 Students
  {
    email: 'student1@demo.edu',
    role: 'student',
    name: 'Aarav Sharma',
    roll_no: 'cb.ps.i5das24049',
    department: 'Data Science',
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
    department: 'Artificial Intelligence',
  },

  // 3 Clubs
  {
    email: 'codingclub@demo.edu',
    role: 'club',
    name: 'Coding Club Admin',
    club_name: 'Coding Club',
  },
  {
    email: 'roboticsclub@demo.edu',
    role: 'club',
    name: 'Robotics Club Admin',
    club_name: 'Robotics & Automation Club',
  },
  {
    email: 'culturalclub@demo.edu',
    role: 'club',
    name: 'Cultural Club Admin',
    club_name: 'Spic Macay & Cultural Club',
  },

  // 2 Departments
  {
    email: 'cse@demo.edu',
    role: 'department',
    name: 'CSE Department Office',
    department: 'Computer Science and Engineering',
  },
  {
    email: 'datascience@demo.edu',
    role: 'department',
    name: 'Data Science Department Office',
    department: 'Data Science & AI',
  },

  // 1 Student Affairs
  {
    email: 'affairs@demo.edu',
    role: 'affairs',
    name: 'Student Welfare Dean Office',
  },
];

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

async function seed() {
  console.log('🚀 Starting idempotent database seed...');

  // 1. Seed / Upsert Halls by name
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
      if (error) console.error(`Failed to update hall ${hall.name}:`, error.message);
      else console.log(`  ✓ Updated hall: ${hall.name} (${hall.capacity} seats)`);
    } else {
      const { error } = await supabase.from('halls').insert(hall);
      if (error) console.error(`Failed to insert hall ${hall.name}:`, error.message);
      else console.log(`  + Created hall: ${hall.name} (${hall.capacity} seats)`);
    }
  }

  // 2. Seed Default Fests (all inactive)
  console.log('\n🎉 Upserting default fests...');
  for (const fest of DEFAULT_FESTS) {
    const { data: existingFest } = await supabase
      .from('fests')
      .select('id')
      .eq('name', fest.name)
      .maybeSingle();

    if (!existingFest) {
      const { error } = await supabase.from('fests').insert(fest);
      if (error) console.log(`  ℹ Note on fest ${fest.name}: ${error.message}`);
      else console.log(`  + Created fest: ${fest.name} (inactive)`);
    } else {
      console.log(`  ✓ Fest exists: ${fest.name}`);
    }
  }

  // 3. Ensure 'event-posters' storage bucket exists
  console.log('\n📦 Ensuring Storage bucket "event-posters"...');
  try {
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket('event-posters');
    if (!bucket || bucketError) {
      await supabase.storage.createBucket('event-posters', { public: true });
      console.log('  + Created public bucket "event-posters"');
    } else {
      console.log('  ✓ Storage bucket "event-posters" is ready');
    }
  } catch (err: unknown) {
    console.log('  ℹ Storage check:', err instanceof Error ? err.message : err);
  }

  // 4. Fetch existing auth users to handle idempotency
  console.log('\n👥 Seeding auth users and whitelist (allowed_users)...');
  const { data: authUsersData, error: listUsersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listUsersError) {
    console.error('Error fetching auth users:', listUsersError.message);
    process.exit(1);
  }

  const existingAuthByEmail = new Map<string, string>();
  for (const u of authUsersData.users) {
    if (u.email) {
      existingAuthByEmail.set(u.email.toLowerCase(), u.id);
    }
  }

  const PASSWORD = 'demo1234';

  for (const user of USERS) {
    const emailKey = user.email.toLowerCase();
    const existingId = existingAuthByEmail.get(emailKey);

    if (existingId) {
      // Update password & email_confirm
      const { error: updateError } = await supabase.auth.admin.updateUserById(existingId, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: user.name, role: user.role },
      });
      if (updateError) {
        console.error(`  ✗ Failed to update auth user for ${user.email}:`, updateError.message);
      } else {
        console.log(`  ✓ Updated auth user: ${user.email} [${user.role}]`);
      }
    } else {
      // Create user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: user.name, role: user.role },
      });
      if (createError) {
        console.error(`  ✗ Failed to create auth user for ${user.email}:`, createError.message);
      } else {
        console.log(`  + Created auth user: ${user.email} [${user.role}]`);
        if (newUser.user?.id) {
          existingAuthByEmail.set(emailKey, newUser.user.id);
        }
      }
    }

    // Upsert allowed_users table
    const { error: upsertAllowedError } = await supabase
      .from('allowed_users')
      .upsert(
        {
          email: user.email,
          role: user.role,
          name: user.name,
          club_name: user.club_name || null,
          department: user.department || null,
          roll_no: user.roll_no || null,
        },
        { onConflict: 'email' }
      );

    if (upsertAllowedError) {
      console.error(`  ✗ Failed to upsert allowed_users for ${user.email}:`, upsertAllowedError.message);
    } else {
      console.log(`    ↳ Whitelist record synced for: ${user.email}`);
    }
  }

  // 5. Seed sample events
  console.log('\n📅 Checking sample demo bookings...');
  const { data: existingHalls } = await supabase.from('halls').select('id, name');
  const amriteshwari = existingHalls?.find((h) => h.name === 'Amriteshwari');
  const sudhamani = existingHalls?.find((h) => h.name === 'Sudhamani Hall');
  const saraswathi = existingHalls?.find((h) => h.name === 'Saraswathi Hall');

  if (amriteshwari && sudhamani && saraswathi) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayPrefix = `${yyyy}-${mm}-${dd}`;

    interface SampleEvent {
      title: string;
      description: string;
      organizer_email: string;
      club_or_dept: string;
      hall_id: string;
      start_time: string;
      end_time: string;
      status: 'draft' | 'submitted' | 'approved' | 'rejected';
      fest_id?: string | null;
      registration_link?: string | null;
    }

    const sampleEvents: SampleEvent[] = [
      {
        title: 'National Hackathon 2026 - Inaugural Ceremony',
        description: 'Opening ceremony and keynotes for the annual hackathon.',
        organizer_email: 'codingclub@demo.edu',
        club_or_dept: 'Coding Club',
        hall_id: amriteshwari.id,
        start_time: `${todayPrefix}T09:00:00.000Z`,
        end_time: `${todayPrefix}T12:00:00.000Z`,
        status: 'approved',
        registration_link: 'https://anokha.amrita.edu/hackathon',
      },
      {
        title: 'Cultural Music Concert & Classical Rhythms',
        description: 'Inter-college classical and contemporary music performance.',
        organizer_email: 'culturalclub@demo.edu',
        club_or_dept: 'Cultural Club',
        hall_id: sudhamani.id,
        start_time: `${todayPrefix}T14:00:00.000Z`,
        end_time: `${todayPrefix}T17:30:00.000Z`,
        status: 'approved',
      },
      {
        title: 'AI Robotics Workshop & Drone Demonstration',
        description: 'Hands-on ROS2 and autonomous obstacle avoidance workshop.',
        organizer_email: 'roboticsclub@demo.edu',
        club_or_dept: 'Robotics Club',
        hall_id: saraswathi.id,
        start_time: `${todayPrefix}T10:00:00.000Z`,
        end_time: `${todayPrefix}T13:00:00.000Z`,
        status: 'submitted',
      },
    ];

    for (const ev of sampleEvents) {
      const { data: existingEvent } = await supabase
        .from('events')
        .select('id')
        .eq('title', ev.title)
        .maybeSingle();

      if (!existingEvent) {
        const { error: evError } = await supabase.from('events').insert(ev);
        if (evError) {
          console.log(`  ℹ Note on sample event "${ev.title}": ${evError.message}`);
        } else {
          console.log(`  + Sample booking created: "${ev.title}" (${ev.status})`);
        }
      }
    }
  }

  console.log('\n✨ Database seeding complete! All demo accounts initialized with password: demo1234\n');
}

seed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
