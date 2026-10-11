'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CampusLocation } from '@/lib/types';
import {
  HallLiveStatus,
  getAllHallsLiveStatus,
} from '@/lib/map-service';
import { InAppRouteResult } from '@/lib/campus-routing';
import PlaceDetailPanel from '@/components/map/PlaceDetailPanel';
import {
  Search,
  X,
  AlertCircle,
} from 'lucide-react';

// Center of Amrita Coimbatore Campus
const CAMPUS_CENTER: [number, number] = [10.9008, 76.9025];
const DEFAULT_ZOOM = 16;

interface CampusMap2DProps {
  locations: CampusLocation[];
  initialPlaceId?: string | null;
  onSelectPlace?: (placeId: string | null) => void;
  locateTrigger?: number;
  resetTrigger?: number;
  activeRoute?: InAppRouteResult | null;
  onRouteChange?: (route: InAppRouteResult | null) => void;
}

// Category display labels and priority order
const CATEGORY_META: Record<
  string,
  { label: string; bg: string; icon: string; order: number }
> = {
  auditorium: { label: 'Auditoriums & Halls', bg: '#8b5cf6', icon: 'landmark', order: 1 },
  hostel: { label: 'Hostels & Living', bg: '#059669', icon: 'home', order: 2 },
  academic: { label: 'Academic & Research', bg: '#2563eb', icon: 'academic', order: 3 },
  dining: { label: 'Dining & Canteens', bg: '#ea580c', icon: 'dining', order: 4 },
  sports: { label: 'Sports & Grounds', bg: '#0284c7', icon: 'sports', order: 5 },
  admin: { label: 'Administration', bg: '#dc2626', icon: 'admin', order: 6 },
  facility: { label: 'Facilities & Services', bg: '#475569', icon: 'facility', order: 7 },
  gate: { label: 'Campus Gates', bg: '#d97706', icon: 'gate', order: 8 },
  other: { label: 'Campus Locations', bg: '#64748b', icon: 'pin', order: 9 },
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

function getCategoryMeta(category: string) {
  const norm = normalizeCategory(category);
  return CATEGORY_META[norm] || CATEGORY_META.other;
}

// SVG icon strings for Leaflet markers
function getCategoryIconSvg(iconType: string, color: string = '#ffffff'): string {
  switch (iconType) {
    case 'landmark':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    case 'academic':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`;
    case 'home':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/></svg>`;
    case 'dining':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"/><path d="M15 2v19"/><path d="M5 2v7a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2"/><path d="M8 2v19"/></svg>`;
    case 'sports':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
    case 'admin':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    case 'gate':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;
    default:
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`;
  }
}

// Marker Icon Factory
function createMarkerIcon(
  loc: CampusLocation,
  isSelected: boolean,
  hallStatus?: HallLiveStatus,
  showLabel: boolean = false
) {
  const meta = getCategoryMeta(loc.category);
  const isHall = meta.icon === 'landmark' || loc.id === 'P008';

  let markerBg = meta.bg;
  if (isHall && hallStatus) {
    if (hallStatus === 'in_session') markerBg = '#ef4444';
    else if (hallStatus === 'reserved_soon') markerBg = '#f59e0b';
    else markerBg = '#10b981';
  }

  const iconSvg = getCategoryIconSvg(meta.icon, '#ffffff');
  const size = isSelected ? 38 : 30;
  const shadow = isSelected
    ? '0 0 0 5px rgba(220, 38, 38, 0.35), 0 4px 12px rgba(0,0,0,0.35)'
    : '0 2px 6px rgba(0,0,0,0.3)';

  const labelHtml = showLabel
    ? `<div style="
        position: absolute;
        bottom: -22px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.9);
        color: #ffffff;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      ">${loc.name}</div>`
    : '';

  const html = `
    <div style="position: relative; width: ${size}px; height: ${size}px;">
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${isSelected ? '#dc2626' : markerBg};
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: ${shadow};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s ease;
        transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
      ">
        ${iconSvg}
      </div>
      ${labelHtml}
    </div>
  `;

  return L.divIcon({
    className: 'custom-campus-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createGpsUserIcon() {
  const html = `
    <div style="position: relative; width: 24px; height: 24px;">
      <div style="
        position: absolute;
        width: 24px;
        height: 24px;
        background: rgba(37, 99, 235, 0.25);
        border-radius: 50%;
        animation: pulseRadar 2s infinite ease-out;
      "></div>
      <div style="
        position: absolute;
        top: 4px;
        left: 4px;
        width: 16px;
        height: 16px;
        background: #2563eb;
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      "></div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-gps-marker',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function CampusMap2D({
  locations,
  initialPlaceId,
  onSelectPlace,
  locateTrigger,
  resetTrigger,
  activeRoute,
  onRouteChange,
}: CampusMap2DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const userGpsMarkerRef = useRef<L.Marker | null>(null);

  // State
  const [selectedLocation, setSelectedLocation] = useState<CampusLocation | null>(null);
  const [hallsLiveStatus, setHallsLiveStatus] = useState<Record<string, HallLiveStatus>>({});

  // Search & Suggestions
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number>(-1);
  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_ZOOM);

  // GPS
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Fetch hall live statuses on mount
  useEffect(() => {
    let active = true;
    getAllHallsLiveStatus()
      .then((map) => {
        if (active) setHallsLiveStatus(map);
      })
      .catch((e) => console.warn('Halls status fetch error:', e));
    return () => {
      active = false;
    };
  }, []);

  // Category filters with counts
  const categoryFilters = useMemo(() => {
    const counts: Record<string, number> = {};
    locations.forEach((loc) => {
      const norm = normalizeCategory(loc.category);
      counts[norm] = (counts[norm] || 0) + 1;
    });

    const list = Object.keys(CATEGORY_META)
      .filter((k) => counts[k] && counts[k] > 0)
      .sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order)
      .map((k) => ({
        id: k,
        label: CATEGORY_META[k].label,
        count: counts[k],
      }));

    return [{ id: 'all', label: 'All Places', count: locations.length }, ...list];
  }, [locations]);

  // Autocomplete search suggestions
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    return locations
      .filter((loc) => {
        const matchName = loc.name.toLowerCase().includes(q);
        const matchId = loc.id.toLowerCase().includes(q);
        const matchCategory = loc.category.toLowerCase().includes(q);
        const matchAlias = loc.aliases?.some((a) => a.toLowerCase().includes(q));
        return matchName || matchId || matchCategory || matchAlias;
      })
      .slice(0, 8);
  }, [locations, searchQuery]);

  // Filtered locations
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      if (selectedCategory !== 'all') {
        const norm = normalizeCategory(loc.category);
        if (norm !== selectedCategory) return false;
      }
      return true;
    });
  }, [locations, selectedCategory]);

  // Handle location selection
  const selectLocation = useCallback(
    (loc: CampusLocation | null, updateUrl = true) => {
      setSelectedLocation(loc);
      setSearchFocused(false);
      setMobileSearchOpen(false);

      if (updateUrl) {
        onSelectPlace?.(loc ? loc.id : null);
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          if (loc) {
            url.searchParams.set('place', loc.id);
          } else {
            url.searchParams.delete('place');
          }
          window.history.replaceState({}, '', url.toString());
        }
      }

      if (loc && mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([loc.lat, loc.lng], 18, {
          duration: 1.0,
        });
      }
    },
    [onSelectPlace]
  );

  // Initialize Map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if ((container as any)._leaflet_id != null) {
      delete (container as any)._leaflet_id;
    }

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        console.warn('Map cleanup error:', e);
      }
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(container, {
        center: CAMPUS_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Bottom-right zoom control
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;

      const routeGroup = L.layerGroup().addTo(map);
      routeLayerGroupRef.current = routeGroup;

      mapInstanceRef.current = map;

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      const timer = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 200);

      return () => {
        clearTimeout(timer);
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (e) {
            console.warn('Map unmount cleanup error:', e);
          }
          mapInstanceRef.current = null;
        }
        if (container) {
          delete (container as any)._leaflet_id;
        }
      };
    } catch (err) {
      console.error('[CampusMap2D] Failed to initialize Leaflet map:', err);
    }
  }, []);

  // Update Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    filteredLocations.forEach((loc) => {
      if (
        typeof loc.lat !== 'number' ||
        typeof loc.lng !== 'number' ||
        isNaN(loc.lat) ||
        isNaN(loc.lng)
      ) {
        return;
      }

      const isSelected = selectedLocation?.id === loc.id;
      const hallStatus = hallsLiveStatus[loc.id];
      const showPermanentLabel = isSelected || currentZoom >= 17;

      const marker = L.marker([loc.lat, loc.lng], {
        icon: createMarkerIcon(loc, isSelected, hallStatus, showPermanentLabel),
        title: loc.name,
        zIndexOffset: isSelected ? 1000 : 0,
      });

      marker.on('click', () => {
        selectLocation(loc);
      });

      if (!showPermanentLabel) {
        marker.bindTooltip(
          `<div class="font-medium text-xs"><b>${loc.name}</b><br/><span class="text-neutral-500 capitalize">${loc.category}</span></div>`,
          { direction: 'top', offset: [0, -14], opacity: 0.95 }
        );
      }

      marker.addTo(markersLayerRef.current!);
    });
  }, [filteredLocations, selectedLocation, hallsLiveStatus, currentZoom, selectLocation]);

  // Initial place deep link
  useEffect(() => {
    if (!initialPlaceId || locations.length === 0) return;
    const found = locations.find(
      (l) => l.id.toLowerCase() === initialPlaceId.trim().toLowerCase()
    );
    if (found) {
      selectLocation(found, false);
    }
  }, [initialPlaceId, locations, selectLocation]);

  // Route Rendering on Map (bold blue with white outline, start/end markers)
  const drawRouteOnMap = useCallback((route: InAppRouteResult | null) => {
    if (!mapInstanceRef.current || !routeLayerGroupRef.current) return;

    routeLayerGroupRef.current.clearLayers();

    if (!route || route.coordinates.length === 0) return;

    if (route.is_fallback) {
      // Dashed straight-line estimate
      const dashed = L.polyline(route.coordinates, {
        color: '#2563eb',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.9,
      });
      routeLayerGroupRef.current.addLayer(dashed);
    } else {
      // Bold blue line with a white outline
      const outline = L.polyline(route.coordinates, {
        color: '#ffffff',
        weight: 9,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      });
      const innerLine = L.polyline(route.coordinates, {
        color: '#2563eb',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      });
      routeLayerGroupRef.current.addLayer(outline);
      routeLayerGroupRef.current.addLayer(innerLine);
    }

    // Start marker (A)
    const startCoord = route.coordinates[0];
    const startIcon = L.divIcon({
      className: 'route-marker-start',
      html: `<div style="width: 22px; height: 22px; background: #16a34a; border: 2px solid #ffffff; border-radius: 50%; color: #ffffff; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">A</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const startMarker = L.marker(startCoord, { icon: startIcon, zIndexOffset: 2000 });
    routeLayerGroupRef.current.addLayer(startMarker);

    // End marker (B)
    const endCoord = route.coordinates[route.coordinates.length - 1];
    const endIcon = L.divIcon({
      className: 'route-marker-end',
      html: `<div style="width: 22px; height: 22px; background: #dc2626; border: 2px solid #ffffff; border-radius: 50%; color: #ffffff; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">B</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const endMarker = L.marker(endCoord, { icon: endIcon, zIndexOffset: 2000 });
    routeLayerGroupRef.current.addLayer(endMarker);

    const bounds = L.latLngBounds(route.coordinates);
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
  }, []);

  // Sync external route prop
  useEffect(() => {
    drawRouteOnMap(activeRoute || null);
  }, [activeRoute, drawRouteOnMap]);

  // Keyboard navigation for search suggestions
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIdx((prev) => (prev < searchSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIdx((prev) => (prev > 0 ? prev - 1 : searchSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIdx >= 0 && activeSuggestionIdx < searchSuggestions.length) {
        selectLocation(searchSuggestions[activeSuggestionIdx]);
      } else if (searchSuggestions.length > 0) {
        selectLocation(searchSuggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setSearchFocused(false);
      setMobileSearchOpen(false);
    }
  };

  // GPS Locate User
  const handleLocateMe = useCallback(() => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserCoords(coords);

        if (mapInstanceRef.current) {
          if (userGpsMarkerRef.current) {
            userGpsMarkerRef.current.setLatLng(coords);
          } else {
            const gpsMarker = L.marker(coords, {
              icon: createGpsUserIcon(),
              title: 'Your Location',
              zIndexOffset: 1500,
            }).addTo(mapInstanceRef.current);
            gpsMarker.bindTooltip('<b>You are here</b>', { direction: 'top', offset: [0, -10] });
            userGpsMarkerRef.current = gpsMarker;
          }

          mapInstanceRef.current.flyTo(coords, 17, { duration: 1 });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('GPS permission was denied. You can select locations from the search bar or map.');
        } else {
          setGpsError('Location information is unavailable.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }, []);

  const handleResetView = useCallback(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(CAMPUS_CENTER, DEFAULT_ZOOM, { duration: 1 });
    }
  }, []);

  // Listen to locate and reset triggers from parent
  useEffect(() => {
    if (locateTrigger && locateTrigger > 0) {
      handleLocateMe();
    }
  }, [locateTrigger, handleLocateMe]);

  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      handleResetView();
    }
  }, [resetTrigger, handleResetView]);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] min-h-[500px] flex flex-col md:flex-row overflow-hidden bg-neutral-900">
      {/* Map Canvas */}
      <div className="relative flex-1 w-full h-full min-h-[500px] z-0">
        <div
          ref={mapContainerRef}
          className="w-full h-full min-h-[500px]"
          style={{ width: '100%', height: '100%', minHeight: '500px' }}
        />

        {/* TOP-LEFT SEARCH & CATEGORY CHIPS */}
        <div className="absolute top-4 left-4 z-[1000] pointer-events-none space-y-2">
          {/* Mobile Collapsed Search Button */}
          {!mobileSearchOpen && (
            <button
              onClick={() => {
                setMobileSearchOpen(true);
                setSearchFocused(true);
              }}
              className="md:hidden pointer-events-auto w-10 h-10 rounded-2xl bg-white shadow-lg border border-neutral-200 flex items-center justify-center text-neutral-700 hover:text-neutral-900 active:scale-95 transition-all"
              aria-label="Open search"
            >
              <Search className="w-4 h-4 text-neutral-600" />
            </button>
          )}

          {/* Expanded Search Field */}
          <div
            className={`pointer-events-auto relative ${
              mobileSearchOpen
                ? 'fixed top-3 left-3 right-3 md:static md:w-[380px] z-[1100]'
                : 'hidden md:block md:w-[380px]'
            }`}
          >
            <div className="bg-white text-neutral-900 rounded-2xl shadow-xl border border-neutral-200/90 flex items-center p-1.5 focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500 transition-all">
              <Search className="w-4 h-4 text-neutral-400 ml-2.5 shrink-0" />
              <input
                type="text"
                autoFocus={mobileSearchOpen}
                placeholder="Search halls, buildings, hostels..."
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchFocused(true);
                  setActiveSuggestionIdx(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                className="w-full bg-transparent px-2.5 py-1.5 text-xs font-semibold text-neutral-900 placeholder:text-neutral-400 placeholder:font-normal focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchFocused(false);
                  }}
                  className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors mr-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {mobileSearchOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileSearchOpen(false);
                    setSearchFocused(false);
                  }}
                  className="md:hidden px-2 py-1 text-xs font-semibold text-neutral-500 hover:text-neutral-800"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {searchFocused && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100 z-50 animate-in fade-in slide-in-from-top-1 duration-150 max-h-72 overflow-y-auto">
                {searchSuggestions.map((loc, idx) => {
                  const meta = getCategoryMeta(loc.category);
                  const isHall = meta.icon === 'landmark' || loc.id === 'P008';
                  const hallStatus = hallsLiveStatus[loc.id];
                  const isHovered = activeSuggestionIdx === idx;

                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectLocation(loc);
                      }}
                      className={`w-full text-left p-3 flex items-center gap-3 transition-colors ${
                        isHovered ? 'bg-blue-50/80 text-blue-900' : 'hover:bg-neutral-50 text-neutral-800'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                        style={{ backgroundColor: meta.bg }}
                        dangerouslySetInnerHTML={{
                          __html: getCategoryIconSvg(meta.icon, '#ffffff'),
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs truncate text-neutral-900">
                            {loc.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600">
                            {loc.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500 truncate">
                          <span className="capitalize">{meta.label}</span>
                          {loc.aliases && loc.aliases.length > 0 && (
                            <span className="text-neutral-400 truncate">• {loc.aliases[0]}</span>
                          )}
                        </div>
                      </div>

                      {isHall && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            hallStatus === 'in_session'
                              ? 'bg-red-100 text-red-700'
                              : hallStatus === 'reserved_soon'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {hallStatus === 'in_session'
                            ? 'In Use'
                            : hallStatus === 'reserved_soon'
                            ? 'Reserved Soon'
                            : 'Available'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Horizontally Scrollable Category Chips */}
          <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 max-w-[calc(100vw-32px)] md:max-w-[440px] no-scrollbar">
            {categoryFilters.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl whitespace-nowrap shadow-sm border transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-md scale-[1.02]'
                      : 'bg-white/95 text-neutral-700 border-neutral-200/90 hover:bg-neutral-50 hover:border-neutral-300'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTTOM-LEFT HALL & ROUTE STATUS LEGEND */}
        <div className="absolute bottom-6 left-4 z-[1000] pointer-events-none hidden sm:block">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-neutral-200/80 px-3.5 py-2 flex items-center gap-3 text-[11px] font-semibold text-neutral-700">
            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Halls:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs" />
              Reserved &lt;1h
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-xs" />
              In Session
            </span>
            <span className="text-neutral-300">|</span>
            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Route:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 rounded-full bg-blue-600 shadow-xs" />
              Walking Path
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-b-2 border-dashed border-blue-600" />
              Straight Line
            </span>
          </div>
        </div>

        {/* GPS Permission Warning Banner */}
        {gpsError && (
          <div className="absolute bottom-6 left-4 right-4 md:left-4 md:right-auto md:max-w-md z-[1000] bg-amber-600 text-white backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl flex items-start gap-3 border border-amber-500">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs leading-relaxed">
              <p className="font-semibold mb-0.5">Location Notice</p>
              <p>{gpsError}</p>
            </div>
            <button
              onClick={() => setGpsError(null)}
              className="p-1 hover:bg-amber-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* SELECTED LOCATION PANEL (Desktop: Left Sidebar; Mobile: Bottom Sheet) */}
      {selectedLocation && (
        <PlaceDetailPanel
          location={selectedLocation}
          allLocations={locations}
          userCoords={userCoords}
          onClose={() => selectLocation(null)}
          onRouteCalculated={(route) => {
            onRouteChange?.(route);
            drawRouteOnMap(route);
          }}
          onClearRoute={() => {
            onRouteChange?.(null);
            drawRouteOnMap(null);
          }}
        />
      )}
    </div>
  );
}
