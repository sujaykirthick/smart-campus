'use client';

import React, { Suspense, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { getCampusLocations } from '@/lib/map-service';
import MapErrorBoundary from '@/components/map/MapErrorBoundary';
import { Map, Box, AlertCircle, RefreshCw, Compass, RotateCcw } from 'lucide-react';
import { InAppRouteResult } from '@/lib/campus-routing';
import 'leaflet/dist/leaflet.css';

// Dynamic import with SSR disabled for Leaflet 2D map
const CampusMap2D = dynamic(
  () =>
    import('@/components/map/CampusMap2D').catch((err) => {
      console.error('[MapPage] Failed to dynamically load CampusMap2D:', err);
      return function FailedMapLoad() {
        return (
          <div className="w-full h-[calc(100vh-64px)] min-h-[500px] bg-neutral-900 flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="p-4 rounded-2xl bg-red-950/60 border border-red-800/80 max-w-md space-y-3">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
              <h3 className="text-base font-bold text-red-200">Failed to load Map Module</h3>
              <p className="text-xs text-neutral-300">
                {err?.message || 'A network error occurred while downloading the map component.'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
              >
                Reload Page
              </button>
            </div>
          </div>
        );
      };
    }),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[calc(100vh-64px)] min-h-[500px] bg-neutral-900 flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-center space-y-1">
          <p className="text-sm font-bold tracking-wide text-white">Loading map...</p>
          <p className="text-xs text-neutral-400">Initializing campus venues and Leaflet tiles</p>
        </div>
      </div>
    ),
  }
);

// Dynamic import for optional 3D Concept Twin (lazy-loaded on demand)
const CampusTwin3D = dynamic(
  () =>
    import('@/components/map/CampusTwin3D').catch((err) => {
      console.error('[MapPage] Failed to dynamically load CampusTwin3D:', err);
      return function Failed3DLoad() {
        return (
          <div className="w-full h-[calc(100vh-64px)] min-h-[500px] bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="p-6 rounded-3xl bg-slate-800 border border-slate-700 max-w-md space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-base font-bold text-white">3D View Unavailable</h3>
              <p className="text-xs text-slate-300">
                {err?.message || 'WebGL or 3D library failed to initialize on this device.'}
              </p>
            </div>
          </div>
        );
      };
    }),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[calc(100vh-64px)] min-h-[500px] bg-slate-100 flex flex-col items-center justify-center text-neutral-800 space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <div className="text-center space-y-1">
          <p className="text-sm font-bold tracking-wide text-neutral-900">Loading 3D Campus Twin...</p>
          <p className="text-xs text-neutral-500">Extruding real OSM building footprints and terrain</p>
        </div>
      </div>
    ),
  }
);

function MapContent() {
  const searchParams = useSearchParams();
  const initialPlace = searchParams.get('place');
  const [activeTab, setActiveTab] = useState<'2d' | '3d'>('2d');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialPlace);
  const [activeRoute, setActiveRoute] = useState<InAppRouteResult | null>(null);
  const [locateTrigger, setLocateTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Safely retrieve campus locations with error handling
  const locations = useMemo(() => {
    try {
      const locs = getCampusLocations();
      if (!Array.isArray(locs) || locs.length === 0) {
        console.warn('[MapPage] Campus locations data returned empty or not an array.');
        return [];
      }
      return locs;
    } catch (e) {
      console.error('[MapPage] Error retrieving campus locations:', e);
      return [];
    }
  }, []);

  const handleSelectPlace = (placeId: string | null) => {
    setSelectedPlaceId(placeId);
  };

  if (locations.length === 0) {
    return (
      <div className="w-full h-[calc(100vh-64px)] min-h-[500px] bg-neutral-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="p-6 rounded-2xl bg-neutral-850 border border-neutral-800 max-w-md space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="text-base font-bold text-white">Campus Locations Data Missing</h2>
          <p className="text-xs text-neutral-400">
            No valid location records found in campus-locations.json.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 mx-auto px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-semibold text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Loading Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-64px)] min-h-[500px] flex flex-col bg-neutral-900 overflow-hidden">
      {/* UNIFIED TOP-RIGHT CONTROL GROUP (2D/3D switch, Locate Me, Reset View) */}
      <div className="absolute top-4 right-4 z-[1001] flex items-center gap-1.5 pointer-events-auto">
        {/* 2D / 3D Switch Pill */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1 shadow-lg border border-neutral-200/90 flex items-center gap-1">
          <button
            onClick={() => setActiveTab('2d')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === '2d'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>2D</span>
          </button>

          <button
            onClick={() => setActiveTab('3d')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === '3d'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D</span>
          </button>
        </div>

        {/* Locate Me (GPS) */}
        <button
          onClick={() => setLocateTrigger((c) => c + 1)}
          title="Locate my position (GPS)"
          className="w-9 h-9 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-neutral-200/90 flex items-center justify-center text-neutral-700 hover:text-blue-600 hover:border-blue-300 active:scale-95 transition-all"
        >
          <Compass className="w-4 h-4" />
        </button>

        {/* Reset View */}
        <button
          onClick={() => setResetTrigger((c) => c + 1)}
          title="Reset campus view"
          className="w-9 h-9 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-neutral-200/90 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:border-neutral-300 active:scale-95 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Map Canvas Area */}
      {activeTab === '2d' ? (
        <CampusMap2D
          locations={locations}
          initialPlaceId={initialPlace}
          onSelectPlace={handleSelectPlace}
          locateTrigger={locateTrigger}
          resetTrigger={resetTrigger}
          activeRoute={activeRoute}
          onRouteChange={setActiveRoute}
        />
      ) : (
        <CampusTwin3D
          locations={locations}
          selectedLocationId={selectedPlaceId}
          onSelectPlace={handleSelectPlace}
          onSwitchTo2D={() => setActiveTab('2d')}
          activeRoute={activeRoute}
          onRouteChange={setActiveRoute}
        />
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <MapErrorBoundary fallbackTitle="Unable to Display Campus Map">
      <Suspense
        fallback={
          <div className="w-full h-[calc(100vh-64px)] min-h-[500px] bg-neutral-900 flex flex-col items-center justify-center text-white space-y-3">
            <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-neutral-400">Loading map...</p>
          </div>
        }
      >
        <MapContent />
      </Suspense>
    </MapErrorBoundary>
  );
}
