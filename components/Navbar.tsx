'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AllowedUser, UserRole } from '@/lib/types';
import { Calendar, Shield, LogOut, LogIn, Compass, QrCode, ClipboardList } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLogoImage, setHasLogoImage] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const { data: allowedUser } = await supabase
            .from('allowed_users')
            .select('*')
            .eq('email', user.email)
            .maybeSingle();

          if (allowedUser) {
            setProfile(allowedUser);
          } else {
            setProfile({
              email: user.email,
              role: (user.user_metadata?.role as UserRole) || 'student',
              name: user.user_metadata?.name || user.email.split('@')[0],
              club_name: null,
              department: null,
              roll_no: null,
            });
          }
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error('Error fetching user for navbar:', err);
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        loadUser();
      } else {
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    router.push('/login');
    router.refresh();
  };

  const getRoleDashboardLink = () => {
    if (!profile) return null;
    if (profile.role === 'student' || profile.role === 'faculty') {
      return { href: '/organizer', label: 'My Events', icon: ClipboardList };
    }
    if (profile.role === 'affairs' || profile.role === 'student_affairs') {
      return { href: '/approvals', label: 'Student Welfare', icon: Shield };
    }
    if (profile.role === 'event_office') {
      return { href: '/approvals', label: 'Event Office', icon: Shield };
    }
    if (profile.role === 'cd') {
      return { href: '/approvals', label: 'Campus Director', icon: Shield };
    }
    return null;
  };

  const roleDashboard = getRoleDashboardLink();

  const getRoleBadgeLabel = (role?: string) => {
    if (role === 'student') return 'Student';
    if (role === 'faculty') return 'Faculty';
    if (role === 'affairs' || role === 'student_affairs') return 'Student Welfare';
    if (role === 'event_office') return 'Event Office';
    if (role === 'cd') return 'Campus Director';
    return role;
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'affairs':
      case 'student_affairs':
      case 'event_office':
      case 'cd':
        return 'bg-red-50 text-red-900 border-red-200';
      case 'faculty':
        return 'bg-purple-50 text-purple-900 border-purple-200';
      case 'student':
        return 'bg-blue-50 text-blue-900 border-blue-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Logo Slot */}
        <div className="flex items-center gap-6 sm:gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            {/* Official Logo Slot: will render /logo.png if placed in /public */}
            {hasLogoImage ? (
              <img
                src="/logo.png"
                alt="Amrita Logo"
                className="h-8 w-auto object-contain"
                onError={() => setHasLogoImage(false)}
              />
            ) : null}

            {/* Fallback Wordmark with small red square mark */}
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-xs bg-[#A4161A]" />
              <div className="flex flex-col">
                <span className="text-base font-bold tracking-tight text-neutral-900">
                  Amrita Events
                </span>
              </div>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              href="/events"
              className={`px-3 py-1.5 rounded-md transition-colors ${
                pathname === '/events'
                  ? 'text-[#A4161A] font-semibold bg-neutral-100'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              Events
            </Link>

            <Link
              href="/halls"
              className={`px-3 py-1.5 rounded-md transition-colors ${
                pathname === '/halls'
                  ? 'text-[#A4161A] font-semibold bg-neutral-100'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              Hall Availability
            </Link>

            {profile && profile.role === 'student' && (
              <Link
                href="/my-events"
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  pathname === '/my-events'
                    ? 'text-[#A4161A] font-semibold bg-neutral-100'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                My Passes
              </Link>
            )}

            {roleDashboard && (
              <Link
                href={roleDashboard.href}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  pathname.startsWith(roleDashboard.href)
                    ? 'text-[#A4161A] font-semibold bg-neutral-100'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                {roleDashboard.label}
              </Link>
            )}
          </nav>
        </div>

        {/* Right side user info & actions */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-7 w-20 animate-pulse rounded-md bg-neutral-100" />
          ) : profile ? (
            <div className="flex items-center gap-3">
              {/* User badge */}
              <div className="hidden sm:flex flex-col items-end text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-neutral-900">
                    {profile.name || profile.email}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-sm border px-1.5 py-0.2 text-[10px] font-semibold capitalize ${getRoleBadgeColor(
                      profile.role
                    )}`}
                  >
                    {getRoleBadgeLabel(profile.role)}
                  </span>
                </div>
                <span className="text-[11px] text-neutral-500 font-mono">
                  {profile.club_name || profile.department || profile.roll_no || profile.email}
                </span>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-md bg-[#A4161A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
