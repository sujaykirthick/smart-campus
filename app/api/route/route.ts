import { NextRequest, NextResponse } from 'next/server';

interface CacheEntry {
  data: any;
  timestamp: number;
}

// In-memory cache for recent walking routes (5 minutes TTL)
const routeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Simple in-memory rate limiter per IP (max 40 requests per minute)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 40;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return false;
}

// Haversine straight-line distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Decode Valhalla's polyline6 encoded string to [lat, lng][]
function decodePolyline6(encoded: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];
  const factor = 1e6;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'anonymous';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a moment.' },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  let startLat = parseFloat(searchParams.get('start_lat') || '');
  let startLng = parseFloat(searchParams.get('start_lng') || '');
  let endLat = parseFloat(searchParams.get('end_lat') || '');
  let endLng = parseFloat(searchParams.get('end_lng') || '');

  if (startParam && startParam.includes(',')) {
    const [lat, lng] = startParam.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lng)) {
      startLat = lat;
      startLng = lng;
    }
  }

  if (endParam && endParam.includes(',')) {
    const [lat, lng] = endParam.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lng)) {
      endLat = lat;
      endLng = lng;
    }
  }

  if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
    return NextResponse.json(
      { error: 'Missing or invalid start/end coordinates' },
      { status: 400 }
    );
  }


  // Check cache
  const cacheKey = `${startLat.toFixed(5)},${startLng.toFixed(5)}->${endLat.toFixed(5)},${endLng.toFixed(5)}`;
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // Attempt Valhalla routing proxy with 6 second timeout
  try {
    const valhallaPayload = {
      locations: [
        { lat: startLat, lon: startLng },
        { lat: endLat, lon: endLng },
      ],
      costing: 'pedestrian',
      costing_options: {
        pedestrian: {
          walking_speed: 4.5,
        },
      },
      directions_options: {
        units: 'kilometers',
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valhallaPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Valhalla responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    const trip = data?.trip;
    if (!trip || !trip.legs || trip.legs.length === 0) {
      throw new Error('No route found in Valhalla response');
    }

    const summary = trip.summary;
    const distanceKm = summary.length;
    const durationMin = Math.max(1, Math.round(summary.time / 60));
    const distanceMeters = Math.round(distanceKm * 1000);

    const leg = trip.legs[0];
    const coordinates = leg.shape ? decodePolyline6(leg.shape) : [[startLat, startLng], [endLat, endLng]];

    const responseData = {
      success: true,
      is_fallback: false,
      accuracy: 'approximate',
      distance_m: distanceMeters,
      distance_km: Number(distanceKm.toFixed(2)),
      distance_label: distanceMeters > 1000 ? `${distanceKm.toFixed(2)} km` : `${distanceMeters} m`,
      duration_min: durationMin,
      duration_label: `${durationMin} min`,
      coordinates,
    };

    routeCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    return NextResponse.json(responseData);
  } catch (err: any) {
    // Fallback: Haversine straight-line distance & time estimation
    const distanceMeters = Math.round(haversineDistance(startLat, startLng, endLat, endLng));
    const distanceKm = distanceMeters / 1000;
    // Estimated walk speed: ~75 meters/min (4.5 km/h)
    const durationMin = Math.max(1, Math.round(distanceMeters / 75));

    const fallbackData = {
      success: true,
      is_fallback: true,
      fallback_reason: err?.name === 'AbortError' ? 'Campus routing service timed out' : 'Campus routing fallback',
      accuracy: 'approximate',
      distance_m: distanceMeters,
      distance_km: Number(distanceKm.toFixed(2)),
      distance_label: `~${distanceMeters} m (straight line)`,
      duration_min: durationMin,
      duration_label: `~${durationMin} min`,
      coordinates: [
        [startLat, startLng],
        [endLat, endLng],
      ],
    };

    return NextResponse.json(fallbackData);
  }
}
