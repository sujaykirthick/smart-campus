'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CampusLocation } from '@/lib/types';
import { HallVenueDetails, getHallDetailsForLocation } from '@/lib/map-service';
import {
  calculateInAppRoute,
  isWithinCampusBounds,
  InAppRouteResult,
} from '@/lib/campus-routing';
import {
  X,
  Navigation,
  Users,
  Calendar,
  Clock,
  Compass,
  AlertCircle,
  PlayCircle,
  Hourglass,
  CheckCircle2,
  ArrowUpDown,
  CornerDownRight,
  RotateCcw,
  Footprints,
} from 'lucide-react';
import Link from 'next/link';

interface PlaceDetailPanelProps {
  location: CampusLocation;
  allLocations: CampusLocation[];
  userCoords?: [number, number] | null;
  onClose: () => void;
  onRouteCalculated?: (route: InAppRouteResult | null) => void;
  onClearRoute?: () => void;
}

const CATEGORY_META: Record<
  string,
  { label: string; bg: string; icon: string }
> = {
  auditorium: { label: 'Auditoriums & Halls', bg: '#8b5cf6', icon: 'landmark' },
  hostel: { label: 'Hostels & Living', bg: '#059669', icon: 'home' },
  academic: { label: 'Academic & Research', bg: '#2563eb', icon: 'academic' },
  dining: { label: 'Dining & Canteens', bg: '#ea580c', icon: 'dining' },
  sports: { label: 'Sports & Grounds', bg: '#0284c7', icon: 'sports' },
  admin: { label: 'Administration', bg: '#dc2626', icon: 'admin' },
  facility: { label: 'Facilities & Services', bg: '#475569', icon: 'facility' },
  gate: { label: 'Campus Gates', bg: '#d97706', icon: 'gate' },
  other: { label: 'Campus Locations', bg: '#64748b', icon: 'pin' },
};

function normalizeCategory(category: string): string {
  const cat = category.toLowerCase().trim();
  if (cat.includes('auditorium') || cat.includes('hall')) return 'auditorium';
  if (cat.includes('hostel')) return 'hostel';
  if (cat.includes('academic') || cat.includes('research') || cat.includes('dept')) return 'academic';
  if (cat.includes('dining') || cat.includes('canteen') || cat.includes('food')) return 'dining';
  if (cat.includes('sport') || cat.includes('ground') || cat.includes('gym')) return 'sports';
  if (cat.includes('admin') || cat.includes('office')) return 'admin';
  if (cat.includes('gate') || cat.includes('entry')) return 'gate';
  if (cat.includes('facility') || cat.includes('bank') || cat.includes('clinic')) return 'facility';
  return 'other';
}

