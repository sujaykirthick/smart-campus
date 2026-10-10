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
  Clock,
  ArrowLeft,
  FileSpreadsheet,
  RefreshCw,
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

  // Audio/Debounce cues
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
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          if (isMounted) setCameraError('No video camera detected on this device.');
          return;
        }

        if (!isMounted) return;

        const html5Qr = new Html5Qrcode(scannerElementId);
        scannerRef.current = html5Qr;

        const selectedCamera = cameras[cameras.length - 1].id;

        await html5Qr.start(
          selectedCamera,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleCheckin(decodedText);
          },
          () => {}
        );

        if (isMounted) {
          setCameraActive(true);
        }
      } catch (err: any) {
        console.warn('Camera failed to start:', err);
        if (isMounted) {
          setCameraActive(false);
          setCameraError(
            err?.message || 'Camera permission denied or device camera is unavailable.'
          );
        }
      }
    }

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
      <div className="mx-auto max-w-4xl px-4 py-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#A4161A]" />
        <div className="text-xs text-neutral-500">Loading scanner module...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={isOrganizerOrAffairs ? '/organizer' : '/my-events'}
            className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                Attendance Scanner
              </h1>
              {!isOrganizerOrAffairs && (
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
                  Volunteer
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              {event?.title} • {event?.halls?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOrganizerOrAffairs && (
            <Link
              href={`/organizer/events/${eventId}/od`}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              OD Attendance List
            </Link>
          )}

          <button
            onClick={loadEventData}
            className="rounded border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Live Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            Checked In
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">
            {scannedCount}
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
            <Users className="h-4 w-4 text-[#A4161A]" />
            Total Registered
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">
            {totalRegistered}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-md border border-neutral-200 bg-white p-3.5 shadow-xs">
          <div className="text-xs font-medium text-neutral-500">Attendance Rate</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">
            {totalRegistered > 0 ? Math.round((scannedCount / totalRegistered) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* SCAN RESULT BANNER */}
      {scanResult && (
        <div>
          {scanResult.status === 'ok' && (
            <div className="rounded-md border border-emerald-300 bg-emerald-700 p-5 text-white shadow-sm">
              <div className="flex items-start gap-3.5">
                <CheckCircle2 className="h-6 w-6 text-white shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-100">
                    Checked In Successfully
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">
                    {scanResult.student_name || 'Student Verified'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs font-medium text-emerald-100">
                    <span className="font-mono bg-emerald-800 px-2 py-0.5 rounded">
                      Roll: {scanResult.roll_no || 'N/A'}
                    </span>
                    <span>{scanResult.student_email}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'already_scanned' && (
            <div className="rounded-md border border-amber-300 bg-amber-600 p-5 text-white shadow-sm">
              <div className="flex items-start gap-3.5">
                <AlertTriangle className="h-6 w-6 text-white shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-100">
                    Duplicate Scan
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">
                    Already Checked In at {formatTimeOnly(scanResult.checked_in_at)}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs font-medium text-amber-100">
                    <span>{scanResult.student_name}</span>
                    <span className="font-mono bg-amber-700 px-2 py-0.5 rounded">
                      Roll: {scanResult.roll_no || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'outside_window' && (
            <div className="rounded-md border border-amber-300 bg-amber-600 p-5 text-white shadow-sm">
              <div className="flex items-start gap-3.5">
                <Clock className="h-6 w-6 text-white shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-100">
                    Outside Allowed Window
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">
                    Check-in Unavailable
                  </h2>
                  <p className="text-xs text-amber-100 pt-0.5">
                    {scanResult.message || 'Scanning opens 30 min before start and closes 30 min after the event ends.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'invalid' && (
            <div className="rounded-md border border-red-300 bg-[#991B1B] p-5 text-white shadow-sm">
              <div className="flex items-start gap-3.5">
                <XCircle className="h-6 w-6 text-white shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-red-100">
                    Scan Rejected
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">
                    Invalid Pass
                  </h2>
                  <p className="text-xs text-red-100 pt-0.5">
                    {scanResult.message || 'The token does not match an active confirmed pass for this event.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CAMERA & MANUAL FALLBACK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Camera Viewfinder */}
        <div className="lg:col-span-7 space-y-3">
          <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-neutral-800">
                <Camera className="h-4 w-4 text-[#A4161A]" /> Camera Scanner
              </span>
              {isProcessing && (
                <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" /> Verifying...
                </span>
              )}
            </div>

            {/* Viewfinder */}
            <div className="relative min-h-[280px] w-full flex items-center justify-center overflow-hidden rounded bg-neutral-900 mt-3">
              <div id="qr-camera-feed" className="w-full max-w-xs overflow-hidden" />

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-neutral-900 text-white space-y-2">
                  <VideoOff className="h-8 w-8 text-neutral-500" />
                  <p className="text-xs text-neutral-300 font-medium max-w-xs">{cameraError}</p>
                  <p className="text-[11px] text-neutral-500">
                    Use the manual input field below to enter token.
                  </p>
                </div>
              )}
            </div>

            {/* Manual Token Entry */}
            <div className="mt-4 pt-3 border-t border-neutral-200">
              <form onSubmit={handleManualSubmit} className="space-y-1.5">
                <label className="text-[11px] font-semibold text-neutral-700">
                  Manual Token Entry
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Enter QR token..."
                    className="flex-1 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 font-mono placeholder:text-neutral-400 focus:border-[#A4161A] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!manualToken.trim() || isProcessing}
                    className="inline-flex items-center gap-1 rounded bg-[#A4161A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#851215] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3 w-3" /> Submit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right: Live Attendees Feed */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-800">
              Live Check-in Stream
            </h3>
            <span className="text-xs text-neutral-500">
              {scannedCount} of {totalRegistered} present
            </span>
          </div>

          <div className="h-[420px] overflow-y-auto rounded-md border border-neutral-200 bg-white p-2 shadow-xs divide-y divide-neutral-100">
            {registrations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-neutral-400 text-xs">
                <Users className="h-6 w-6 mb-1 text-neutral-300" />
                No registrations found for this event.
              </div>
            ) : (
              registrations.map((reg) => {
                const isChecked = !!reg.checked_in_at;

                return (
                  <div
                    key={reg.id}
                    className={`py-2 px-2 flex items-center justify-between text-xs ${
                      isChecked ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="font-medium text-neutral-900 truncate">
                        {reg.student_email}
                      </div>
                      <div className="font-mono text-[11px] text-[#A4161A]">
                        Roll: {reg.roll_no || 'N/A'}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isChecked ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Checked
                          </span>
                          <div className="text-[10px] text-neutral-500 font-mono">
                            {formatTimeOnly(reg.checked_in_at!)}
                          </div>
                        </div>
                      ) : (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
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
