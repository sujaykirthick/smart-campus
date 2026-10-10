'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  LogIn,
  KeyRound,
  Mail,
  AlertCircle,
  Sparkles,
  Building2,
  Shield,
  GraduationCap,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Lock,
} from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Authentication succeeded but user session could not be established.');
      }

      // Lookup role in allowed_users whitelist
      const { data: allowedUserData } = await supabase
        .from('allowed_users')
        .select('role')
        .eq('email', cleanEmail)
        .maybeSingle();

      const userRole = allowedUserData?.role || authData.user.user_metadata?.role || 'student';

      // Redirect by role according to requirements
      if (nextParam) {
        router.push(nextParam);
      } else {
        switch (userRole) {
          case 'club':
          case 'department':
            router.push('/organizer');
            break;
          case 'affairs':
            router.push('/affairs');
            break;
          case 'student':
          default:
            router.push('/events');
            break;
        }
      }

      router.refresh();
    } catch (err: unknown) {
      console.error('Login error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in. Please verify your credentials.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    setError(null);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[#EADFD6] bg-[#FFFFFF] shadow-xl flex flex-col md:flex-row min-h-[600px]">
        {/* Left Side: Deep Red Toned Brand & Highlights Panel */}
        <div className="relative md:w-5/12 bg-gradient-to-br from-[#8E1A22] via-[#B3202A] to-[#681116] p-8 sm:p-10 text-white flex flex-col justify-between overflow-hidden">
          {/* Subtle gold decorative top bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#C9A24B] via-[#E5C378] to-[#C9A24B]" />

          {/* Background grid accent */}
          <div className="absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-[#FFFFFF]/5 blur-2xl" />

          <div className="space-y-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-xs border border-white/20 text-[#C9A24B]">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className="font-serif text-2xl font-bold tracking-tight text-white flex items-center gap-1">
                  GENESIS
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24B]" />
                </span>
                <span className="text-[11px] font-mono tracking-widest text-[#E5C378] uppercase">
                  Campus Events Governance
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <h1 className="font-serif text-2xl sm:text-3xl font-extrabold leading-tight text-white">
                Intelligent Venue Allocation &amp; Event Logistics
              </h1>
              <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                Seamless campus events management with zero-clash hall booking, verified digital passes, and instant attendance analytics.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-2.5 text-xs text-white/90">
                <CheckCircle2 className="h-4 w-4 text-[#C9A24B] shrink-0 mt-0.5" />
                <span>Postgres exclusion constraints ensure zero double-booked halls</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-white/90">
                <CheckCircle2 className="h-4 w-4 text-[#C9A24B] shrink-0 mt-0.5" />
                <span>Row Level Security (RLS) protects student privacy</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-white/90">
                <CheckCircle2 className="h-4 w-4 text-[#C9A24B] shrink-0 mt-0.5" />
                <span>Automated waitlist promotions and real-time QR check-in</span>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10 relative z-10 flex items-center justify-between text-xs text-white/70">
            <span>Amrita Vishwa Vidyapeetham</span>
            <Link href="/halls" className="text-[#E5C378] hover:text-white font-semibold flex items-center gap-1 transition-colors">
              Halls <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Right Side: Form Panel */}
        <div className="md:w-7/12 p-8 sm:p-10 flex flex-col justify-between space-y-6 bg-[#FFFFFF]">
          <div className="space-y-6 max-w-md mx-auto w-full">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF0F0] border border-[#EADFD6] px-3 py-1 text-xs font-semibold text-[#B3202A]">
                <Lock className="h-3.5 w-3.5" />
                Campus Single Sign-On
              </div>
              <h2 className="font-serif text-2xl font-bold text-[#2B1B17] mt-2">
                Sign In to Your Account
              </h2>
              <p className="text-xs text-[#7A6A62] mt-1">
                Enter your campus email and password to access the portal.
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="rounded-xl border border-[#FECACA] bg-[#FEE2E2] p-3.5 text-xs text-[#7F1D1D] flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#7F1D1D] mt-0.5" />
                <div>
                  <p className="font-bold">Sign in error</p>
                  <p className="mt-0.5 text-[11px]">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#2B1B17] mb-1.5 uppercase tracking-wider">
                  Campus Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A62]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student1@demo.edu"
                    className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] py-2.5 pl-10 pr-4 text-xs text-[#2B1B17] placeholder:text-[#A3938B] focus:border-[#B3202A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#B3202A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2B1B17] mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7A6A62]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#EADFD6] bg-[#FFFAF5] py-2.5 pl-10 pr-4 text-xs text-[#2B1B17] placeholder:text-[#A3938B] focus:border-[#B3202A] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#B3202A]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 rounded-xl bg-[#B3202A] py-3 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign In to Portal
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Logins */}
            <div className="border-t border-[#EADFD6] pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#7A6A62] mb-2.5 text-center">
                Quick Demo Switcher (Password: demo1234)
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => quickFill('student1@demo.edu')}
                  className="flex items-center gap-2 rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-2 text-left hover:border-[#C9A24B] hover:bg-white transition-colors cursor-pointer group"
                >
                  <div className="rounded-lg p-1.5 bg-[#FDF8ED] text-[#A07C28] group-hover:scale-105 transition-transform">
                    <GraduationCap className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-[#2B1B17] text-[11px]">Student</div>
                    <div className="text-[10px] text-[#7A6A62] font-mono truncate">student1@demo.edu</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => quickFill('codingclub@demo.edu')}
                  className="flex items-center gap-2 rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-2 text-left hover:border-[#B3202A] hover:bg-white transition-colors cursor-pointer group"
                >
                  <div className="rounded-lg p-1.5 bg-[#FEF3C7] text-[#B45309] group-hover:scale-105 transition-transform">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-[#2B1B17] text-[11px]">Club Organizer</div>
                    <div className="text-[10px] text-[#7A6A62] font-mono truncate">codingclub@demo.edu</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => quickFill('cse@demo.edu')}
                  className="flex items-center gap-2 rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-2 text-left hover:border-[#B3202A] hover:bg-white transition-colors cursor-pointer group"
                >
                  <div className="rounded-lg p-1.5 bg-[#FAF0F0] text-[#8E1A22] group-hover:scale-105 transition-transform">
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-[#2B1B17] text-[11px]">Department</div>
                    <div className="text-[10px] text-[#7A6A62] font-mono truncate">cse@demo.edu</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => quickFill('affairs@demo.edu')}
                  className="flex items-center gap-2 rounded-xl border border-[#EADFD6] bg-[#FFFAF5] p-2 text-left hover:border-[#7F1D1D] hover:bg-white transition-colors cursor-pointer group"
                >
                  <div className="rounded-lg p-1.5 bg-[#FEE2E2] text-[#7F1D1D] group-hover:scale-105 transition-transform">
                    <Shield className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-[#2B1B17] text-[11px]">Student Welfare</div>
                    <div className="text-[10px] text-[#7A6A62] font-mono truncate">affairs@demo.edu</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Footer public link */}
          <div className="text-center text-xs text-[#7A6A62]">
            Want to check hall availability first?{' '}
            <Link href="/halls" className="font-bold text-[#B3202A] hover:underline">
              View Public Halls Schedule &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#B3202A] border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