export default function PlaceDetailPanel({
  location,
  allLocations,
  userCoords,
  onClose,
  onRouteCalculated,
  onClearRoute,
}: PlaceDetailPanelProps) {
  const [hallDetails, setHallDetails] = useState<HallVenueDetails | null>(null);
  const [loadingHall, setLoadingHall] = useState(false);
  const [hallFetchError, setHallFetchError] = useState<string | null>(null);

  // In-app Directions routing
  const [showDirections, setShowDirections] = useState(false);
  const [startPointId, setStartPointId] = useState<string>('default_gate');
  const [isSwapped, setIsSwapped] = useState(false);
  const [routeResult, setRouteResult] = useState<InAppRouteResult | null>(null);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);

  const categoryMeta = CATEGORY_META[normalizeCategory(location.category)] || CATEGORY_META.other;

  // Campus main gate (P002) default fallback start
  const defaultGateLoc = useMemo(
    () => allLocations.find((l) => l.id === 'P002') || allLocations[0],
    [allLocations]
  );

  // GPS validity inside campus
  const gpsValid = useMemo(() => {
    if (!userCoords) return false;
    return isWithinCampusBounds(userCoords[0], userCoords[1]);
  }, [userCoords]);

  // Set default start point on mount or userCoords update
  useEffect(() => {
    if (gpsValid) {
      setStartPointId('gps');
    } else {
      setStartPointId(defaultGateLoc?.id || 'P002');
    }
  }, [gpsValid, defaultGateLoc]);

  // Load hall details whenever location changes
  useEffect(() => {
    let active = true;
    const isHall =
      location.category.toLowerCase().includes('auditorium') ||
      location.category.toLowerCase().includes('hall') ||
      location.id === 'P008';

    if (isHall) {
      setLoadingHall(true);
      setHallFetchError(null);
      getHallDetailsForLocation(location.id)
        .then((details) => {
          if (!active) return;
          setHallDetails(details);
        })
        .catch((err) => {
          if (!active) return;
          console.error('[PlaceDetailPanel] Failed to fetch hall details:', err);
          setHallFetchError('Could not load hall schedule at this time.');
        })
        .finally(() => {
          if (active) setLoadingHall(false);
        });
    } else {
      setHallDetails(null);
      setLoadingHall(false);
    }

    // Reset routing states
    setShowDirections(false);
    setRouteResult(null);
    setRouteNotice(null);
    setIsSwapped(false);

    return () => {
      active = false;
    };
  }, [location.id, location.category]);

  // Execute in-app route calculation
  const handleCalculateRoute = () => {
    setRouteNotice(null);

    // Determine actual start & destination based on swap state
    let originLat: number;
    let originLng: number;
    let destLat: number = location.lat;
    let destLng: number = location.lng;
    let destName: string = location.name;

    if (startPointId === 'gps') {
      if (!userCoords) {
        setRouteNotice('GPS access not granted. Defaulting to Campus Main Gate.');
        originLat = defaultGateLoc.lat;
        originLng = defaultGateLoc.lng;
      } else if (!isWithinCampusBounds(userCoords[0], userCoords[1])) {
        setRouteNotice('You are currently outside campus. Starting from Campus Main Gate.');
        originLat = defaultGateLoc.lat;
        originLng = defaultGateLoc.lng;
      } else {
        [originLat, originLng] = userCoords;
      }
    } else {
      const startLoc = allLocations.find((l) => l.id === startPointId) || defaultGateLoc;
      originLat = startLoc.lat;
      originLng = startLoc.lng;
    }

    // If swapped, reverse origin and destination
    if (isSwapped) {
      const tempLat = originLat;
      const tempLng = originLng;
      originLat = destLat;
      originLng = destLng;
      destLat = tempLat;
      destLng = tempLng;
      destName = startPointId === 'gps' ? 'Your Location' : (allLocations.find((l) => l.id === startPointId)?.name || 'Start Point');
    }

    const result = calculateInAppRoute(
      originLat,
      originLng,
      destLat,
      destLng,
      destName,
      hallDetails?.upcoming_events
    );

    setRouteResult(result);
    onRouteCalculated?.(result);
  };

  const handleClearRoute = () => {
    setRouteResult(null);
    setRouteNotice(null);
    onRouteCalculated?.(null);
    onClearRoute?.();
  };

  const handleSwap = () => {
    setIsSwapped((prev) => !prev);
    // Re-calculate route if already showing
    if (routeResult) {
      setTimeout(() => handleCalculateRoute(), 50);
    }
  };

  return (
    <aside
      aria-label="Location details"
      className="relative z-20 w-full md:w-[390px] max-h-[60vh] md:max-h-full bg-white border-t md:border-t-0 md:border-r border-neutral-200 shadow-2xl flex flex-col overflow-y-auto animate-in fade-in duration-200"
    >
      {/* Mobile drag bar */}
      <div className="w-10 h-1 bg-neutral-300 rounded-full mx-auto mt-2 mb-1 md:hidden" />

      {/* Panel Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md px-5 py-4 border-b border-neutral-100 flex items-start justify-between z-10">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700">
              {location.id}
            </span>
            <span
              className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md"
              style={{
                backgroundColor: `${categoryMeta.bg}15`,
                color: categoryMeta.bg,
              }}
            >
              {categoryMeta.label}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                location.accuracy === 'verified'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {location.accuracy === 'verified' ? 'Verified' : 'Approximate'}
            </span>
          </div>

          <h2 className="text-base font-bold text-neutral-900 leading-tight truncate">
            {location.name}
          </h2>
        </div>

        <button
          onClick={onClose}
          aria-label="Close location panel"
          className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-4 flex-1">
        {/* Aliases */}
        {location.aliases && location.aliases.length > 0 && (
          <div className="text-xs text-neutral-500">
            <span className="font-semibold text-neutral-700">Also known as: </span>
            {location.aliases.join(', ')}
          </div>
        )}

        {/* Coordinates */}
        <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/60 font-mono">
          <span className="text-neutral-500 font-sans text-xs">Coordinates</span>
          <span className="text-neutral-800">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </span>
        </div>

        {/* Hall Details & Live Status */}
        {loadingHall ? (
          <div className="p-4 rounded-xl border border-neutral-200 animate-pulse space-y-2">
            <div className="h-4 bg-neutral-200 rounded w-1/3"></div>
            <div className="h-3 bg-neutral-200 rounded w-2/3"></div>
          </div>
        ) : hallFetchError ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            {hallFetchError}
          </div>
        ) : hallDetails ? (
          <div className="space-y-4">
            {/* Live Hall Status Card */}
            <div
              className={`p-4 rounded-2xl border space-y-2.5 ${
                hallDetails.live_status === 'in_session'
                  ? 'bg-red-50/80 border-red-200 text-red-950'
                  : hallDetails.live_status === 'reserved_soon'
                  ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                  {hallDetails.live_status === 'in_session' ? (
                    <>
                      <PlayCircle className="w-4 h-4 text-red-600" />
                      <span>In Session Now</span>
                    </>
                  ) : hallDetails.live_status === 'reserved_soon' ? (
                    <>
                      <Hourglass className="w-4 h-4 text-amber-600" />
                      <span>Reserved Soon (&lt;1h)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Available Now</span>
                    </>
                  )}
                </span>

                <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/80 shadow-xs border border-neutral-200">
                  <Users className="w-3.5 h-3.5" />
                  {hallDetails.capacity} seats
                </span>
              </div>

              {hallDetails.location && (
                <p className="text-xs opacity-80">{hallDetails.location}</p>
              )}
            </div>

            {/* Upcoming Approved Events */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center justify-between">
                <span>Upcoming Approved Events</span>
                <span className="text-[11px] font-semibold text-neutral-400">
                  ({hallDetails.upcoming_events.length})
                </span>
              </h3>

              {hallDetails.upcoming_events.length === 0 ? (
                <div className="text-center py-4 px-3 rounded-xl border border-dashed border-neutral-200 text-neutral-500 text-xs">
                  <Calendar className="w-4 h-4 mx-auto mb-1 text-neutral-400 opacity-60" />
                  No approved events currently scheduled in this venue.
                </div>
              ) : (
                <div className="space-y-2">
                  {hallDetails.upcoming_events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl border border-neutral-200 bg-white hover:border-neutral-300 shadow-xs transition-all space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-neutral-900 leading-tight">
                          {ev.title}
                        </h4>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                          Approved
                        </span>
                      </div>

                      <div className="text-[11px] text-neutral-600">
                        <span className="font-semibold">{ev.club_or_dept}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100">
                        <span className="flex items-center gap-1 font-mono text-[10px]">
                          <Clock className="w-3 h-3 text-neutral-400" />
                          {new Date(ev.start_time).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {', '}
                          {new Date(ev.start_time).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        <Link
                          href="/events"
                          className="text-blue-600 font-bold hover:underline flex items-center text-[10px]"
                        >
                          Details &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* IN-APP DIRECTIONS SECTION */}
        <div className="pt-2 border-t border-neutral-100 space-y-3">
          <button
            type="button"
            onClick={() => {
              const nextState = !showDirections;
              setShowDirections(nextState);
              if (nextState) {
                setTimeout(() => handleCalculateRoute(), 50);
              } else {
                handleClearRoute();
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs transition-all shadow-md active:scale-98"
          >
            <Navigation className="w-3.5 h-3.5" />
            {showDirections ? 'Close Directions' : 'Directions to Venue'}
          </button>

          {/* Directions Routing Drawer */}
          {showDirections && (
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/90 space-y-3 animate-in fade-in duration-150">
              {/* Origin & Destination with Swap button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-neutral-600">
                    {isSwapped ? 'From (Destination):' : 'Start Point:'}
                  </span>
                  <button
                    type="button"
                    onClick={handleSwap}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 transition-colors"
                    title="Swap start and destination"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>Swap</span>
                  </button>
                </div>

                {!isSwapped ? (
                  <select
                    value={startPointId}
                    onChange={(e) => {
                      setStartPointId(e.target.value);
                      setTimeout(() => handleCalculateRoute(), 50);
                    }}
                    className="w-full p-2 text-xs rounded-xl bg-white border border-neutral-200 text-neutral-800 font-medium focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
                  >
                    <option value="gps">
                      📍 My GPS Location {gpsValid ? '(Inside Campus)' : '(Unavailable / Outside)'}
                    </option>
                    {allLocations
                      .filter((l) => l.id !== location.id)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          🏢 {l.name} ({l.id})
                        </option>
                      ))}
                  </select>
                ) : (
                  <div className="p-2 text-xs rounded-xl bg-white border border-neutral-200 text-neutral-800 font-semibold truncate">
                    🏢 {location.name}
                  </div>
                )}

                <div className="pt-1">
                  <span className="text-[11px] font-bold text-neutral-600">
                    {isSwapped ? 'To (Start):' : 'Destination:'}
                  </span>
                  <div className="mt-1 p-2 text-xs rounded-xl bg-white border border-neutral-200 text-neutral-800 font-semibold truncate flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="truncate">
                      {isSwapped
                        ? (startPointId === 'gps' ? '📍 My Current Location' : (allLocations.find((l) => l.id === startPointId)?.name || 'Start Point'))
                        : `🏢 ${location.name}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recalculate Button */}
              <button
                type="button"
                onClick={handleCalculateRoute}
                className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Update Walking Route</span>
              </button>

              {/* Informational Notice */}
              {routeNotice && (
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs border border-amber-200 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>{routeNotice}</span>
                </div>
              )}

              {/* Route Summary Card */}
              {routeResult && (
                <div className="space-y-3 pt-2 border-t border-neutral-200 text-xs">
                  {/* Distance & Walking Time */}
                  <div className="bg-white p-3 rounded-xl border border-neutral-200/90 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 flex items-center gap-1">
                        <Footprints className="w-3.5 h-3.5 text-blue-600" />
                        Walking Distance
                      </span>
                      <span className="font-bold text-neutral-900">{routeResult.distance_label}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        Estimated Time (1.3 m/s)
                      </span>
                      <span className="font-bold text-neutral-900">{routeResult.duration_label}</span>
                    </div>

                    {/* Leave By Alert if Event Starts Today */}
                    {routeResult.leave_by && (
                      <div className="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>
                          Leave by <b className="font-bold">{routeResult.leave_by}</b> to arrive on time
                          {routeResult.leave_by_event && ` for "${routeResult.leave_by_event}"`}
                        </span>
                      </div>
                    )}

                    {/* Disconnected Gap Notice */}
                    {routeResult.is_fallback && (
                      <div className="mt-1.5 p-2 rounded-lg bg-neutral-100 text-[11px] text-neutral-600 italic border border-neutral-200">
                        {routeResult.fallback_reason || 'Approximate straight-line distance (no mapped walking path)'}
                      </div>
                    )}
                  </div>

                  {/* Step List from turns */}
                  {routeResult.steps.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Turn-by-turn Steps
                      </h4>
                      <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100 max-h-48 overflow-y-auto">
                        {routeResult.steps.map((st, i) => (
                          <div key={i} className="p-2.5 flex items-start gap-2.5 text-xs text-neutral-800">
                            <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-neutral-900 leading-snug">{st.instruction}</p>
                              {st.distance_m > 0 && (
                                <p className="text-[10px] text-neutral-400 mt-0.5">{st.distance_m} m</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clear Route Button */}
                  <button
                    type="button"
                    onClick={handleClearRoute}
                    className="w-full py-1.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Route</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
