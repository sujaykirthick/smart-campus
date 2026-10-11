'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, ChevronDown, ChevronUp, User } from 'lucide-react';
import { Button } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

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
      const { data: allowedUserData, error: lookupError } = await supabase
        .from('allowed_users')
        .select('role')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (lookupError || !allowedUserData) {
        await supabase.auth.signOut();
        throw new Error(`Access denied: User "${cleanEmail}" is not authorized in the whitelist.`);
      }

      const validRoles = ['student', 'faculty', 'student_affairs', 'event_office', 'cd'];
      if (!validRoles.includes(allowedUserData.role)) {
        await supabase.auth.signOut();
        throw new Error(`Access denied: User "${cleanEmail}" has unrecognized role "${allowedUserData.role}".`);
      }

      const userRole = allowedUserData.role;

      // Redirect by role
      if (nextParam) {
        router.push(nextParam);
      } else {
        switch (userRole) {
          case 'student_affairs':
          case 'event_office':
          case 'cd':
            router.push('/approvals');
            break;
          case 'faculty':
          case 'student':
          default:
            router.push('/events');
            break;
        }
      }

      router.refresh();
    } catch (err: unknown) {
      console.error('Login error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in. Please check your credentials.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    { label: 'Student', email: 'student1@demo.edu', desc: 'Browse, register, volunteer, propose' },
    { label: 'Faculty', email: 'faculty1@demo.edu', desc: 'Host dept workshops, review' },
    { label: 'Student Affairs', email: 'affairs@demo.edu', desc: 'Stage 1 approvals, clubs' },
    { label: 'Event Office', email: 'eventoffice@demo.edu', desc: 'Stage 2 approvals, venue lock' },
    { label: 'Campus Director', email: 'cd@demo.edu', desc: 'Stage 3 final sanctions' },
  ];

  const quickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    setError(null);
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-50/50 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {/* Institutional Crimson Top Accent */}
        <div className="h-2 w-full bg-[#A4161A]" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Logo & Header */}
          <div className="text-center">
            <div className="flex justify-center mb-3">
              <img
                src="/amrita-logo.png"
                alt="Amrita Vishwa Vidyapeetham"
                className="h-12 w-auto object-contain"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
              Campus Events Portal
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1">
              Sign in with your university credentials
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs sm:text-sm text-rose-900 flex items-start gap-2.5"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Unable to sign in</p>
                <p className="mt-0.5 text-xs opacity-90">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rollnumber@demo.edu"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:ring-2 focus:ring-[#A4161A]/20 focus:outline-none transition-all min-h-[44px]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-700"
                >
                  Password
                </label>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:ring-2 focus:ring-[#A4161A]/20 focus:outline-none transition-all min-h-[44px]"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full min-h-[44px] font-semibold"
              isLoading={loading}
            >
              Sign In
            </Button>
          </form>

          {/* Collapsible Demo Accounts Panel */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDemoAccounts(!showDemoAccounts)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs font-semibold text-neutral-700 hover:bg-neutral-100/60 transition-colors cursor-pointer select-none min-h-[44px]"
              aria-expanded={showDemoAccounts}
            >
              <span className="flex items-center gap-2">
                <User className="h-4 w-4 text-[#A4161A]" />
                Demo Accounts (demo1234)
              </span>
              {showDemoAccounts ? (
                <ChevronUp className="h-4 w-4 text-neutral-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-neutral-500" />
              )}
            </button>

            {showDemoAccounts && (
              <div className="p-3 pt-0 border-t border-neutral-200/60 space-y-2 mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => quickFill(acc.email)}
                      className={`p-2.5 rounded-lg border border-neutral-200 bg-white hover:border-[#A4161A]/50 hover:bg-[#FDF2F2]/40 transition-all text-left cursor-pointer ${
                        acc.label === 'Campus Director' ? 'sm:col-span-2' : ''
                      }`}
                    >
                      <div className="font-semibold text-neutral-900">{acc.label}</div>
                      <div className="text-[11px] text-neutral-500 font-mono truncate">{acc.email}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="text-center pt-2">
            <Link
              href="/halls"
              className="text-xs font-medium text-[#A4161A] hover:underline"
            >
              Check Public Hall Booking Availability &rarr;
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
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#A4161A] border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
