import { CampusLocation, Hall } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import locationsData from '@/data/campus-locations.json';

export type HallLiveStatus = 'available' | 'reserved_soon' | 'in_session';

export interface HallEventSummary {
  id: string;
  title: string;
  club_or_dept: string;
  start_time: string;
  end_time: string;
  status: string;
}

export interface HallVenueDetails {
  id: string;
  name: string;
  capacity: number;
  location: string | null;
  location_id?: string | null;
  live_status: HallLiveStatus;
  upcoming_events: HallEventSummary[];
}

export function computeHallLiveStatus(events: HallEventSummary[]): HallLiveStatus {
  const now = Date.now();
  for (const ev of events) {
    const start = new Date(ev.start_time).getTime();
    const end = new Date(ev.end_time).getTime();
    if (now >= start && now <= end) {
      return 'in_session';
    }
  }
  for (const ev of events) {
    const start = new Date(ev.start_time).getTime();
    if (start > now && start <= now + 60 * 60 * 1000) {
      return 'reserved_soon';
    }
  }
  return 'available';
}

export function getCampusLocations(): CampusLocation[] {
  return locationsData as CampusLocation[];
}

export function getLocationById(id: string): CampusLocation | undefined {
  const locations = getCampusLocations();
  return locations.find((l) => l.id.toLowerCase() === id.trim().toLowerCase());
}

/**
 * Fetch hall information and upcoming approved events from Supabase.
 * Uses explicit foreign-key embed `events:events!events_hall_id_fkey`.
 * Ensures only `approved` events and strictly excludes student/organizer emails.
 */
export async function getHallDetailsForLocation(locationId: string): Promise<HallVenueDetails | null> {
  const loc = getLocationById(locationId);
  if (!loc) return null;

  try {
    const supabase = createClient();
    // 1. Try querying by location_id first
    let halls: any[] | null = null;
    const res = await supabase
      .from('halls')
      .select('id, name, capacity, location, location_id, events:events!events_hall_id_fkey(id, title, club_or_dept, start_time, end_time, status)')
      .eq('location_id', loc.id);

    if (!res.error && res.data && res.data.length > 0) {
      halls = res.data;
    } else {
      // If location_id column doesn't exist yet in remote schema or returned empty, try matching by name or aliases
      const candidateNames = [loc.name, ...(loc.aliases || [])].map((n) => n.trim().toLowerCase());
      
      const { data: allHalls, error: allHallsErr } = await supabase
        .from('halls')
        .select('id, name, capacity, location, events:events!events_hall_id_fkey(id, title, club_or_dept, start_time, end_time, status)');

      if (allHallsErr || !allHalls) {
        console.warn('Failed to fetch halls:', allHallsErr?.message);
        return null;
      }

      halls = allHalls.filter((h: any) => candidateNames.includes(h.name.trim().toLowerCase()));
    }

    if (!halls || halls.length === 0) {
      return null;
    }

    const hall = halls[0];
    const now = new Date().toISOString();

    // Filter strictly for approved events and sort by start_time
    const eventsRaw = (hall.events as any[]) || [];
    const upcomingEvents: HallEventSummary[] = eventsRaw
      .filter((e) => e && e.status === 'approved' && e.end_time >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((e) => ({
        id: e.id,
        title: e.title,
        club_or_dept: e.club_or_dept,
        start_time: e.start_time,
        end_time: e.end_time,
        status: e.status,
      }));

    return {
      id: hall.id,
      name: hall.name,
      capacity: hall.capacity,
      location: hall.location,
      location_id: (hall as any).location_id || loc.id,
      live_status: computeHallLiveStatus(upcomingEvents),
      upcoming_events: upcomingEvents,
    };
  } catch (err) {
    console.error('Error fetching hall venue details:', err);
    return null;
  }
}

/**
 * Fetch live status of all campus halls in a single query.
 * Returns a map of location_id -> { status: 'available' | 'reserved_soon' | 'in_session', hallName: string }
 */
export async function getAllHallsLiveStatus(): Promise<Record<string, HallLiveStatus>> {
  try {
    const supabase = createClient();
    const { data: allHalls, error } = await supabase
      .from('halls')
      .select('id, name, location_id, events:events!events_hall_id_fkey(id, title, club_or_dept, start_time, end_time, status)');

    if (error || !allHalls) return {};

    const statusMap: Record<string, HallLiveStatus> = {};
    const now = new Date().toISOString();

    for (const h of allHalls) {
      const locId = getHallLocationId(h);
      if (!locId) continue;

      const eventsRaw = (h.events as any[]) || [];
      const upcomingEvents: HallEventSummary[] = eventsRaw
        .filter((e) => e && e.status === 'approved' && e.end_time >= now)
        .map((e) => ({
          id: e.id,
          title: e.title,
          club_or_dept: e.club_or_dept,
          start_time: e.start_time,
          end_time: e.end_time,
          status: e.status,
        }));

      statusMap[locId] = computeHallLiveStatus(upcomingEvents);
    }

    return statusMap;
  } catch (e) {
    console.warn('[map-service] Error fetching halls live status:', e);
    return {};
  }
}

/**
 * Returns the matching location_id for a hall, checking hall.location_id first,
 * then falling back to matching name/aliases against data/campus-locations.json.
 */
export function getHallLocationId(hall?: { name?: string | null; location_id?: string | null } | null): string | null {
  if (!hall) return null;
  if (hall.location_id) return hall.location_id;
  if (!hall.name) return null;

  const targetName = hall.name.trim().toLowerCase();
  const locations = getCampusLocations();

  const match = locations.find((l) => {
    if (l.name.trim().toLowerCase() === targetName) return true;
    if (l.aliases && l.aliases.some((a) => a.trim().toLowerCase() === targetName)) return true;
    return false;
  });

  return match ? match.id : null;
}

export interface WalkingRouteResult {
  success: boolean;
  is_fallback: boolean;
  fallback_reason?: string;
  accuracy: string;
  distance_m: number;
  distance_km: number;
  distance_label: string;
  duration_min: number;
  duration_label: string;
  coordinates: [number, number][];
}

export async function calculateWalkingRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<WalkingRouteResult> {
  const url = `/api/route?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok && !data.coordinates) {
    throw new Error(data.fallback_reason || 'Routing request failed');
  }
  return data;
}


