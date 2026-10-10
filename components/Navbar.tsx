'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AllowedUser, UserRole } from '@/lib/types';
import { Calendar, Building2, Shield, LogOut, LogIn, Sparkles, Compass, QrCode } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [loading, setLoading] = useState(true);

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
            // Fallback if not in allowed_users yet
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
    if (profile.role === 'club' || profile.role === 'department') {
      return { href: '/organizer', label: 'Organizer Portal', icon: Sparkles };
    }
    if (profile.role === 'affairs') {
      return { href: '/affairs', label: 'Student Welfare', icon: Shield };
    }
    return { href: '/events', label: 'Browse Events', icon: Compass };
  };

  const roleDashboard = getRoleDashboardLink();

  const getRoleBadgeLabel = (role?: string) => {
    if (role === 'affairs') return 'Student Welfare';
    return role;
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'affairs':
        return 'bg-[#FEE2E2] text-[#7F1D1D] border-[#FECACA]';
      case 'club':
        return 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]';
      case 'department':
        return 'bg-[#FAF0F0] text-[#8E1A22] border-[#EADFD6]';
      case 'student':
        return 'bg-[#FDF8ED] text-[#A07C28] border-[#C9A24B]/40';
      default:
        return 'bg-[#FAF5F0] text-[#7A6A62] border-[#EADFD6]';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-[#B3202A] bg-[#FFFFFF] shadow-xs transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-6 sm:gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#B3202A] text-white shadow-xs group-hover:bg-[#8E1A22] transition-colors">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col relative pb-0.5">
              <span className="font-serif text-xl font-extrabold tracking-tight text-[#2B1B17] group-hover:text-[#B3202A] transition-colors flex items-center gap-1">
                GENESIS
                <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24B]" />
              </span>
              <div className="h-0.5 w-full bg-[#C9A24B]/50 -mt-0.5 rounded-full" />
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/events"
              className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                pathname === '/events'
                  ? 'text-[#B3202A] font-semibold'
                  : 'text-[#7A6A62] hover:text-[#2B1B17] hover:bg-[#FFFAF5] rounded-md'
              }`}
            >
              <Compass className="h-4 w-4" />
              Events
              {pathname === '/events' && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#C9A24B] rounded-full" />
              )}
            </Link>

            <Link
              href="/halls"
              className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                pathname === '/halls'
                  ? 'text-[#B3202A] font-semibold'
                  : 'text-[#7A6A62] hover:text-[#2B1B17] hover:bg-[#FFFAF5] rounded-md'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Hall Availability
              {pathname === '/halls' && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#C9A24B] rounded-full" />
              )}
            </Link>

            {profile && profile.role === 'student' && (
              <Link
                href="/my-events"
                className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === '/my-events'
                    ? 'text-[#B3202A] font-semibold'
                    : 'text-[#7A6A62] hover:text-[#2B1B17] hover:bg-[#FFFAF5] rounded-md'
                }`}
              >
                <QrCode className="h-4 w-4" />
                My Passes
                {pathname === '/my-events' && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#C9A24B] rounded-full" />
                )}
              </Link>
            )}

            {roleDashboard && roleDashboard.href !== '/events' && (
              <Link
                href={roleDashboard.href}
                className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                  pathname.startsWith(roleDashboard.href)
                    ? 'text-[#B3202A] font-semibold'
                    : 'text-[#7A6A62] hover:text-[#2B1B17] hover:bg-[#FFFAF5] rounded-md'
                }`}
              >
                <roleDashboard.icon className="h-4 w-4" />
                {roleDashboard.label}
                {pathname.startsWith(roleDashboard.href) && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#C9A24B] rounded-full" />
                )}
              </Link>
            )}
          </nav>
        </div>

        {/* Right side user info & actions */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-md bg-[#FAF5F0]" />
          ) : profile ? (
            <div className="flex items-center gap-3">
              {/* User badge */}
              <div className="hidden sm:flex flex-col items-end text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#2B1B17]">
                    {profile.name || profile.email}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeColor(
                      profile.role
                    )}`}
                  >
                    {getRoleBadgeLabel(profile.role)}
                  </span>
                </div>
                <span className="text-[11px] text-[#7A6A62] font-mono">
                  {profile.club_name || profile.department || profile.roll_no || profile.email}
                </span>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border border-[#EADFD6] bg-[#FFFAF5] px-3 py-1.5 text-xs font-semibold text-[#7A6A62] shadow-xs hover:border-[#B3202A] hover:text-[#B3202A] hover:bg-[#FFFFFF] transition-colors cursor-pointer"
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
                className="flex items-center gap-1.5 rounded-lg bg-[#B3202A] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#8E1A22] transition-colors"
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
