import Link from 'next/link';
import {
  Calendar,
  Shield,
  Lock,
  GraduationCap,
  ArrowRight,
  Clock,
  Layers,
  Sparkles,
  Building2,
  CheckCircle2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-[#FAF0F0]/60 via-[#FFFAF5] to-[#FFFAF5]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#EADFD6] bg-[#FFFFFF] px-4 py-1.5 text-xs font-bold text-[#8E1A22] shadow-xs">
            <span className="flex h-2 w-2 rounded-full bg-[#15803D] animate-pulse"></span>
            Campus Events Platform &amp; Governance
          </div>

          <div className="space-y-4">
            <h1 className="mx-auto max-w-4xl font-serif text-4xl sm:text-6xl font-extrabold tracking-tight text-[#2B1B17] leading-tight">
              Intelligent Venue Allocation &amp; Event Governance
            </h1>

            <p className="mx-auto max-w-2xl text-base sm:text-lg text-[#7A6A62]">
              High-integrity campus platform powered by Postgres exclusion constraints,
              strict role-based access control (RLS), and zero-clash hall allocation.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/events"
              className="inline-flex items-center gap-2 rounded-xl bg-[#B3202A] px-6 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-[#8E1A22] transition-all hover:scale-[1.02]"
            >
              <Calendar className="h-4 w-4" />
              Explore Campus Events
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/halls"
              className="inline-flex items-center gap-2 rounded-xl border border-[#EADFD6] bg-[#FFFFFF] px-6 py-3.5 text-sm font-bold text-[#2B1B17] shadow-xs hover:border-[#B3202A] hover:text-[#B3202A] hover:bg-[#FAF0F0]/50 transition-all"
            >
              <Building2 className="h-4 w-4 text-[#B3202A]" />
              Hall Availability
            </Link>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-[#EADFD6] bg-[#FAF5F0] px-6 py-3.5 text-sm font-bold text-[#7A6A62] shadow-xs hover:text-[#2B1B17] hover:bg-[#FFFFFF] transition-all"
            >
              <Lock className="h-4 w-4" />
              Sign In (Demo Logins)
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="border-t border-[#EADFD6] bg-[#FFFFFF] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#2B1B17]">
              Platform Architecture &amp; Foundations
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-[#7A6A62]">
              Core database rules, security definers, and real-time visibility
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="rounded-2xl border border-[#EADFD6] border-t-2 border-t-[#C9A24B] bg-[#FFFAF5] p-6 shadow-xs">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#B45309] mb-4">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                DB-Level Clash Blocking
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#7A6A62]">
                PostgreSQL <code className="text-xs bg-[#EADFD6]/60 px-1 py-0.5 rounded font-mono text-[#2B1B17]">btree_gist</code> exclusion constraints prevent double-booking for overlapping time ranges on approved events at transaction level. First approved wins.
              </p>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl border border-[#EADFD6] border-t-2 border-t-[#C9A24B] bg-[#FFFAF5] p-6 shadow-xs">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#7F1D1D] mb-4">
                <Shield className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                Role State Governance
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#7A6A62]">
                BEFORE UPDATE database triggers enforce that only Student Affairs can approve/reject events. Modifying approved event time or venue automatically rolls back to submitted for re-approval.
              </p>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-[#EADFD6] border-t-2 border-t-[#C9A24B] bg-[#FFFAF5] p-6 shadow-xs">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FAF0F0] text-[#8E1A22] mb-4">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                Row-Level Security &amp; View
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#7A6A62]">
                Organizers only manage own submissions, affairs audits non-draft proposals, and <code className="text-xs bg-[#EADFD6]/60 px-1 py-0.5 rounded font-mono text-[#2B1B17]">public_hall_bookings</code> gives public schedule visibility without exposing private emails.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Seeded Roles Quick Reference */}
      <section className="py-12 bg-[#FFFAF5]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#EADFD6] bg-[#FFFFFF] p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EADFD6] pb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#2B1B17]">
                  Pre-configured Test Accounts
                </h3>
                <p className="text-xs text-[#7A6A62]">
                  Available in <code className="font-mono text-[#B3202A]">scripts/seed.ts</code> with password: <span className="font-bold text-[#2B1B17]">demo1234</span>
                </p>
              </div>
              <Link
                href="/login"
                className="text-xs font-bold text-[#B3202A] hover:text-[#8E1A22] flex items-center gap-1 transition-colors"
              >
                Go to Sign In &rarr;
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="rounded-xl border border-[#C9A24B]/30 bg-[#FDF8ED] p-4 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#A07C28]">
                  <GraduationCap className="h-4 w-4" /> Student
                </div>
                <div className="font-mono font-bold text-[#2B1B17]">student1@demo.edu</div>
                <div className="text-[11px] text-[#7A6A62]">Redirects to: /events</div>
              </div>

              <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7] p-4 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#B45309]">
                  <Sparkles className="h-4 w-4" /> Club (Organizer)
                </div>
                <div className="font-mono font-bold text-[#2B1B17]">codingclub@demo.edu</div>
                <div className="text-[11px] text-[#7A6A62]">Redirects to: /organizer</div>
              </div>

              <div className="rounded-xl border border-[#EADFD6] bg-[#FAF0F0] p-4 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#8E1A22]">
                  <Building2 className="h-4 w-4" /> Department
                </div>
                <div className="font-mono font-bold text-[#2B1B17]">cse@demo.edu</div>
                <div className="text-[11px] text-[#7A6A62]">Redirects to: /organizer</div>
              </div>

              <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2] p-4 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#7F1D1D]">
                  <Shield className="h-4 w-4" /> Student Welfare
                </div>
                <div className="font-mono font-bold text-[#2B1B17]">affairs@demo.edu</div>
                <div className="text-[11px] text-[#7A6A62]">Redirects to: /affairs</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
