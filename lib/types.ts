export type UserRole =
  | 'student'
  | 'faculty'
  | 'student_affairs'
  | 'event_office'
  | 'cd'
  | 'club'
  | 'department'
  | 'affairs';

export type EventStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export type ApprovalStage = 'student_affairs' | 'event_office' | 'cd';

export type ApprovalDecision = 'approved' | 'rejected' | 'venue_changed';

export interface EventApproval {
  id: string;
  event_id: string;
  stage: ApprovalStage;
  approver_email: string;
  decision: ApprovalDecision;
  reason: string | null;
  created_at: string;
}

export interface Fest {
  id: string;
  name: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
}

export interface AllowedUser {
  email: string;
  role: UserRole;
  name: string | null;
  club_name: string | null;
  department: string | null;
  roll_no: string | null;
  created_at?: string;
}

export interface Hall {
  id: string;
  name: string;
  capacity: number;
  location: string | null;
  location_id?: string | null;
  created_at?: string;
}

export interface CampusLocation {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  lat: number;
  lng: number;
  accuracy: 'verified' | 'approximate';
  source_notes?: string;
}

export interface PublicHallBooking {
  event_id?: string;
  hall_id: string;
  hall_name: string;
  title: string;
  start_time: string;
  end_time: string;
  status: 'booked' | 'pending' | 'submitted' | 'approved';
  approval_stage?: ApprovalStage;
}

export interface Organization {
  id: string;
  name: string;
  type: 'club' | 'department';
  faculty_coordinator?: string | null;
  created_at?: string;
}

export interface OrganizationMember {
  organization_id: string;
  email: string;
  member_role: 'lead' | 'member';
  added_by?: string | null;
  created_at?: string;
  allowed_users?: AllowedUser | null;
}

export interface CourseCodeDepartment {
  course_code: string;
  organization_id: string;
  created_at?: string;
  organizations?: Organization | null;
}

export interface OrganizationAIAdvice {
  organization_id: string;
  advice: OrganizerPlanningAdvice;
  generated_at: string;
}

export type OrganizerType = 'standalone' | 'club' | 'department';

export interface CampusEvent {
  id: string;
  title: string;
  description: string | null;
  organizer_email: string;
  club_or_dept: string | null;
  organizer_type?: OrganizerType;
  organization_id?: string | null;
  organizations?: Organization | null;
  hall_id: string;
  requested_hall_id?: string | null;
  start_time: string;
  end_time: string;
  status: EventStatus;
  approval_stage?: ApprovalStage;
  rejection_reason: string | null;
  registration_link: string | null;
  poster_url: string | null;
  fest_id: string | null;
  volunteers_needed?: number;
  created_at: string;
  updated_at: string;
  halls?: Hall | null;
  requested_hall?: Hall | null;
  fests?: Fest | null;
  registrations_count?: number;
  waitlist_count?: number;
  approvals?: EventApproval[];
}

export interface Registration {
  id: string;
  event_id: string;
  student_email: string;
  roll_no: string | null;
  qr_token: string;
  status: 'confirmed' | 'waitlisted';
  waitlisted_at: string | null;
  registered_at: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  events?: CampusEvent;
}

export type VolunteerStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface Volunteer {
  id: string;
  event_id: string;
  student_email: string;
  status: VolunteerStatus;
  applied_at: string;
  decided_at?: string | null;
  decided_by?: string | null;
  student_name?: string;
  roll_no?: string;
  events?: CampusEvent;
}

export interface ScanCheckinResult {
  status: 'ok' | 'already_scanned' | 'invalid' | 'outside_window';
  message?: string;
  roll_no?: string | null;
  student_name?: string;
  student_email?: string;
  event_title?: string;
  checked_in_at?: string;
}

export interface Review {
  id: string;
  event_id: string;
  student_email?: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface EventAISummaryData {
  themes: string[];
  what_worked: string[];
  what_to_improve: string[];
  suggestions: string[];
}

export interface EventAISummary {
  event_id: string;
  summary: EventAISummaryData;
  review_count: number;
  generated_at: string;
}

export interface OrganizerPlanningAdvice {
  executive_summary: string;
  turnout_and_overbooking_recommendations: string;
  preferred_timing_and_venue_insights: string;
  actionable_improvements: string[];
}

export interface OrganizerAIInsights {
  organizer_email: string;
  summary: OrganizerPlanningAdvice;
  event_count: number;
  generated_at: string;
}
