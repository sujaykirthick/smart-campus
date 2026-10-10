'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { CampusEvent, Registration, ScanCheckinResult } from '@/lib/types';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  Calendar,
  MapPin,
  Clock,
  ArrowLeft,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ShieldCheck,
  Send,
  Loader2,
  VideoOff,
} from 'lucide-react';

export default function OrganizerScannerPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<CampusEvent | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOrganizerOrAffairs, setIsOrganizerOrAffairs] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Scan result state
  const [scanResult, setScanResult] = useState<ScanCheckinResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Manual fallback input
  const [manualToken, setManualToken] = useState('');

  // Audio feedback cues
  const lastScannedRef = useRef<{ token: string; time: number } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const supabase = useMemo(() => createClient(), []);

  // Fetch event and attendee registrations
  const loadEventData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        router.push('/login');
        return;
      }

      const [eventRes, regsRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, halls(id, name, capacity, location), fests(id, name)')
          .eq('id', eventId)
          .maybeSingle(),
        supabase
          .from('registrations')
          .select('*')
          .eq('event_id', eventId)
          .order('checked_in_at', { ascending: false, nullsFirst: false }),
      ]);

      if (eventRes.data) {
        let isAuth = false;
        let isOwner = false;

        // Check 1: Event organizer
        if (eventRes.data.organizer_email === user.email) {
          isAuth = true;
          isOwner = true;
        }

        // Check 2: Affairs role
        if (!isAuth) {
          const { data: userRole } = await supabase
            .from('allowed_users')
            .select('role')
            .eq('email', user.email)
            .maybeSingle();

          if (userRole?.role === 'affairs') {
            isAuth = true;
            isOwner = true;
          }
        }

        // Check 3: Accepted Volunteer
        if (!isAuth) {
          const { data: volData } = await supabase
            .from('volunteers')
            .select('status')
            .eq('event_id', eventId)
            .eq('student_email', user.email)
            .eq('status', 'accepted')
            .maybeSingle();

          if (volData) {
            isAuth = true;
            isOwner = false;
          }
        }

        if (!isAuth) {
          alert('Unauthorized: You are not an organizer or accepted volunteer for this event.');
          router.push('/events');
          return;
        }

        setIsOrganizerOrAffairs(isOwner);
        setEvent(eventRes.data as CampusEvent);
      } else {
        router.push('/organizer');
        return;
      }

      if (regsRes.data) {
        setRegistrations(regsRes.data as Registration[]);
      }
    } catch (err) {
      console.error('Error loading event scanner data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, eventId, router]);

  useEffect(() => {
    loadEventData();
  }, [loadEventData]);

  // Execute scan check-in
  const handleCheckin = useCallback(async (token: string) => {
    const cleanToken = token.trim();
    if (!cleanToken) return;

    // Debounce duplicate reads of the exact same code within 3 seconds
    if (
      lastScannedRef.current &&
      lastScannedRef.current.token === cleanToken &&
      Date.now() - lastScannedRef.current.time < 3000
    ) {
      return;
    }

    lastScannedRef.current = { token: cleanToken, time: Date.now() };
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.rpc('scan_checkin', {
        p_token: cleanToken,
      });

      if (error) {
        setScanResult({
          status: 'invalid',
          message: error.message,
        });
      } else if (data) {
        setScanResult(data as ScanCheckinResult);
      }

      // Refresh registrations live list
      const { data: updatedRegs } = await supabase
        .from('registrations')
        .select('*')
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: false, nullsFirst: false });

      if (updatedRegs) {
        setRegistrations(updatedRegs as Registration[]);
      }
    } catch (err: any) {
      setScanResult({
        status: 'invalid',
        message: err?.message || 'Check-in request failed.',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [supabase, eventId]);

  // Initialize html5-qrcode camera
  useEffect(() => {
    let isMounted = true;
    const scannerElementId = 'qr-camera-feed';

    async function startCamera() {
      try {
        setCameraError(null);
        // Check cameras
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          if (isMounted) setCameraError('No video camera detected on this device.');
          return;
        }

        if (!isMounted) return;

        const html5Qr = new Html5Qrcode(scannerElementId);
        scannerRef.current = html5Qr;

        // Prefer rear camera on phones
        const selectedCamera = cameras[cameras.length - 1].id;

        await html5Qr.start(
          selectedCamera,
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleCheckin(decodedText);
          },
          () => {
            // Ignore frame no-match noise
          }
        );

        if (isMounted) {
          setCameraActive(true);
        }
      } catch (err: any) {
        console.warn('Camera failed to start:', err);
        if (isMounted) {
          setCameraActive(false);
          setCameraError(
            err?.message || 'Camera permission denied or camera not accessible.'
          );
        }
      }
    }

    // Delay slight tick for DOM element mount
    const timer = setTimeout(() => {
      startCamera();
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
      }
    };
  }, [handleCheckin]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    handleCheckin(manualToken.trim());
    setManualToken('');
  };

  const scannedCount = useMemo(() => {
    return registrations.filter((r) => r.checked_in_at !== null).length;
  }, [registrations]);

  const totalRegistered = registrations.length;

  const formatTimeOnly = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#B3202A]" />
        <div className="text-sm font-medium text-[#7A6A62]">Loading scanner module...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={isOrganizerOrAffairs ? '/organizer' : '/my-events'}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#EADFD6] bg-white text-[#2B1B17] shadow-xs hover:bg-[#FFFAF5] hover:text-[#B3202A] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2B1B17]">
                Live QR Scanner
              </h1>
              {!isOrganizerOrAffairs && (
                <span className="rounded-full bg-[#FFFAF5] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8E1A22] border border-[#C9A24B]/50">
                  Volunteer Mode
                </span>
              )}
            </div>
            <p className="text-xs text-[#7A6A62]">
              {event?.title} • {event?.halls?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isOrganizerOrAffairs && (
            <Link
              href={`/organizer/events/${eventId}/od`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-xs"
            >
              <FileSpreadsheet className="h-4 w-4" />
              OD Attendance List
            </Link>
          )}

          <button
            onClick={loadEventData}
            className="rounded-xl border border-[#EADFD6] bg-white p-2 text-[#7A6A62] shadow-xs hover:bg-[#FFFAF5] hover:text-[#2B1B17] transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Live Counter Widget */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Checked In
          </div>
          <div className="font-serif text-3xl font-extrabold text-emerald-900 mt-1">
            {scannedCount}
          </div>
        </div>

        <div className="rounded-2xl border border-[#C9A24B]/30 bg-gradient-to-br from-[#FFFAF5] to-white p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8E1A22]">
            <Users className="h-4 w-4 text-[#B3202A]" />
            Total Registered
          </div>
          <div className="font-serif text-3xl font-extrabold text-[#2B1B17] mt-1">
            {totalRegistered}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-[#EADFD6] bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold text-[#7A6A62]">Attendance Rate</div>
          <div className="font-serif text-3xl font-extrabold text-[#2B1B17] mt-1">
            {totalRegistered > 0 ? Math.round((scannedCount / totalRegistered) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* SCAN RESULT BANNER (Large Green / Amber / Red) */}
      {scanResult && (
        <div className="animate-in fade-in zoom-in-95 duration-200">
          {scanResult.status === 'ok' && (
            <div className="overflow-hidden rounded-2xl border-2 border-emerald-600 bg-emerald-700 p-6 text-white shadow-lg">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                  <CheckCircle2 className="h-7 w-7 text-white" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-emerald-100">
                    Scan Successful • Checked In
                  </div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight">
                    {scanResult.student_name || 'Student Verified'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-sm font-semibold text-emerald-100">
                    <span className="font-mono bg-emerald-800/80 px-2.5 py-0.5 rounded-lg border border-emerald-500/50">
                      Roll No: {scanResult.roll_no || 'N/A'}
                    </span>
                    <span>{scanResult.student_email}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'already_scanned' && (
            <div className="overflow-hidden rounded-2xl border-2 border-amber-600 bg-amber-600 p-6 text-white shadow-lg">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                  <AlertTriangle className="h-7 w-7 text-white" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-amber-100">
                    Duplicate Read Warning
                  </div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight">
                    Already Scanned at {formatTimeOnly(scanResult.checked_in_at)}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-sm font-semibold text-amber-100">
                    <span>{scanResult.student_name}</span>
                    <span className="font-mono bg-amber-700/80 px-2.5 py-0.5 rounded-lg border border-amber-400/50">
                      Roll No: {scanResult.roll_no || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'outside_window' && (
            <div className="overflow-hidden rounded-2xl border-2 border-amber-600 bg-amber-600 p-6 text-white shadow-lg">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                  <Clock className="h-7 w-7 text-white" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-amber-100">
                    Outside Allowed Check-in Window
                  </div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight">
                    Check-in Unavailable
                  </h2>
                  <p className="text-sm font-medium text-amber-100 pt-0.5">
                    {scanResult.message || 'Scanning opens 30 min before start and closes 30 min after the event ends.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'invalid' && (
            <div className="overflow-hidden rounded-2xl border-2 border-[#7F1D1D] bg-[#8E1A22] p-6 text-white shadow-lg">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                  <XCircle className="h-7 w-7 text-white" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-red-100">
                    Check-in Rejected
                  </div>
                  <h2 className="font-serif text-2xl font-bold tracking-tight">
                    Invalid QR Code
                  </h2>
                  <p className="text-sm text-red-100 pt-0.5">
                    {scanResult.message || 'The presented token does not belong to an authorized registration for this event.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCANNER WORKSPACE: CAMERA & MANUAL FALLBACK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Viewfinder */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative overflow-hidden rounded-3xl border border-[#2B1B17] bg-[#2B1B17] p-4 shadow-xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-700 text-xs">
              <span className="flex items-center gap-2 font-bold uppercase tracking-wider text-[#C9A24B]">
                <Camera className="h-4 w-4" /> Live Camera Viewfinder
              </span>
              {isProcessing && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying...
                </span>
              )}
            </div>

            {/* Camera View Area */}
            <div className="relative min-h-[300px] w-full flex items-center justify-center overflow-hidden rounded-2xl bg-black/60 mt-3">
              <div id="qr-camera-feed" className="w-full max-w-sm overflow-hidden rounded-xl" />

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/90 space-y-2">
                  <VideoOff className="h-10 w-10 text-zinc-500" />
                  <p className="text-xs text-zinc-300 font-medium max-w-xs">{cameraError}</p>
                  <p className="text-[11px] text-zinc-500">
                    You can type the 48-character QR token in the manual input below.
                  </p>
                </div>
              )}
            </div>

            {/* Manual Token Entry Fallback */}
            <div className="mt-4 pt-3 border-t border-zinc-700">
              <form onSubmit={handleManualSubmit} className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Manual Token Fallback (Demo / Camera Override)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Paste 48-char QR token..."
                    className="flex-1 rounded-xl border border-zinc-700 bg-black/40 px-3.5 py-2 text-xs text-white font-mono placeholder:text-zinc-500 focus:border-[#C9A24B] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!manualToken.trim() || isProcessing}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#B3202A] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#8E1A22] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" /> Check In
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Live Attendees Check-in Feed */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-sm font-bold text-[#2B1B17] flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              Live Check-in Activity
            </h3>
            <span className="text-xs text-[#7A6A62] font-medium">
              {scannedCount} of {totalRegistered} present
            </span>
          </div>

          <div className="h-[460px] overflow-y-auto rounded-2xl border border-[#EADFD6] bg-white p-3 shadow-xs divide-y divide-[#EADFD6]">
            {registrations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[#7A6A62] text-xs">
                <Users className="h-8 w-8 mb-2 opacity-40 text-[#EADFD6]" />
                No registrations found for this event.
              </div>
            ) : (
              registrations.map((reg) => {
                const isChecked = !!reg.checked_in_at;

                return (
                  <div
                    key={reg.id}
                    className={`py-3 px-2 flex items-center justify-between text-xs transition-colors rounded-xl ${
                      isChecked
                        ? 'bg-emerald-50/50'
                        : 'opacity-70'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="font-bold text-[#2B1B17] truncate">
                        {reg.student_email}
                      </div>
                      <div className="font-mono text-[11px] text-[#8E1A22] font-semibold">
                        Roll: {reg.roll_no || 'N/A'}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isChecked ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Scanned
                          </span>
                          <div className="text-[10px] text-[#7A6A62] font-mono">
                            {formatTimeOnly(reg.checked_in_at!)}
                          </div>
                        </div>
                      ) : (
                        <span className="rounded-full bg-[#FFFAF5] border border-[#EADFD6] px-2 py-0.5 text-[10px] font-medium text-[#7A6A62]">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
