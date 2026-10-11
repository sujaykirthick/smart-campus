'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AllowedUser, UserRole } from '@/lib/types';
import { LogOut, LogIn, Menu, X, Calendar, Shield, Ticket, PlusCircle, CheckSquare } from 'lucide-react';
import Image from 'next/image';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setMobileMenuOpen(false);
    router.push('/login');
    router.refresh();
  };

  const isApprover =
    profile?.role === 'affairs' ||
    profile?.role === 'student_affairs' ||
    profile?.role === 'event_office' ||
    profile?.role === 'cd';

  // Construct links relevant to the role
  const getNavLinks = () => {
    const links: Array<{ href: string; label: string; icon: any }> = [
      { href: '/events', label: 'Events', icon: Calendar },
      { href: '/halls', label: 'Halls', icon: Calendar },
    ];

    if (!profile) return links;

    if (profile.role === 'student') {
      links.push(
        { href: '/my-events', label: 'My Passes', icon: Ticket },
        { href: '/organizer', label: 'Hosting', icon: PlusCircle }
      );
    } else if (profile.role === 'faculty') {
      links.push({ href: '/organizer', label: 'My Events', icon: PlusCircle });
    } else if (isApprover) {
      links.unshift({ href: '/approvals', label: 'Approvals', icon: CheckSquare });
    }

    return links;
  };

  const navLinks = getNavLinks();

  const getRoleBadgeLabel = (role?: string) => {
    switch (role) {
      case 'student':
        return 'Student';
      case 'faculty':
        return 'Faculty';
      case 'affairs':
      case 'student_affairs':
        return 'Student Affairs';
      case 'event_office':
        return 'Event Office';
      case 'cd':
        return 'Campus Director';
      default:
        return role || 'User';
    }
  };

  const getRoleBadgeStyle = (role?: string) => {
    switch (role) {
      case 'affairs':
      case 'student_affairs':
      case 'event_office':
      case 'cd':
        return 'bg-rose-50 text-[#851215] border-rose-200';
      case 'faculty':
        return 'bg-purple-50 text-purple-900 border-purple-200';
      case 'student':
        return 'bg-blue-50 text-blue-900 border-blue-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white shadow-2xs">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand & Logo */}
        <div className="flex items-center gap-4 sm:gap-8">
          <Link
            href="/"
            className="flex items-center gap-3 transition-opacity hover:opacity-90 select-none py-1"
            aria-label="Amrita Events Home"
          >
            <div className="relative h-10 w-28 sm:h-11 sm:w-36 flex items-center">
              <img
                src="/amrita-logo.png"
                alt="Amrita Vishwa Vidyapeetham"
                className="h-full w-auto object-contain max-h-11"
              />
            </div>
            <div className="hidden sm:flex flex-col border-l border-neutral-200 pl-3">
              <span className="text-sm font-bold tracking-tight text-neutral-900 leading-tight">
                Campus Events
              </span>
              <span className="text-[10px] text-neutral-500 font-medium">
                Genesis Platform
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Desktop Navigation">
            {navLinks.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors min-h-[40px] flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-[#A4161A] ${
                    isActive
                      ? 'bg-[#FDF2F2] text-[#A4161A] font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/70'
                  }`}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side user info & actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-neutral-100" />
          ) : profile ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* User info badge */}
              <div className="hidden sm:flex flex-col items-end text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-neutral-900 max-w-[160px] truncate">
                    {profile.name || profile.email}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getRoleBadgeStyle(
                      profile.role
                    )}`}
                  >
                    {getRoleBadgeLabel(profile.role)}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-500 font-mono max-w-[180px] truncate">
                  {profile.roll_no || profile.club_name || profile.department || profile.email}
                </span>
              </div>

              {/* Logout button */}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors min-h-[38px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A4161A]"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5 text-neutral-500" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#A4161A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#851215] transition-colors min-h-[38px] shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A4161A]"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Link>
          )}

          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 min-h-[44px] min-w-[44px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#A4161A]"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white px-4 pt-3 pb-5 shadow-lg animate-in slide-in-from-top-2">
          {profile && (
            <div className="mb-4 pb-3 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  {profile.name || profile.email}
                </p>
                <p className="text-xs text-neutral-500 font-mono mt-0.5">
                  {profile.roll_no || profile.email}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getRoleBadgeStyle(
                  profile.role
                )}`}
              >
                {getRoleBadgeLabel(profile.role)}
              </span>
            </div>
          )}

          <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
            {navLinks.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${
                    isActive
                      ? 'bg-[#FDF2F2] text-[#A4161A] font-semibold'
                      : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
