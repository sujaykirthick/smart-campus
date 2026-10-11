import Link from 'next/link';
import {
  Calendar,
  Shield,
  Lock,
  GraduationCap,
  ArrowRight,
  Clock,
  Layers,
  Building2,
  CheckCircle2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Institutional Hero Section */}
      <section className="border-b border-neutral-200 bg-[#F5F5F5] py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-sm bg-white px-2.5 py-1 text-xs font-semibold text-[#A4161A] border border-neutral-200">
              Amrita Vishwa Vidyapeetham
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
              Campus Events &amp; Venue Management Portal
            </h1>

            <p className="max-w-3xl text-sm sm:text-base text-neutral-600 leading-relaxed">
              Official university portal for event scheduling, hall reservations, student registrations, and attendance verification.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/events"
              className="inline-flex items-center gap-2 rounded-md bg-[#A4161A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors shadow-xs"
            >
              <Calendar className="h-4 w-4" />
              Browse Events
            </Link>

            <Link
              href="/halls"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors shadow-xs"
            >
              <Building2 className="h-4 w-4 text-neutral-500" />
              Hall Availability Schedule
            </Link>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-xs"
            >
              <Lock className="h-4 w-4 text-neutral-500" />
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-lg font-bold text-neutral-900">
              System Capabilities &amp; Policies
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Automated venue scheduling, role-based workflows, and attendance tracking
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="rounded-md border border-neutral-200 bg-white p-5 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-neutral-900">
                <Clock className="h-4 w-4 text-[#A4161A]" />
                Automated Clash Prevention
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                PostgreSQL exclusion constraints prevent simultaneous approved bookings in the same hall. The first approved proposal secures the venue slot.
              </p>
            </div>

            {/* Card 2 */}
            <div className="rounded-md border border-neutral-200 bg-white p-5 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-neutral-900">
                <Shield className="h-4 w-4 text-[#A4161A]" />
                Student Welfare Approval
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Event proposals submitted by student clubs and academic departments undergo formal review and venue allocation by Student Welfare.
              </p>
            </div>

            {/* Card 3 */}
            <div className="rounded-md border border-neutral-200 bg-white p-5 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-neutral-900">
                <Layers className="h-4 w-4 text-[#A4161A]" />
                Digital QR Passes &amp; OD Export
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Registered students receive unique digital QR passes. Check-ins are scanned at the venue doors and exported directly for On-Duty (OD) approval.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Accounts List */}
      <section className="border-t border-neutral-200 bg-[#F5F5F5] py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-md border border-neutral-200 bg-white p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Pre-configured Portal Accounts
                </h3>
                <p className="text-xs text-neutral-500">
                  Password for all test accounts: <span className="font-mono font-semibold text-neutral-800">demo1234</span>
                </p>
              </div>
              <Link
                href="/login"
                className="text-xs font-semibold text-[#A4161A] hover:underline"
              >
                Sign in &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="rounded-md border border-neutral-200 bg-[#F5F5F5] p-3 space-y-1">
                <div className="font-semibold text-neutral-900">Student Account</div>
                <div className="font-mono text-neutral-700">student1@demo.edu</div>
                <div className="text-[11px] text-neutral-500">Access: /events, /my-events, /organizer</div>
              </div>

              <div className="rounded-md border border-neutral-200 bg-[#F5F5F5] p-3 space-y-1">
                <div className="font-semibold text-neutral-900">Faculty Account</div>
                <div className="font-mono text-neutral-700">faculty1@demo.edu</div>
                <div className="text-[11px] text-neutral-500">Access: /events, /organizer</div>
              </div>

              <div className="rounded-md border border-neutral-200 bg-[#F5F5F5] p-3 space-y-1">
                <div className="font-semibold text-neutral-900">Student Affairs</div>
                <div className="font-mono text-neutral-700">affairs@demo.edu</div>
                <div className="text-[11px] text-neutral-500">Access: /approvals (Stage 1)</div>
              </div>

              <div className="rounded-md border border-neutral-200 bg-[#F5F5F5] p-3 space-y-1">
                <div className="font-semibold text-neutral-900">Event Office</div>
                <div className="font-mono text-neutral-700">eventoffice@demo.edu</div>
                <div className="text-[11px] text-neutral-500">Access: /approvals (Stage 2)</div>
              </div>

              <div className="rounded-md border border-neutral-200 bg-[#F5F5F5] p-3 space-y-1">
                <div className="font-semibold text-neutral-900">Campus Director</div>
                <div className="font-mono text-neutral-700">cd@demo.edu</div>
                <div className="text-[11px] text-neutral-500">Access: /approvals (Stage 3)</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
