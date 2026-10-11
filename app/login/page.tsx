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
  Building2,
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
      const { data: allowedUserData, error: lookupError } = await supabase
        .from('allowed_users')
        .select('role')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (lookupError || !allowedUserData) {
        await supabase.auth.signOut();
        throw new Error(`Access denied: User "${cleanEmail}" is not authorized in the allowed_users whitelist.`);
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
    <div className="flex-1 flex items-center justify-center bg-[#F5F5F5] p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs">
        {/* Institutional Red Header Strip */}
        <div className="h-1.5 w-full bg-[#A4161A]" />

        <div className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-neutral-900">
              Sign in
            </h1>
            <p className="text-xs text-neutral-500">
              Amrita Vishwa Vidyapeetham Campus Portal
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to sign in</p>
                <p className="mt-0.5 text-[11px]">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@demo.edu"
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#A4161A] py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#851215] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Plain Demo accounts box */}
          <div className="rounded-md border border-neutral-200 bg-[#F5F5F5] p-3 space-y-2">
            <div className="text-[11px] font-semibold text-neutral-600">
              Demo accounts (Password: demo1234)
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => quickFill('student1@demo.edu')}
                className="rounded-sm border border-neutral-200 bg-white px-2 py-1 text-left text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-[11px]">Student</div>
                <div className="text-[10px] text-neutral-500 truncate font-mono">student1@demo.edu</div>
              </button>

              <button
                type="button"
                onClick={() => quickFill('faculty1@demo.edu')}
                className="rounded-sm border border-neutral-200 bg-white px-2 py-1 text-left text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-[11px]">Faculty</div>
                <div className="text-[10px] text-neutral-500 truncate font-mono">faculty1@demo.edu</div>
              </button>

              <button
                type="button"
                onClick={() => quickFill('affairs@demo.edu')}
                className="rounded-sm border border-neutral-200 bg-white px-2 py-1 text-left text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-[11px]">Student Affairs</div>
                <div className="text-[10px] text-neutral-500 truncate font-mono">affairs@demo.edu</div>
              </button>

              <button
                type="button"
                onClick={() => quickFill('eventoffice@demo.edu')}
                className="rounded-sm border border-neutral-200 bg-white px-2 py-1 text-left text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <div className="font-semibold text-[11px]">Event Office</div>
                <div className="text-[10px] text-neutral-500 truncate font-mono">eventoffice@demo.edu</div>
              </button>

              <button
                type="button"
                onClick={() => quickFill('cd@demo.edu')}
                className="rounded-sm border border-neutral-200 bg-white px-2 py-1 text-left text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer col-span-2"
              >
                <div className="font-semibold text-[11px]">Campus Director (CD)</div>
                <div className="text-[10px] text-neutral-500 truncate font-mono">cd@demo.edu</div>
              </button>
            </div>
          </div>

          <div className="text-center text-xs text-neutral-500">
            <Link href="/halls" className="text-[#A4161A] hover:underline font-medium">
              View Hall Availability Schedule
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
