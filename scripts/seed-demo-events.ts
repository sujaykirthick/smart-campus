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
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'demo1234';

interface AccountDef {
  email: string;
  role: 'student' | 'faculty' | 'student_affairs' | 'event_office' | 'cd';
  name: string;
  roll_no?: string;
  department?: string;
}

// 1. BASE ACCOUNTS: student1..12, faculty1..2, approvers
const CORE_ACCOUNTS: AccountDef[] = [
  { email: 'student1@demo.edu', role: 'student', name: 'Aarav Sharma', roll_no: 'cb.ps.i5das24049', department: 'Data Science & AI' },
  { email: 'student2@demo.edu', role: 'student', name: 'Diya Patel', roll_no: 'cb.en.u4cse23108', department: 'Computer Science and Engineering' },
  { email: 'student3@demo.edu', role: 'student', name: 'Rohan Kumar', roll_no: 'cb.en.u4aie24201', department: 'Data Science & AI' },
  { email: 'student4@demo.edu', role: 'student', name: 'Kavya Subramanian', roll_no: 'cb.en.u4cse24001', department: 'Computer Science and Engineering' },
  { email: 'student5@demo.edu', role: 'student', name: 'Aditya Verma', roll_no: 'cb.ps.i5das24012', department: 'Data Science & AI' },
  { email: 'student6@demo.edu', role: 'student', name: 'Ananya Iyer', roll_no: 'cb.en.u4cse23155', department: 'Computer Science and Engineering' },
  { email: 'student7@demo.edu', role: 'student', name: 'Siddharth Rao', roll_no: 'cb.en.u4ece23044', department: 'Electronics & Communication Engineering' },
  { email: 'student8@demo.edu', role: 'student', name: 'Pooja Hegde', roll_no: 'cb.en.u4cse24089', department: 'Computer Science and Engineering' },
  { email: 'student9@demo.edu', role: 'student', name: 'Vikram Menon', roll_no: 'cb.ps.i5das24031', department: 'Data Science & AI' },
  { email: 'student10@demo.edu', role: 'student', name: 'Sneha Reddy', roll_no: 'cb.en.u4ece24102', department: 'Electronics & Communication Engineering' },
  { email: 'student11@demo.edu', role: 'student', name: 'Gautam Nambiar', roll_no: 'cb.en.u4cse23220', department: 'Computer Science and Engineering' },
  { email: 'student12@demo.edu', role: 'student', name: 'Rhea Sengupta', roll_no: 'cb.ps.i5das24019', department: 'Data Science & AI' },
  { email: 'faculty1@demo.edu', role: 'faculty', name: 'Dr. Rajesh Nair', department: 'Computer Science and Engineering' },
  { email: 'faculty2@demo.edu', role: 'faculty', name: 'Dr. Meera Krishnan', department: 'Department of Mathematics' },
  { email: 'affairs@demo.edu', role: 'student_affairs', name: 'Student Welfare Dean Office' },
  { email: 'eventoffice@demo.edu', role: 'event_office', name: 'Campus Event Office' },
  { email: 'cd@demo.edu', role: 'cd', name: 'Campus Director Office' },
];

// Additional attendees to support 20-60 attendees per event
const ADDITIONAL_STUDENTS: AccountDef[] = Array.from({ length: 48 }, (_, i) => {
  const num = i + 13;
  const pad = String(num).padStart(3, '0');
  const firstNames = ['Arjun', 'Meera', 'Karan', 'Priya', 'Nikhil', 'Tanvi', 'Varun', 'Isha', 'Harish', 'Divya', 'Sanjay', 'Shruti'];
  const lastNames = ['Gupta', 'Deshmukh', 'Chopra', 'Bose', 'Pillai', 'Joshi', 'Bhat', 'Mehta', 'Kulkarni', 'Nair', 'Shetty', 'Saxena'];
  const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
  return {
    email: `student${num}@demo.edu`,
    role: 'student' as const,
    name,
    roll_no: `cb.ps.i5das24${pad}`,
    department: i % 2 === 0 ? 'Data Science & AI' : 'Computer Science and Engineering',
  };
});

const ALL_ACCOUNTS: AccountDef[] = [...CORE_ACCOUNTS, ...ADDITIONAL_STUDENTS];

const CLUBS = [
  'Coding Club',
  'Robotics & Automation Club',
  'Spic Macay & Cultural Club',
  'ACM Student Chapter',
];

const DEPARTMENTS = [
  'Computer Science and Engineering',
  'Data Science & AI',
  'Electronics & Communication Engineering',
  'Department of Mathematics',
];

const POSTERS = [
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&auto=format&fit=crop&q=80',
];

async function ensureAccountsAndOrgs() {
  console.log('1. Ensuring demo organizations, departments, and fests...');

  // 1a. Organizations
  const orgMap = new Map<string, string>();
  for (const name of CLUBS) {
    const { data: existing } = await supabase.from('organizations').select('id').eq('name', name).maybeSingle();
    if (existing) {
      orgMap.set(name, existing.id);
    } else {
      const { data: created } = await supabase.from('organizations').insert({ name, type: 'club' }).select('id').single();
      if (created) orgMap.set(name, created.id);
    }
  }

  for (const name of DEPARTMENTS) {
    const { data: existing } = await supabase.from('organizations').select('id').eq('name', name).maybeSingle();
    if (existing) {
      orgMap.set(name, existing.id);
    } else {
      const { data: created } = await supabase.from('organizations').insert({ name, type: 'department' }).select('id').single();
      if (created) orgMap.set(name, created.id);
    }
  }

  // 1b. Fest (Mark Anokha active)
  const { data: existingFest } = await supabase.from('fests').select('id, name').eq('name', 'Anokha').maybeSingle();
  let anokhaId = existingFest?.id;
  if (existingFest) {
    await supabase.from('fests').update({ is_active: true }).eq('id', existingFest.id);
  } else {
    const { data: newFest } = await supabase.from('fests').insert({ name: 'Anokha', is_active: true }).select('id').single();
    anokhaId = newFest?.id;
  }

  // 1c. Ensure demo auth accounts & allowed_users
  console.log('2. Ensuring demo user accounts & allowed_users...');
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const authEmailMap = new Map<string, string>();
  (authUsers?.users || []).forEach((u) => {
    if (u.email) authEmailMap.set(u.email.toLowerCase().trim(), u.id);
  });

  for (const acc of ALL_ACCOUNTS) {
    const lowerEmail = acc.email.toLowerCase().trim();

    // Only create auth account if it doesn't exist
    if (!authEmailMap.has(lowerEmail)) {
      const { data: createdAuth, error: authErr } = await supabase.auth.admin.createUser({
        email: lowerEmail,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: acc.name, role: acc.role },
      });
      if (!authErr && createdAuth.user) {
        authEmailMap.set(lowerEmail, createdAuth.user.id);
      }
    }

    // Upsert into allowed_users
    await supabase.from('allowed_users').upsert({
      email: lowerEmail,
      role: acc.role as any,
      name: acc.name,
      roll_no: acc.roll_no || null,
      department: acc.department || null,
    }, { onConflict: 'email' });
  }

  // 1d. Club memberships
  console.log('3. Assigning club memberships...');
  const acmId = orgMap.get('ACM Student Chapter');
  const codingId = orgMap.get('Coding Club');
  const roboticsId = orgMap.get('Robotics & Automation Club');
  const culturalId = orgMap.get('Spic Macay & Cultural Club');

  const membershipsToAdd: Array<{ organization_id: string; email: string; member_role: 'lead' | 'member' }> = [];
  if (acmId) {
    membershipsToAdd.push(
      { organization_id: acmId, email: 'student1@demo.edu', member_role: 'lead' },
      { organization_id: acmId, email: 'student2@demo.edu', member_role: 'member' },
      { organization_id: acmId, email: 'student3@demo.edu', member_role: 'member' },
      { organization_id: acmId, email: 'faculty1@demo.edu', member_role: 'lead' },
      { organization_id: acmId, email: 'student5@demo.edu', member_role: 'member' },
      { organization_id: acmId, email: 'student6@demo.edu', member_role: 'member' }
    );
  }
  if (codingId) {
    membershipsToAdd.push(
      { organization_id: codingId, email: 'student1@demo.edu', member_role: 'member' },
      { organization_id: codingId, email: 'student3@demo.edu', member_role: 'lead' },
      { organization_id: codingId, email: 'student7@demo.edu', member_role: 'member' }
    );
  }
  if (roboticsId) {
    membershipsToAdd.push(
      { organization_id: roboticsId, email: 'student1@demo.edu', member_role: 'lead' },
      { organization_id: roboticsId, email: 'student8@demo.edu', member_role: 'member' }
    );
  }
  if (culturalId) {
    membershipsToAdd.push(
      { organization_id: culturalId, email: 'student2@demo.edu', member_role: 'lead' },
      { organization_id: culturalId, email: 'student9@demo.edu', member_role: 'member' }
    );
  }

  for (const m of membershipsToAdd) {
    await supabase.from('organization_members').upsert(m, { onConflict: 'organization_id,email' });
  }

  return { orgMap, anokhaId };
}

