export type UserRole = 'student' | 'club' | 'department' | 'affairs';

export type EventStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

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
  created_at?: string;
}

export interface PublicHallBooking {
  hall_id: string;
  hall_name: string;
  title: string;
  start_time: string;
  end_time: string;
  status: 'submitted' | 'approved';
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string | null;
  organizer_email: string;
  club_or_dept: string | null;
  hall_id: string;
  start_time: string;
  end_time: string;
  status: EventStatus;
  rejection_reason: string | null;
  registration_link: string | null;
  poster_url: string | null;
  fest_id: string | null;
  volunteers_needed?: number;
  created_at: string;
  updated_at: string;
  halls?: Hall | null;
  fests?: Fest | null;
  registrations_count?: number;
  waitlist_count?: number;
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

export type VolunteerStatus = 'pending' | 'accepted' | 'rejected';

export interface Volunteer {
  id: string;
  event_id: string;
  student_email: string;
  status: VolunteerStatus;
  applied_at: string;
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
