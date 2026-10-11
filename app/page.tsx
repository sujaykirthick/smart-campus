import Link from 'next/link';
import Image from 'next/image';
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
  Sparkles,
  Compass,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function HomePage() {
  return (
    <div className="flex flex-col space-y-12 pb-16">
      {/* Institutional Hero Section */}
      <section className="border-b border-neutral-200 bg-linear-to-b from-red-50/40 via-white to-white py-12 sm:py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-4 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#A4161A] border border-red-200 shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A4161A]" />
                Amrita Vishwa Vidyapeetham
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900 leading-tight">
                Smart Campus Events &amp; Venue Management
              </h1>

              <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                Centralized university platform for multi-tier approval workflows, hall reservations, clash-free scheduling, digital student QR passes, and automated attendance verification.
              </p>

              {/* Action CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link href="/events">
                  <Button variant="primary" size="md">
                    <Compass className="h-4 w-4" /> Browse Campus Events
                  </Button>
                </Link>

                <Link href="/halls">
                  <Button variant="secondary" size="md">
                    <Building2 className="h-4 w-4 text-neutral-500" /> Hall Availability Schedule
                  </Button>
                </Link>

                <Link href="/login">
                  <Button variant="ghost" size="md">
                    <Lock className="h-4 w-4 text-neutral-500" /> Sign In
                  </Button>
                </Link>
              </div>
            </div>

            {/* Logo Emblem Card */}
            <div className="flex justify-center md:justify-end">
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm flex flex-col items-center text-center space-y-3 max-w-xs">
                <div className="relative h-20 w-52">
                  <Image
                    src="/amrita-logo.png"
                    alt="Amrita Vishwa Vidyapeetham"
                    fill
                    sizes="208px"
                    className="object-contain"
                    priority
                  />
                </div>
                <div className="text-xs font-bold text-neutral-800">
                  Campus Management System
                </div>
                <div className="text-[11px] text-neutral-500">
                  Deemed to be University under Section 3 of UGC Act, 1956
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="mb-6 space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">
            System Architecture &amp; Governance
          </h2>
          <p className="text-xs text-neutral-500">
            Enforcing university regulations through database constraints and structured role permissions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#A4161A]">
              <Clock className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-neutral-900">
              Clash-Free Hall Scheduling
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Exclusion constraints strictly prevent overlapping confirmed bookings in the same hall. The first approved proposal claims the reservation.
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-neutral-900">
              3-Stage Approval Hierarchy
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Every proposal advances methodically: Student Affairs policy check &rarr; Event Office venue allocation &rarr; Campus Director final sanction.
            </p>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-neutral-900">
              Digital QR Passes &amp; OD Export
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Attendees present high-contrast scannable QR passes. Verified check-ins export instantly to department On-Duty (OD) rosters.
            </p>
          </Card>
        </div>
      </section>

      {/* Pre-configured Demo Accounts */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <Card className="p-6 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-neutral-900">
                Pre-configured Evaluation Accounts
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Password for all demo accounts: <span className="font-mono font-bold text-neutral-800">demo1234</span>
              </p>
            </div>
            <Link href="/login">
              <Button variant="primary" size="sm">
                Sign In to Demo <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-1">
              <div className="font-bold text-neutral-900">Student</div>
              <div className="font-mono text-neutral-700">student1@demo.edu</div>
              <div className="text-[11px] text-neutral-500">Events, passes, hosting</div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-1">
              <div className="font-bold text-neutral-900">Faculty</div>
              <div className="font-mono text-neutral-700">faculty1@demo.edu</div>
              <div className="text-[11px] text-neutral-500">Department events &amp; hosting</div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-1">
              <div className="font-bold text-amber-900">Student Affairs</div>
              <div className="font-mono text-neutral-700">affairs@demo.edu</div>
              <div className="text-[11px] text-amber-800">Stage 1 approvals &amp; clubs</div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-1">
              <div className="font-bold text-amber-900">Event Office</div>
              <div className="font-mono text-neutral-700">eventoffice@demo.edu</div>
              <div className="text-[11px] text-amber-800">Stage 2 approvals &amp; venues</div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-1">
              <div className="font-bold text-blue-900">Campus Director</div>
              <div className="font-mono text-neutral-700">cd@demo.edu</div>
              <div className="text-[11px] text-blue-800">Stage 3 final approval</div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