async function seed() {
  console.log('====================================================');
  console.log('STARTING REALISTIC IDEMPOTENT DEMO DATA SEED');
  console.log('====================================================\n');

  const { orgMap, anokhaId } = await ensureAccountsAndOrgs();

  // Fetch all halls
  const { data: halls } = await supabase.from('halls').select('*').order('name');
  if (!halls || halls.length === 0) {
    throw new Error('No halls found in database.');
  }

  const hallByName = new Map<string, any>();
  halls.forEach((h) => hallByName.set(h.name, h));

  // Helper to pick hall safely
  const getHall = (preferred: string) => {
    return hallByName.get(preferred) || halls[0];
  };

  const now = Date.now();
  const dayMs = 86400000;
  const hourMs = 3600000;

  // Arrays to collect items for atomic batch insertion
  const eventsBatch: any[] = [];
  const approvalsBatch: any[] = [];
  const registrationsBatch: any[] = [];
  const volunteersBatch: any[] = [];
  const reviewsBatch: any[] = [];

  // Deterministic UUIDs to ensure idempotence across runs
  const eventIds = {
    // Past events
    acm1: '11111111-0001-4000-8000-000000000001',
    acm2: '11111111-0001-4000-8000-000000000002',
    acm3: '11111111-0001-4000-8000-000000000003',
    acm4: '11111111-0001-4000-8000-000000000004',
    robotics1: '11111111-0002-4000-8000-000000000001',
    robotics2: '11111111-0002-4000-8000-000000000002',
    math1: '11111111-0003-4000-8000-000000000001',
    math2: '11111111-0003-4000-8000-000000000002',
    standalonePast: '11111111-0004-4000-8000-000000000001',
    festPast: '11111111-0005-4000-8000-000000000001',

    // Ongoing
    ongoing: '22222222-0001-4000-8000-000000000001',

    // Upcoming approved
    upcomingFull: '33333333-0001-4000-8000-000000000001',
    upcomingVolunteers: '33333333-0002-4000-8000-000000000002',
    upcomingDept: '33333333-0003-4000-8000-000000000003',
    upcomingFest: '33333333-0004-4000-8000-000000000004',
    upcomingExtLink: '33333333-0005-4000-8000-000000000005',
    upcomingCultural: '33333333-0006-4000-8000-000000000006',

    // Pipeline
    pipeAffairs: '44444444-0001-4000-8000-000000000001',
    pipeEventOffice: '44444444-0002-4000-8000-000000000002',
    pipeCd: '44444444-0003-4000-8000-000000000003',
    pipeRejected: '44444444-0004-4000-8000-000000000004',
    pipeDraft1: '44444444-0005-4000-8000-000000000005',
    pipeDraft2: '44444444-0006-4000-8000-000000000006',
  };

  // Helper to add 3-stage approval history with deterministic UUIDs
  const addFullApprovalHistory = (evId: string, baseTime: number) => {
    const prefix = evId.slice(0, 24);
    approvalsBatch.push(
      {
        id: `${prefix}111111111111`,
        event_id: evId,
        stage: 'student_affairs',
        approver_email: 'affairs@demo.edu',
        decision: 'approved',
        reason: 'Student Affairs: verified eligibility and club budget clearance.',
        created_at: new Date(baseTime - 3 * dayMs).toISOString(),
      },
      {
        id: `${prefix}222222222222`,
        event_id: evId,
        stage: 'event_office',
        approver_email: 'eventoffice@demo.edu',
        decision: 'approved',
        reason: 'Event Office: venue availability confirmed and equipment provisioned.',
        created_at: new Date(baseTime - 2 * dayMs).toISOString(),
      },
      {
        id: `${prefix}333333333333`,
        event_id: evId,
        stage: 'cd',
        approver_email: 'cd@demo.edu',
        decision: 'approved',
        reason: 'Campus Director: final executive sanction granted.',
        created_at: new Date(baseTime - 1 * dayMs).toISOString(),
      }
    );
  };

  // -------------------------------------------------------------------------
  // SECTION 1: PAST APPROVED & ENDED EVENTS
  // -------------------------------------------------------------------------
  console.log('4. Generating Past Events (ended with upward attendance trend & reviews)...');

  // 1. ACM Past 1 (38 days ago)
  const acmHall = getHall('CSE Seminar Hall');
  eventsBatch.push({
    id: eventIds.acm1,
    title: 'ACM Tech Trek: Cloud & Microservices Summit',
    description: 'Deep dive into Kubernetes architecture, gRPC inter-service communication, and distributed tracing with hands-on demonstrations.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'ACM Student Chapter',
    organizer_type: 'club',
    organization_id: orgMap.get('ACM Student Chapter'),
    hall_id: acmHall.id,
    start_time: new Date(now - 38 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now - 38 * dayMs + 13 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[0],
    volunteers_needed: 2,
    created_at: new Date(now - 45 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.acm1, now - 38 * dayMs);

  // 2. ACM Past 2 (28 days ago)
  eventsBatch.push({
    id: eventIds.acm2,
    title: 'ACM DevSprint: Open Source Hackathon',
    description: 'Fast-paced 12-hour code sprint focusing on contributing bug fixes and documentation to major open source Apache and CNCF repositories.',
    organizer_email: 'student2@demo.edu',
    club_or_dept: 'ACM Student Chapter',
    organizer_type: 'club',
    organization_id: orgMap.get('ACM Student Chapter'),
    hall_id: acmHall.id,
    start_time: new Date(now - 28 * dayMs + 9 * hourMs).toISOString(),
    end_time: new Date(now - 28 * dayMs + 15 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[1],
    volunteers_needed: 2,
    created_at: new Date(now - 35 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.acm2, now - 28 * dayMs);

  // 3. ACM Past 3 (18 days ago)
  eventsBatch.push({
    id: eventIds.acm3,
    title: 'ACM AI Workshop: Practical LLM Deployment',
    description: 'Learn quantization, LoRA fine-tuning, and low-latency inference on consumer hardware with real-world case studies.',
    organizer_email: 'student3@demo.edu',
    club_or_dept: 'ACM Student Chapter',
    organizer_type: 'club',
    organization_id: orgMap.get('ACM Student Chapter'),
    hall_id: acmHall.id,
    start_time: new Date(now - 18 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now - 18 * dayMs + 13 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[2],
    volunteers_needed: 2,
    created_at: new Date(now - 25 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.acm3, now - 18 * dayMs);

  // 4. ACM Past 4 (7 days ago) - HIGHEST ATTENDANCE in trend
  eventsBatch.push({
    id: eventIds.acm4,
    title: 'ACM Annual Tech Symposium & Coding Championship',
    description: 'Flagship annual gathering featuring algorithmic challenges, research paper presentations, and keynote addresses from visiting industry scientists.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'ACM Student Chapter',
    organizer_type: 'club',
    organization_id: orgMap.get('ACM Student Chapter'),
    hall_id: acmHall.id,
    start_time: new Date(now - 7 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now - 7 * dayMs + 17 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[3],
    volunteers_needed: 4,
    created_at: new Date(now - 14 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.acm4, now - 7 * dayMs);

  // 5. Robotics Club Past 1 (22 days ago)
  const mechHall = getHall('Mechanical Seminar Hall');
  eventsBatch.push({
    id: eventIds.robotics1,
    title: 'Autonomous Robotics Expo & Quadcopter Arena',
    description: 'Demonstrations of obstacle-avoiding quadcopters, line followers, and inverse kinematic robotic arms built by undergraduate teams.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Robotics & Automation Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Robotics & Automation Club'),
    hall_id: mechHall.id,
    start_time: new Date(now - 22 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now - 22 * dayMs + 13 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[4],
    volunteers_needed: 3,
    created_at: new Date(now - 30 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.robotics1, now - 22 * dayMs);

  // 6. Robotics Club Past 2 (12 days ago)
  eventsBatch.push({
    id: eventIds.robotics2,
    title: 'ROS2 & Embedded Control Workshop',
    description: 'Hands-on hardware lab connecting micro-ROS on ESP32 to ROS2 Humble nodes for real-time sensor telemetry.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Robotics & Automation Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Robotics & Automation Club'),
    hall_id: mechHall.id,
    start_time: new Date(now - 12 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now - 12 * dayMs + 17 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[5],
    volunteers_needed: 2,
    created_at: new Date(now - 20 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.robotics2, now - 12 * dayMs);

  // 7. Department of Mathematics Past 1 (25 days ago)
  const sem1Hall = getHall('Seminar Hall 1');
  eventsBatch.push({
    id: eventIds.math1,
    title: 'National Mathematics Colloquium: Applied Linear Algebra',
    description: 'Exploration of singular value decomposition, randomized numerical linear algebra, and spectral graph theory in modern computing.',
    organizer_email: 'faculty2@demo.edu',
    club_or_dept: 'Department of Mathematics',
    organizer_type: 'department',
    organization_id: orgMap.get('Department of Mathematics'),
    hall_id: sem1Hall.id,
    start_time: new Date(now - 25 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now - 25 * dayMs + 12.5 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: null, // No poster on purpose
    volunteers_needed: 1,
    created_at: new Date(now - 32 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.math1, now - 25 * dayMs);

  // 8. Department of Mathematics Past 2 (15 days ago)
  eventsBatch.push({
    id: eventIds.math2,
    title: 'Probability & Stochastic Processes in Deep Learning',
    description: 'Rigorous theoretical review of Markov Chains, Langevin Dynamics, and Diffusion Probabilistic Models with mathematical proofs.',
    organizer_email: 'faculty2@demo.edu',
    club_or_dept: 'Department of Mathematics',
    organizer_type: 'department',
    organization_id: orgMap.get('Department of Mathematics'),
    hall_id: sem1Hall.id,
    start_time: new Date(now - 15 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now - 15 * dayMs + 16.5 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[6],
    volunteers_needed: 1,
    created_at: new Date(now - 22 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.math2, now - 15 * dayMs);

  // 9. Standalone Past by faculty1 (19 days ago)
  const sem2Hall = getHall('Seminar Hall 2');
  eventsBatch.push({
    id: eventIds.standalonePast,
    title: 'Research Methodology & High-Impact Journal Publishing',
    description: 'Interactive session covering systematic literature reviews, structuring scientific manuscripts, and navigating peer-review rebuttal cycles.',
    organizer_email: 'faculty1@demo.edu',
    club_or_dept: null,
    organizer_type: 'standalone',
    organization_id: null,
    hall_id: sem2Hall.id,
    start_time: new Date(now - 19 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now - 19 * dayMs + 12 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: null, // No poster
    volunteers_needed: 1,
    created_at: new Date(now - 27 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.standalonePast, now - 19 * dayMs);

  // 10. Fest Past (Anokha Symphony - 9 days ago)
  const audiHall = getHall('Main Auditorium');
  eventsBatch.push({
    id: eventIds.festPast,
    title: 'Anokha ProNight: Classical & Contemporary Symphony',
    description: 'Mesmerizing evening of classical instrumental performances and acoustic harmonies kickstarting the Anokha cultural weekend.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Anokha Festival Team',
    organizer_type: 'standalone',
    organization_id: null,
    hall_id: audiHall.id,
    start_time: new Date(now - 9 * dayMs + 16 * hourMs).toISOString(),
    end_time: new Date(now - 9 * dayMs + 20 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[0],
    fest_id: anokhaId,
    volunteers_needed: 6,
    created_at: new Date(now - 18 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.festPast, now - 9 * dayMs);

  // Populate Registrations & Check-ins for all Past Events
  // Upward trend: ACM1 (24), ACM2 (32), ACM3 (42), ACM4 (54), Robotics1 (35), Robotics2 (40), Math1 (28), Math2 (36), Standalone (30), Fest (50)
  const pastConfig = [
    { id: eventIds.acm1, count: 24, checkRate: 0.70, owner: 'student1@demo.edu', startMs: now - 38 * dayMs + 10 * hourMs },
    { id: eventIds.acm2, count: 32, checkRate: 0.75, owner: 'student2@demo.edu', startMs: now - 28 * dayMs + 9 * hourMs },
    { id: eventIds.acm3, count: 42, checkRate: 0.80, owner: 'student3@demo.edu', startMs: now - 18 * dayMs + 10 * hourMs },
    { id: eventIds.acm4, count: 54, checkRate: 0.85, owner: 'student1@demo.edu', startMs: now - 7 * dayMs + 14 * hourMs },
    { id: eventIds.robotics1, count: 35, checkRate: 0.72, owner: 'student1@demo.edu', startMs: now - 22 * dayMs + 10 * hourMs },
    { id: eventIds.robotics2, count: 40, checkRate: 0.78, owner: 'student1@demo.edu', startMs: now - 12 * dayMs + 14 * hourMs },
    { id: eventIds.math1, count: 28, checkRate: 0.71, owner: 'faculty2@demo.edu', startMs: now - 25 * dayMs + 10 * hourMs },
    { id: eventIds.math2, count: 36, checkRate: 0.78, owner: 'faculty2@demo.edu', startMs: now - 15 * dayMs + 14 * hourMs },
    { id: eventIds.standalonePast, count: 30, checkRate: 0.80, owner: 'faculty1@demo.edu', startMs: now - 19 * dayMs + 10 * hourMs },
    { id: eventIds.festPast, count: 50, checkRate: 0.84, owner: 'student1@demo.edu', startMs: now - 9 * dayMs + 16 * hourMs, waitlist: 4 },
  ];

  const studentPool = ALL_ACCOUNTS.filter((a) => a.role === 'student');

  // Track checked in students per event to safely attach reviews
  const checkedInStudentsByEvent: Record<string, string[]> = {};

  for (const cfg of pastConfig) {
    checkedInStudentsByEvent[cfg.id] = [];
    // Filter out the owner of the event
    const eligibleStudents = studentPool.filter((s) => s.email.toLowerCase() !== cfg.owner.toLowerCase());
    const attendees = eligibleStudents.slice(0, cfg.count);

    const checkedCount = Math.round(attendees.length * cfg.checkRate);

    for (let i = 0; i < attendees.length; i++) {
      const student = attendees[i];
      const isCheckedIn = i < checkedCount;
      const checkedInTime = isCheckedIn ? new Date(cfg.startMs + (i % 25) * 60000).toISOString() : null;

      if (isCheckedIn) {
        checkedInStudentsByEvent[cfg.id].push(student.email);
      }

      registrationsBatch.push({
        event_id: cfg.id,
        student_email: student.email,
        roll_no: student.roll_no,
        status: 'confirmed',
        registered_at: new Date(cfg.startMs - 5 * dayMs + i * 3600000).toISOString(),
        checked_in_at: checkedInTime,
        checked_in_by: isCheckedIn ? cfg.owner : null,
      });
    }

    // Add waitlisted rows if configured
    if (cfg.waitlist) {
      const waitlistCandidates = eligibleStudents.slice(cfg.count, cfg.count + cfg.waitlist);
      for (let j = 0; j < waitlistCandidates.length; j++) {
        const wl = waitlistCandidates[j];
        registrationsBatch.push({
          event_id: cfg.id,
          student_email: wl.email,
          roll_no: wl.roll_no,
          status: 'waitlisted',
          registered_at: new Date(cfg.startMs - 2 * dayMs + j * 1800000).toISOString(),
          waitlisted_at: new Date(cfg.startMs - 2 * dayMs + j * 1800000).toISOString(),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // REVIEWS GENERATION on 5 distinct past events (checked-in students ONLY)
  // -------------------------------------------------------------------------
  console.log('5. Generating detailed reviews from verified checked-in students...');

  const reviewEvents = [
    {
      eventId: eventIds.acm4,
      reviews: [
        { rating: 5, comment: 'Phenomenal keynote by the visiting scientist! The live debugging session was hands-down the best part.' },
        { rating: 4, comment: 'Great challenge set in the coding championship. The hall was slightly crowded but organization was spotless.' },
        { rating: 5, comment: 'Very well structured! Loved the networking lunch and the problem explanations afterwards.' },
        { rating: 4, comment: 'Super engaging speakers and great prizes. Would definitely attend again next year!' },
        { rating: 3, comment: 'The mic had occasional feedback during the middle presentations, but technical content was excellent.' },
        { rating: 5, comment: 'Incredible atmosphere. The hands-on benchmark challenge was thoroughly enjoyable.' },
        { rating: 4, comment: 'Good pace and covered modern distributed algorithms very clearly.' },
        { rating: 5, comment: 'Top-notch organization by the ACM team. Everything started right on time.' },
      ],
    },
    {
      eventId: eventIds.robotics1,
      reviews: [
        { rating: 4, comment: 'The drone obstacle arena demonstration was breathtaking. Impressive PID tuning from the teams!' },
        { rating: 5, comment: 'Excellent safety netting and flight demonstrations. Learned a lot about telemetry links.' },
        { rating: 2, comment: 'The venue was far too small for the audience size, hard to see the drone flights from the back.' },
        { rating: 4, comment: 'Really cool hardware prototypes on display. Hope to see longer interactive sessions next time.' },
        { rating: 3, comment: 'Started 20 minutes late due to battery charging delays, but the flight maneuvers were worth the wait.' },
        { rating: 4, comment: 'Engaging Q&A with the student builders. Very inspirational expo.' },
        { rating: 5, comment: 'Brilliant showcase! The autonomous navigation stack demo was completely fascinating.' },
        { rating: 4, comment: 'Great energy and informative poster descriptions beside the quadcopters.' },
      ],
    },
    {
      eventId: eventIds.math1,
      reviews: [
        { rating: 5, comment: 'Dr. Krishnan delivered a masterclass on singular value decomposition. Crystal-clear proofs.' },
        { rating: 5, comment: 'The connections drawn between matrix factorization and neural embeddings were eye-opening.' },
        { rating: 4, comment: 'Excellent whiteboard derivation of randomized low-rank approximations.' },
        { rating: 3, comment: 'A bit mathematically intense for freshmen, but rewarding if you have taken linear algebra.' },
        { rating: 5, comment: 'Fantastic colloquium! The handout with theorem summaries was very thoughtful.' },
        { rating: 4, comment: 'Rigorous and elegant presentation. Looking forward to the subsequent series.' },
        { rating: 4, comment: 'Well organized session with ample time allocated for audience queries.' },
        { rating: 5, comment: 'One of the best math seminars on campus this semester. Extremely inspiring.' },
      ],
    },
    {
      eventId: eventIds.standalonePast,
      reviews: [
        { rating: 5, comment: 'Invaluable advice on responding to reviewer feedback and avoiding common editorial desk-rejects.' },
        { rating: 4, comment: 'Practical walkthrough of LaTeX bibtex management and journal impact metrics.' },
        { rating: 3, comment: 'The session ran slightly longer than scheduled (over 2 hours), but the insights were genuine.' },
        { rating: 5, comment: 'Dr. Nair shared real reviewer comments from IEEE transactions which was exceptionally useful.' },
        { rating: 4, comment: 'Clear structure, actionable tips for postgraduate thesis writing as well.' },
        { rating: 4, comment: 'Great pointers on reproducible figures and statistical hypothesis reporting.' },
        { rating: 5, comment: 'Every master and research student should attend this workshop. Top tier guidance.' },
        { rating: 4, comment: 'Very supportive atmosphere and pragmatic writing guidelines.' },
      ],
    },
    {
      eventId: eventIds.festPast,
      reviews: [
        { rating: 5, comment: 'Breathtaking fusion symphony! The violin and mridangam jugalbandi gave me literal goosebumps.' },
        { rating: 5, comment: 'Acoustics in the Main Auditorium were calibrated to perfection for this concert.' },
        { rating: 4, comment: 'Loved the lighting production and opening classical overture. Truly festive vibe.' },
        { rating: 2, comment: 'Poor signage at the entrance gates caused bottlenecking and delays in entry.' },
        { rating: 4, comment: 'Spectacular cultural performance. Great energy across the entire student crowd.' },
        { rating: 5, comment: 'Best musical night on campus this academic year! Kudos to the student organizers.' },
        { rating: 3, comment: 'A bit humid inside towards the second half, but the orchestra performance was legendary.' },
        { rating: 5, comment: 'Flawless melodies and outstanding stage presence from the student musicians.' },
      ],
    },
  ];

  for (const item of reviewEvents) {
    const verifiedCheckins = checkedInStudentsByEvent[item.eventId] || [];
    for (let r = 0; r < item.reviews.length; r++) {
      const reviewerEmail = verifiedCheckins[r % verifiedCheckins.length];
      if (reviewerEmail) {
        reviewsBatch.push({
          event_id: item.eventId,
          student_email: reviewerEmail,
          rating: item.reviews[r].rating,
          comment: item.reviews[r].comment,
          created_at: new Date(now - 6 * dayMs + r * 7200000).toISOString(),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 2: ONGOING EVENT (STARTED 20 MIN AGO, ENDS IN 2 HOURS)
  // -------------------------------------------------------------------------
  console.log('6. Generating Ongoing Event (live scanner ready)...');
  const cirHall = getHall('CIR Seminar Hall');
  eventsBatch.push({
    id: eventIds.ongoing,
    title: 'Hands-on Generative AI & Edge Devices Live Lab',
    description: 'Live interactive workshop running quantized vision-language models on edge hardware. Attendees test prompt engineering and live check-in tokens.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Coding Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Coding Club'),
    hall_id: cirHall.id,
    start_time: new Date(now - 20 * 60000).toISOString(), // 20 min ago
    end_time: new Date(now + 100 * 60000).toISOString(),  // in ~1.6 hours
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[1],
    volunteers_needed: 2,
    created_at: new Date(now - 3 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.ongoing, now - 2 * dayMs);

  // 25 confirmed registrations present, NONE scanned yet
  // Exclude owner (student1) and volunteers (student2, student3) to respect mutual exclusion
  const ongoingAttendees = studentPool
    .filter((s) => s.email !== 'student1@demo.edu' && s.email !== 'student2@demo.edu' && s.email !== 'student3@demo.edu')
    .slice(0, 25);
  for (let k = 0; k < ongoingAttendees.length; k++) {
    const st = ongoingAttendees[k];
    registrationsBatch.push({
      event_id: eventIds.ongoing,
      student_email: st.email,
      roll_no: st.roll_no,
      status: 'confirmed',
      registered_at: new Date(now - 2 * dayMs + k * 1800000).toISOString(),
      checked_in_at: null, // NONE scanned yet for live testing
      checked_in_by: null,
    });
  }

  // Volunteers on ongoing event (student2 accepted, student3 pending)
  volunteersBatch.push(
    {
      event_id: eventIds.ongoing,
      student_email: 'student2@demo.edu',
      status: 'accepted',
      applied_at: new Date(now - 2 * dayMs).toISOString(),
      decided_at: new Date(now - 1 * dayMs).toISOString(),
      decided_by: 'student1@demo.edu',
    },
    {
      event_id: eventIds.ongoing,
      student_email: 'student3@demo.edu',
      status: 'pending',
      applied_at: new Date(now - 1 * dayMs).toISOString(),
    }
  );

  // -------------------------------------------------------------------------
  // SECTION 3: UPCOMING APPROVED EVENTS (6 OVER NEXT 3 WEEKS)
  // -------------------------------------------------------------------------
  console.log('7. Generating Upcoming Approved Events (across clubs, dept, fest, standalone)...');

  // 1. FULL with waitlist (In 2 days)
  const hallA = getHall('Academic Block 1 - Hall A'); // cap: 80
  eventsBatch.push({
    id: eventIds.upcomingFull,
    title: 'Competitive Programming Masterclass & Algorithms Boot Camp',
    description: 'High-intensity problem solving focusing on dynamic programming over trees, segment trees, and binary lifting techniques.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Coding Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Coding Club'),
    hall_id: hallA.id,
    start_time: new Date(now + 2 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now + 2 * dayMs + 13 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[2],
    volunteers_needed: 2,
    created_at: new Date(now - 4 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.upcomingFull, now - 1 * dayMs);

  // Fill up to capacity (e.g. 50 confirmed) + 6 waitlisted
  const fullCandidates = studentPool.filter((s) => s.email !== 'student1@demo.edu');
  for (let f = 0; f < 50; f++) {
    const st = fullCandidates[f];
    if (st) {
      registrationsBatch.push({
        event_id: eventIds.upcomingFull,
        student_email: st.email,
        roll_no: st.roll_no,
        status: 'confirmed',
        registered_at: new Date(now - 2 * dayMs + f * 900000).toISOString(),
      });
    }
  }
  for (let w = 50; w < 56; w++) {
    const st = fullCandidates[w];
    if (st) {
      registrationsBatch.push({
        event_id: eventIds.upcomingFull,
        student_email: st.email,
        roll_no: st.roll_no,
        status: 'waitlisted',
        registered_at: new Date(now - 1 * dayMs + (w - 50) * 1200000).toISOString(),
        waitlisted_at: new Date(now - 1 * dayMs + (w - 50) * 1200000).toISOString(),
      });
    }
  }

  // 2. Needs Volunteers (In 5 days, Sem Hall 2, 14:00-17:00)
  eventsBatch.push({
    id: eventIds.upcomingVolunteers,
    title: 'Web3 & Decentralized Applications Hackathon',
    description: 'Build EVM smart contracts, decentralized identity resolvers, and decentralized storage frontends in this 24-hour hackathon.',
    organizer_email: 'student2@demo.edu',
    club_or_dept: 'Coding Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Coding Club'),
    hall_id: sem2Hall.id,
    start_time: new Date(now + 5 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now + 5 * dayMs + 17 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[3],
    volunteers_needed: 3,
    created_at: new Date(now - 3 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.upcomingVolunteers, now - 1 * dayMs);

  // 1 accepted, 1 pending, 1 rejected volunteer
  volunteersBatch.push(
    {
      event_id: eventIds.upcomingVolunteers,
      student_email: 'student3@demo.edu',
      status: 'accepted',
      applied_at: new Date(now - 2 * dayMs).toISOString(),
      decided_at: new Date(now - 1 * dayMs).toISOString(),
      decided_by: 'student2@demo.edu',
    },
    {
      event_id: eventIds.upcomingVolunteers,
      student_email: 'student4@demo.edu',
      status: 'pending',
      applied_at: new Date(now - 1 * dayMs).toISOString(),
    },
    {
      event_id: eventIds.upcomingVolunteers,
      student_email: 'student5@demo.edu',
      status: 'rejected',
      applied_at: new Date(now - 2 * dayMs).toISOString(),
      decided_at: new Date(now - 1 * dayMs).toISOString(),
      decided_by: 'student2@demo.edu',
    }
  );

  // 3. Department Event (In 8 days, Data Science & AI, Sem Hall 1)
  eventsBatch.push({
    id: eventIds.upcomingDept,
    title: 'Data Science & AI Industry Connect: Predictive Modeling in FinTech',
    description: 'Distinguished lecture on real-time fraud detection pipelines, credit scoring under uncertainty, and graph analytics in digital banking.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Data Science & AI',
    organizer_type: 'department',
    organization_id: orgMap.get('Data Science & AI'),
    hall_id: sem1Hall.id,
    start_time: new Date(now + 8 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now + 8 * dayMs + 12.5 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[4],
    volunteers_needed: 2,
    created_at: new Date(now - 2 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.upcomingDept, now - 1 * dayMs);

  // 4. Fest Event (Anokha Finale - In 11 days, Main Audi)
  eventsBatch.push({
    id: eventIds.upcomingFest,
    title: 'Anokha 2026: National Collegiate HackSprint Finale',
    description: 'Grand final judging rounds of the flagship national tech fest, featuring pitch presentations before leading venture founders and tech executives.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Anokha Festival Team',
    organizer_type: 'standalone',
    organization_id: null,
    hall_id: audiHall.id,
    start_time: new Date(now + 11 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now + 11 * dayMs + 19 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    fest_id: anokhaId,
    poster_url: POSTERS[5],
    volunteers_needed: 5,
    created_at: new Date(now - 2 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.upcomingFest, now - 1 * dayMs);

  // 5. Standalone with External Registration Link (In 14 days)
  const biotechHall = getHall('Biotechnology Seminar Hall');
  eventsBatch.push({
    id: eventIds.upcomingExtLink,
    title: 'Global Career Pathways: Tech Opportunities in Europe & North America',
    description: 'Comprehensive seminar providing insights into university exchange programs, international tech hiring, and scholarship opportunities.',
    organizer_email: 'faculty1@demo.edu',
    club_or_dept: null,
    organizer_type: 'standalone',
    organization_id: null,
    hall_id: biotechHall.id,
    start_time: new Date(now + 14 * dayMs + 11 * hourMs).toISOString(),
    end_time: new Date(now + 14 * dayMs + 13 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    registration_link: 'https://forms.gle/demo-campus-pathways-2026',
    poster_url: null, // No poster
    volunteers_needed: 0,
    created_at: new Date(now - 1 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.upcomingExtLink, now - 12 * hourMs);

  // 6. Cultural Club Event (In 17 days, Amriteswari Hall)
  const amritaHall = getHall('Amriteswari Hall');
  eventsBatch.push({
    id: eventIds.upcomingCultural,
    title: 'Heritage Rhythms: Classical Music & Carnatic Ensemble Workshop',
    description: 'Workshop on vocal improvisation, talas, and instrumental accompaniments led by renowned visiting classical exponents.',
    organizer_email: 'student2@demo.edu',
    club_or_dept: 'Spic Macay & Cultural Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Spic Macay & Cultural Club'),
    hall_id: amritaHall.id,
    start_time: new Date(now + 17 * dayMs + 16 * hourMs).toISOString(),
    end_time: new Date(now + 17 * dayMs + 19 * hourMs).toISOString(),
    status: 'approved',
    approval_stage: 'cd',
    poster_url: POSTERS[6],
    volunteers_needed: 2,
    created_at: new Date(now - 1 * dayMs).toISOString(),
  });
  addFullApprovalHistory(eventIds.upcomingCultural, now - 6 * hourMs);

  // Add sample registrations for upcoming events (strictly excluding event organizers)
  for (const upId of [eventIds.upcomingDept, eventIds.upcomingFest, eventIds.upcomingExtLink, eventIds.upcomingCultural]) {
    const evObj = eventsBatch.find((e) => e.id === upId);
    const attendees = studentPool
      .filter((s) => s.email !== evObj?.organizer_email)
      .slice(0, 15);

    for (const st of attendees) {
      registrationsBatch.push({
        event_id: upId,
        student_email: st.email,
        roll_no: st.roll_no,
        status: 'confirmed',
        registered_at: new Date(now - 12 * hourMs).toISOString(),
      });
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 4: IN THE APPROVAL PIPELINE (QUEUE FOR EACH APPROVER)
  // -------------------------------------------------------------------------
  console.log('8. Generating Pipeline Events (queues for student_affairs, event_office, cd, rejected, drafts)...');

  // 1. Submitted at student_affairs (In 6 days, CIR Seminar Hall)
  eventsBatch.push({
    id: eventIds.pipeAffairs,
    title: 'Intro to Rust Systems Programming & Memory Safety',
    description: 'Hands-on look at ownership models, borrow checking, and writing memory-safe concurrency primitives without a garbage collector.',
    organizer_email: 'student3@demo.edu',
    club_or_dept: 'Coding Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Coding Club'),
    hall_id: cirHall.id,
    start_time: new Date(now + 6 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now + 6 * dayMs + 17 * hourMs).toISOString(),
    status: 'submitted',
    approval_stage: 'student_affairs',
    poster_url: POSTERS[0],
    volunteers_needed: 2,
    created_at: new Date(now - 6 * hourMs).toISOString(),
  });

  // 2. Submitted at event_office (In 9 days, ECE Seminar Hall)
  const eceHall = getHall('ECE Seminar Hall');
  eventsBatch.push({
    id: eventIds.pipeEventOffice,
    title: 'Cybersecurity Red Team Capture The Flag (CTF)',
    description: '24-hour offensive cybersecurity contest spanning reverse engineering, binary exploitation, and web application pen-testing challenges.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Coding Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Coding Club'),
    hall_id: eceHall.id,
    start_time: new Date(now + 9 * dayMs + 9 * hourMs).toISOString(),
    end_time: new Date(now + 9 * dayMs + 17 * hourMs).toISOString(),
    status: 'submitted',
    approval_stage: 'event_office',
    poster_url: POSTERS[1],
    volunteers_needed: 3,
    created_at: new Date(now - 12 * hourMs).toISOString(),
  });
  approvalsBatch.push({
    id: `${eventIds.pipeEventOffice.slice(0, 24)}111111111111`,
    event_id: eventIds.pipeEventOffice,
    stage: 'student_affairs',
    approver_email: 'affairs@demo.edu',
    decision: 'approved',
    reason: 'Approved by Student Affairs. Handed over to Event Office for venue clearance.',
    created_at: new Date(now - 4 * hourMs).toISOString(),
  });

  // 3. Submitted at cd (Holds hall!) (In 13 days, Mech Seminar Hall)
  eventsBatch.push({
    id: eventIds.pipeCd,
    title: 'International Symposium on Green Energy & IoT Sensors',
    description: 'Joint conference focusing on low-power sensor networks, energy harvesting architectures, and grid monitoring systems.',
    organizer_email: 'faculty2@demo.edu',
    club_or_dept: 'Department of Mathematics',
    organizer_type: 'department',
    organization_id: orgMap.get('Department of Mathematics'),
    hall_id: mechHall.id,
    start_time: new Date(now + 13 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now + 13 * dayMs + 16 * hourMs).toISOString(),
    status: 'submitted',
    approval_stage: 'cd',
    poster_url: POSTERS[2],
    volunteers_needed: 2,
    created_at: new Date(now - 1 * dayMs).toISOString(),
  });
  approvalsBatch.push(
    {
      id: `${eventIds.pipeCd.slice(0, 24)}111111111111`,
      event_id: eventIds.pipeCd,
      stage: 'student_affairs',
      approver_email: 'affairs@demo.edu',
      decision: 'approved',
      reason: 'Endorsed by Student Affairs.',
      created_at: new Date(now - 18 * hourMs).toISOString(),
    },
    {
      id: `${eventIds.pipeCd.slice(0, 24)}222222222222`,
      event_id: eventIds.pipeCd,
      stage: 'event_office',
      approver_email: 'eventoffice@demo.edu',
      decision: 'approved',
      reason: 'Mechanical Seminar Hall is clear and booked for this event. Passed to Campus Director.',
      created_at: new Date(now - 6 * hourMs).toISOString(),
    }
  );

  // 4. Rejected Event (In 7 days, Sem Hall 1)
  eventsBatch.push({
    id: eventIds.pipeRejected,
    title: 'High Voltage Drone Combat & Pyro Arena',
    description: 'Indoor demonstration of pyrotechnic sparks and high-speed collision drone combat.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Robotics & Automation Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Robotics & Automation Club'),
    hall_id: sem1Hall.id,
    start_time: new Date(now + 7 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now + 7 * dayMs + 17 * hourMs).toISOString(),
    status: 'rejected',
    approval_stage: 'student_affairs',
    rejection_reason: 'Safety hazard: pyrotechnics and combat drones are strictly prohibited indoors without environmental safety clearance.',
    poster_url: POSTERS[3],
    volunteers_needed: 2,
    created_at: new Date(now - 2 * dayMs).toISOString(),
  });
  approvalsBatch.push({
    id: `${eventIds.pipeRejected.slice(0, 24)}111111111111`,
    event_id: eventIds.pipeRejected,
    stage: 'student_affairs',
    approver_email: 'affairs@demo.edu',
    decision: 'rejected',
    reason: 'Safety hazard: pyrotechnics and combat drones are strictly prohibited indoors without environmental safety clearance.',
    created_at: new Date(now - 1 * dayMs).toISOString(),
  });

  // 5. Draft 1 owned by student1 (In 16 days)
  eventsBatch.push({
    id: eventIds.pipeDraft1,
    title: 'Mobile App Development with Flutter: Zero to Hero',
    description: 'Draft proposal for weekend cross-platform app design boot camp using Dart, Bloc state management, and Firebase backends.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Coding Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Coding Club'),
    hall_id: hallA.id,
    start_time: new Date(now + 16 * dayMs + 10 * hourMs).toISOString(),
    end_time: new Date(now + 16 * dayMs + 13 * hourMs).toISOString(),
    status: 'draft',
    approval_stage: 'student_affairs',
    poster_url: null, // Draft has no poster
    volunteers_needed: 1,
    created_at: new Date(now - 5 * hourMs).toISOString(),
  });

  // 6. Draft 2 owned by student1 (In 20 days)
  eventsBatch.push({
    id: eventIds.pipeDraft2,
    title: 'Introduction to Quantum Computing Algorithms',
    description: 'Draft outline exploring qubits, superposition gates, and Shor factorization circuit simulations in Python Qiskit.',
    organizer_email: 'student1@demo.edu',
    club_or_dept: 'Coding Club',
    organizer_type: 'club',
    organization_id: orgMap.get('Coding Club'),
    hall_id: biotechHall.id,
    start_time: new Date(now + 20 * dayMs + 14 * hourMs).toISOString(),
    end_time: new Date(now + 20 * dayMs + 17 * hourMs).toISOString(),
    status: 'draft',
    approval_stage: 'student_affairs',
    poster_url: null, // Draft has no poster
    volunteers_needed: 0,
    created_at: new Date(now - 2 * hourMs).toISOString(),
  });

  // -------------------------------------------------------------------------
  // INSERTION VIA ADMIN SEED BATCH OR DIRECT FALLBACK
  // -------------------------------------------------------------------------
  console.log('\n9. Inserting events and related records...');
  console.log(`   - Events to insert        : ${eventsBatch.length}`);
  console.log(`   - Approvals to insert     : ${approvalsBatch.length}`);
  console.log(`   - Registrations to insert : ${registrationsBatch.length}`);
  console.log(`   - Volunteers to insert    : ${volunteersBatch.length}`);
  console.log(`   - Reviews to insert       : ${reviewsBatch.length}`);

  // Try admin_seed_batch RPC first
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_seed_batch', {
    p_events: eventsBatch,
    p_approvals: approvalsBatch,
    p_registrations: registrationsBatch,
    p_volunteers: volunteersBatch,
    p_reviews: reviewsBatch,
  });

  if (!rpcErr) {
    console.log('   ✓ Successfully seeded via admin_seed_batch RPC:', rpcRes);
  } else {
    console.log(`   ⚠ admin_seed_batch RPC unavailable (${rpcErr.message}). Executing direct service role seed sequence...`);

    // Step A: Insert events with initial safe window for past events so registration triggers pass
    for (let idx = 0; idx < eventsBatch.length; idx++) {
      const ev = eventsBatch[idx];
      const isPast = new Date(ev.end_time).getTime() < now;
      const evPayload = {
        ...ev,
        // For past events, assign non-overlapping future placeholder windows during registration insertion
        start_time: isPast ? new Date(now + (200 + idx) * dayMs).toISOString() : ev.start_time,
        end_time: isPast ? new Date(now + (200 + idx) * dayMs + 3 * hourMs).toISOString() : ev.end_time,
        status: isPast ? 'approved' : ev.status,
      };
      const { error: evErr } = await supabase.from('events').upsert(evPayload, { onConflict: 'id' });
      if (evErr) {
        console.error(`   ❌ Failed to insert event "${ev.title}":`, evErr.message);
      }
    }

    // Step B: Upsert approvals
    for (const app of approvalsBatch) {
      const { error: appErr } = await supabase.from('event_approvals').upsert(app, { onConflict: 'id' });
      if (appErr) {
        console.error(`   ❌ Failed to upsert approval for ${app.event_id}:`, appErr.message);
      }
    }

    // Step C: Upsert registrations in batches
    for (let i = 0; i < registrationsBatch.length; i += 50) {
      const chunk = registrationsBatch.slice(i, i + 50);
      const { error: regErr } = await supabase.from('registrations').upsert(chunk, { onConflict: 'event_id,student_email' });
      if (regErr) {
        console.error('   ❌ Failed to upsert registrations chunk:', regErr.message);
      }
    }

    // Step D: Update checked_in_at on attendees
    const checkedInList = registrationsBatch.filter((r) => r.checked_in_at);
    for (const reg of checkedInList) {
      await supabase
        .from('registrations')
        .update({
          checked_in_at: reg.checked_in_at,
          checked_in_by: reg.checked_in_by,
        })
        .match({ event_id: reg.event_id, student_email: reg.student_email });
    }

    // Step E: Upsert volunteers
    for (const vol of volunteersBatch) {
      const { error: volErr } = await supabase.from('volunteers').upsert(vol, { onConflict: 'event_id,student_email' });
      if (volErr) {
        console.error(`   ❌ Failed to upsert volunteer for ${vol.event_id}:`, volErr.message);
      }
    }

    // Step F: Upsert reviews
    for (const rev of reviewsBatch) {
      const { error: revErr } = await supabase.from('reviews').upsert(rev, { onConflict: 'event_id,student_email' });
      if (revErr) {
        console.error(`   ❌ Failed to upsert review for ${rev.event_id}:`, revErr.message);
      }
    }

    // Step G: Restore events to their real historical dates, statuses, approval stages, and rejection reasons
    for (const ev of eventsBatch) {
      const { error: restoreErr } = await supabase
        .from('events')
        .update({
          start_time: ev.start_time,
          end_time: ev.end_time,
          status: ev.status,
          approval_stage: ev.approval_stage,
          rejection_reason: ev.rejection_reason,
        })
        .eq('id', ev.id);
      if (restoreErr) {
        console.error(`   ❌ Failed to restore event "${ev.title}":`, restoreErr.message);
      }
    }
  }

  // Ensure AI cache tables are empty (un-generated as requested)
  await supabase.from('event_ai_summaries').delete().neq('event_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('organization_ai_advice').delete().neq('organization_id', '00000000-0000-0000-0000-000000000000');

  // -------------------------------------------------------------------------
  // SECTION 5: SANITY CHECKS & SUMMARY TABLE
  // -------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('RUNNING SYSTEM SANITY CHECKS');
  console.log('====================================================\n');

  let failedChecks = 0;

  // Check 1: No registration by event owner
  const { data: ownerRegs } = await supabase
    .from('registrations')
    .select('id, student_email, event_id, events(title, organizer_email)');

  const invalidOwnerRegs = (ownerRegs || []).filter(
    (r: any) => r.events && r.student_email.toLowerCase().trim() === r.events.organizer_email.toLowerCase().trim()
  );

  if (invalidOwnerRegs.length === 0) {
    console.log('✓ Check 1 PASS: Zero registrations by event owners.');
  } else {
    console.error(`❌ Check 1 FAIL: Found ${invalidOwnerRegs.length} invalid host registrations:`, invalidOwnerRegs);
    failedChecks++;
  }

  // Check 2: Every review author was checked in
  const { data: allReviews } = await supabase.from('reviews').select('id, event_id, student_email, rating');
  const { data: allRegs } = await supabase.from('registrations').select('event_id, student_email, checked_in_at');

  const checkedInSet = new Set(
    (allRegs || [])
      .filter((r) => r.checked_in_at !== null)
      .map((r) => `${r.event_id}-${r.student_email.toLowerCase().trim()}`)
  );

  let unverifiedReviewers = 0;
  for (const rw of allReviews || []) {
    const key = `${rw.event_id}-${rw.student_email.toLowerCase().trim()}`;
    if (!checkedInSet.has(key)) {
      unverifiedReviewers++;
    }
  }

  if (unverifiedReviewers === 0) {
    console.log(`✓ Check 2 PASS: All ${allReviews?.length} reviews are authored exclusively by checked-in attendees.`);
  } else {
    console.error(`❌ Check 2 FAIL: Found ${unverifiedReviewers} reviews from non-checked-in users.`);
    failedChecks++;
  }

  // Check 3: Capacity respected
  const { data: countCheck } = await supabase
    .from('events')
    .select('id, title, hall_id, halls:halls!events_hall_id_fkey(name, capacity)');

  let capacityViolations = 0;
  for (const ev of countCheck || []) {
    const cap = (ev as any).halls?.capacity;
    if (cap) {
      const { count } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', ev.id)
        .eq('status', 'confirmed');

      if ((count || 0) > cap) {
        console.error(`Capacity exceeded for "${ev.title}": ${count} confirmed > ${cap} capacity.`);
        capacityViolations++;
      }
    }
  }

  if (capacityViolations === 0) {
    console.log('✓ Check 3 PASS: All event confirmed registrations respect venue capacity.');
  } else {
    console.error(`❌ Check 3 FAIL: Found ${capacityViolations} capacity violations.`);
    failedChecks++;
  }

  // Check 4: No overlapping approved/locked events per hall
  const { data: lockedEvents } = await supabase
    .from('events')
    .select('id, title, hall_id, start_time, end_time, status, approval_stage, halls:halls!events_hall_id_fkey(name)')
    .or("status.eq.approved,and(status.eq.submitted,approval_stage.eq.cd)");

  let overlapViolations = 0;
  const list = lockedEvents || [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const e1 = list[i];
      const e2 = list[j];
      if (e1.hall_id === e2.hall_id) {
        const s1 = new Date(e1.start_time).getTime();
        const end1 = new Date(e1.end_time).getTime();
        const s2 = new Date(e2.start_time).getTime();
        const end2 = new Date(e2.end_time).getTime();

        if (s1 < end2 && s2 < end1) {
          console.error(`Hall clash detected on ${(e1 as any).halls?.name}: "${e1.title}" vs "${e2.title}"`);
          overlapViolations++;
        }
      }
    }
  }

  if (overlapViolations === 0) {
    console.log('✓ Check 4 PASS: Zero hall overlaps among approved and locked events.');
  } else {
    console.error(`❌ Check 4 FAIL: Found ${overlapViolations} hall overlap violations.`);
    failedChecks++;
  }

  // Check 5: AI tables are unpopulated
  const { count: aiSummaryCount } = await supabase.from('event_ai_summaries').select('*', { count: 'exact', head: true });
  const { count: aiAdviceCount } = await supabase.from('organization_ai_advice').select('*', { count: 'exact', head: true });
  if ((aiSummaryCount || 0) === 0 && (aiAdviceCount || 0) === 0) {
    console.log('✓ Check 5 PASS: AI summary tables are empty (un-generated as requested).');
  } else {
    console.error(`❌ Check 5 FAIL: AI summary tables contain data.`);
    failedChecks++;
  }

  // -------------------------------------------------------------------------
  // PRINT SUMMARY TABLE
  // -------------------------------------------------------------------------
  console.log('\n=============================================================================================================');
  console.log('SEEDED EVENTS SUMMARY TABLE');
  console.log('=============================================================================================================');

  const { data: finalEvents } = await supabase
    .from('events')
    .select(`
      id,
      title,
      status,
      approval_stage,
      start_time,
      end_time,
      halls:halls!events_hall_id_fkey(name)
    `)
    .order('start_time', { ascending: true });

  const summaryRows = [];
  for (const ev of finalEvents || []) {
    const { count: regCount } = await supabase.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', ev.id);
    const { count: checkCount } = await supabase.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).not('checked_in_at', 'is', null);
    const { count: revCount } = await supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('event_id', ev.id);

    const s = new Date(ev.start_time);
    const timeStr = `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

    summaryRows.push({
      Title: ev.title.length > 36 ? ev.title.substring(0, 33) + '...' : ev.title,
      'Status / Stage': `${ev.status} (${ev.approval_stage})`,
      Hall: (ev as any).halls?.name || 'N/A',
      Date: timeStr,
      Regs: regCount || 0,
      Checked: checkCount || 0,
      Reviews: revCount || 0,
    });
  }

  console.table(summaryRows);
  console.log('=============================================================================================================\n');

  if (failedChecks > 0) {
    console.error(`💥 SEED FAILED: ${failedChecks} sanity check(s) failed.`);
    process.exit(1);
  } else {
    console.log('🎉 ALL SANITY CHECKS PASSED. Database is fully populated with rich demo data for every role.');
  }
}

seed().catch((err) => {
  console.error('Fatal error during demo seed:', err);
  process.exit(1);
});
