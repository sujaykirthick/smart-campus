'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CampusLocation } from '@/lib/types';
import { HallLiveStatus, getAllHallsLiveStatus } from '@/lib/map-service';
import { InAppRouteResult } from '@/lib/campus-routing';
import campusBuildingsGeoJson from '@/data/campus-buildings.json';
import PlaceDetailPanel from '@/components/map/PlaceDetailPanel';
import { Info, AlertCircle, Compass, Eye, RotateCcw } from 'lucide-react';

interface CampusTwin3DProps {
  locations: CampusLocation[];
  selectedLocationId?: string | null;
  onSelectPlace?: (placeId: string | null) => void;
  onSwitchTo2D?: () => void;
  activeRoute?: InAppRouteResult | null;
  onRouteChange?: (route: InAppRouteResult | null) => void;
}

// Campus Center for relative coordinates conversion
const CAMPUS_REF_LAT = 10.9008;
const CAMPUS_REF_LNG = 76.9025;
const SCALE_FACTOR = 111000; // ~111km per degree

function latLngToXZ(lat: number, lng: number): [number, number] {
  const dLat = (lat - CAMPUS_REF_LAT) * SCALE_FACTOR;
  const dLng =
    (lng - CAMPUS_REF_LNG) *
    SCALE_FACTOR *
    Math.cos((CAMPUS_REF_LAT * Math.PI) / 180);
  return [dLng * 0.4, -dLat * 0.4]; // Scaled 3D coordinates (1 unit = 2.5m)
}

function haversineDistM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
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

// Standard Ray-casting algorithm for Point in Polygon
function pointInPolygon(pt: [number, number], vs: [number, number][]): boolean {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

interface BuildingMetadata {
  id: string;
  name: string;
  category: string;
  height: number;
  centroid: [number, number];
  location?: CampusLocation;
  isHall?: boolean;
}

interface ScreenLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  opacity: number;
  isHall: boolean;
  status?: HallLiveStatus;
}

export default function CampusTwin3D({
  locations,
  selectedLocationId,
  onSelectPlace,
  onSwitchTo2D,
  activeRoute,
  onRouteChange,
}: CampusTwin3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [hoveredBuilding, setHoveredBuilding] = useState<BuildingMetadata | null>(null);
  const [hallsLiveStatus, setHallsLiveStatus] = useState<Record<string, HallLiveStatus>>({});
  const [labels, setLabels] = useState<ScreenLabel[]>([]);

  // Selected Location object
  const selectedLocation = useMemo(() => {
    if (!selectedLocationId) return null;
    return locations.find((l) => l.id === selectedLocationId) || null;
  }, [locations, selectedLocationId]);

  // Check WebGL support on mount
  useEffect(() => {
    if (!isWebGLAvailable()) {
      setWebGLSupported(false);
    }
  }, []);

  // Fetch hall live status
  useEffect(() => {
    let active = true;
    getAllHallsLiveStatus()
      .then((statusMap) => {
        if (active) setHallsLiveStatus(statusMap);
      })
      .catch((err) => {
        console.warn('[CampusTwin3D] Could not load live hall status:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Camera flight controller ref
  const flyCameraRef = useRef<((target: [number, number], height?: number, lookHeight?: number) => void) | null>(null);
  const setTopViewRef = useRef<(() => void) | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);

  // Trigger camera fly when selectedLocation changes
  useEffect(() => {
    if (selectedLocation && flyCameraRef.current) {
      const [x, z] = latLngToXZ(selectedLocation.lat, selectedLocation.lng);
      flyCameraRef.current([x, z]);
    }
  }, [selectedLocation]);

  // Main Three.js Scene Setup
  useEffect(() => {
    if (!webGLSupported || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene & Atmosphere (Gentle sky and fog)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Slate-50 daylight sky
    scene.fog = new THREE.Fog(0xf8fafc, 160, 680);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1500);
    camera.position.set(20, 140, 210);

    // 3. Renderer (High performance, capped pixel ratio)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 20;
    controls.maxDistance = 440;
    controls.target.set(0, 0, 0);
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // 5. Lighting (Soft warm sun with shadows + ambient fill)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xf1f5f9, 0.45);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
    sunLight.position.set(140, 240, 110);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 40;
    sunLight.shadow.camera.far = 550;
    sunLight.shadow.camera.left = -220;
    sunLight.shadow.camera.right = 220;
    sunLight.shadow.camera.top = 220;
    sunLight.shadow.camera.bottom = -220;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    // 6. Ground Plane
    const groundGeo = new THREE.PlaneGeometry(900, 900);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.95,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 7. OSM Roads & Pathways (LineSegments)
    const roadVertices: number[] = [];
    const buildingFeatures: any[] = [];
    const greenFeatures: any[] = [];

    const features = (campusBuildingsGeoJson as any).features || [];

    for (const f of features) {
      const geomType = f.geometry?.type;
      const coords = f.geometry?.coordinates;
      const props = f.properties || {};

      if (geomType === 'LineString' && Array.isArray(coords)) {
        for (let i = 0; i < coords.length - 1; i++) {
          const pt1 = coords[i];
          const pt2 = coords[i + 1];
          if (pt1 && pt2) {
            const [x1, z1] = latLngToXZ(pt1[1], pt1[0]);
            const [x2, z2] = latLngToXZ(pt2[1], pt2[0]);
            roadVertices.push(x1, 0.05, z1, x2, 0.05, z2);
          }
        }
      } else if (geomType === 'Polygon' && Array.isArray(coords) && coords.length > 0) {
        if (props.leisure || props.landuse || props.natural) {
          greenFeatures.push(f);
        } else {
          buildingFeatures.push(f);
        }
      }
    }

    // 8. EXACT LOCATION MATCHING (Point-In-Polygon + Nearest <= 25m fallback)
    // Pre-match each location to its unique building footprint
    const locationToBuildingId = new Map<string, number>();
    const buildingIdToLocation = new Map<number, CampusLocation>();
    const unmatchedLocationIds = new Set<string>();

    locations.forEach((loc) => {
      let matchedBldg: any = null;
      let minDistance = Infinity;

      // 1. Try Point in Polygon
      for (const bldg of buildingFeatures) {
        const ring = bldg.geometry.coordinates[0];
        if (pointInPolygon([loc.lng, loc.lat], ring)) {
          matchedBldg = bldg;
          minDistance = 0;
          break;
        }
      }

      // 2. Fallback: Nearest polygon vertex within 25 meters
      if (!matchedBldg) {
        for (const bldg of buildingFeatures) {
          const ring = bldg.geometry.coordinates[0];
          let bldgMinDist = Infinity;
          for (const [vLng, vLat] of ring) {
            const d = haversineDistM(loc.lat, loc.lng, vLat, vLng);
            if (d < bldgMinDist) bldgMinDist = d;
          }

          if (bldgMinDist <= 25 && bldgMinDist < minDistance) {
            minDistance = bldgMinDist;
            matchedBldg = bldg;
          }
        }
      }

      if (matchedBldg) {
        locationToBuildingId.set(loc.id, matchedBldg.properties.id);
        if (!buildingIdToLocation.has(matchedBldg.properties.id)) {
          buildingIdToLocation.set(matchedBldg.properties.id, loc);
        }
      } else {
        unmatchedLocationIds.add(loc.id);
      }
    });

    // 9. Render Green Areas & Low-poly Trees
    const treePositions: THREE.Vector3[] = [];

    greenFeatures.forEach((f) => {
      const ring = f.geometry.coordinates[0];
      const shape = new THREE.Shape();
      let sumLat = 0, sumLng = 0;

      ring.forEach(([lng, lat]: [number, number], idx: number) => {
        const [x, z] = latLngToXZ(lat, lng);
        sumLat += lat;
        sumLng += lng;
        if (idx === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });

      const greenGeo = new THREE.ShapeGeometry(shape);
      greenGeo.rotateX(-Math.PI / 2);
      const isPitch = f.properties?.leisure === 'pitch';
      const greenMat = new THREE.MeshStandardMaterial({
        color: isPitch ? 0x86efac : 0xbbf7d0,
        roughness: 0.9,
      });
      const greenMesh = new THREE.Mesh(greenGeo, greenMat);
      greenMesh.position.y = 0.03;
      greenMesh.receiveShadow = true;
      scene.add(greenMesh);

      // Scatter low-poly trees on non-pitch green areas
      if (!isPitch && ring.length >= 4) {
        const cLat = sumLat / ring.length;
        const cLng = sumLng / ring.length;
        const [cx, cz] = latLngToXZ(cLat, cLng);
        treePositions.push(new THREE.Vector3(cx, 0, cz));
        treePositions.push(new THREE.Vector3(cx + 6, 0, cz + 4));
        treePositions.push(new THREE.Vector3(cx - 5, 0, cz - 6));
      }
    });

    // Instanced Trees for optimal phone performance (2 draw calls total)
    if (treePositions.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.8, 6);
      trunkGeo.translate(0, 0.9, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
      const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);

      const foliageGeo = new THREE.ConeGeometry(1.6, 3.2, 6);
      foliageGeo.translate(0, 3.0, 0);
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
      const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, treePositions.length);

      const dummy = new THREE.Object3D();
      treePositions.forEach((pos, i) => {
        dummy.position.copy(pos);
        dummy.rotation.y = (i * 0.7) % (Math.PI * 2);
        dummy.scale.setScalar(0.85 + ((i % 5) * 0.08));
        dummy.updateMatrix();
        trunkMesh.setMatrixAt(i, dummy.matrix);
        foliageMesh.setMatrixAt(i, dummy.matrix);
      });

      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      foliageMesh.castShadow = true;
      foliageMesh.receiveShadow = true;

      scene.add(trunkMesh);
      scene.add(foliageMesh);
    }

    // 10. Building Meshes, Edges & Accurate Label Anchors
    const buildingMeshes: THREE.Mesh[] = [];
    const meshMetaMap = new Map<number, BuildingMetadata>();
    const labelAnchors: Array<{
      meta: BuildingMetadata;
      pos: THREE.Vector3;
    }> = [];

    buildingFeatures.forEach((f) => {
      const outerRing = f.geometry.coordinates[0];
      if (!outerRing || outerRing.length < 3) return;

      let sumX = 0, sumZ = 0;
      const shape = new THREE.Shape();

      outerRing.forEach(([lng, lat]: [number, number], idx: number) => {
        const [x, z] = latLngToXZ(lat, lng);
        sumX += x;
        sumZ += z;
        if (idx === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });

      const cx = sumX / outerRing.length;
      const cz = sumZ / outerRing.length;

      // Estimate height from OSM tags or category
      let bHeight = 8;
      if (f.properties?.height && !isNaN(f.properties.height)) {
        bHeight = Math.max(5, f.properties.height * 0.4);
      } else if (f.properties?.levels && !isNaN(f.properties.levels)) {
        bHeight = Math.max(5, f.properties.levels * 3.5 * 0.4);
      } else {
        const nameLower = (f.properties?.name || '').toLowerCase();
        if (nameLower.includes('hostel') || nameLower.includes('bhavan')) bHeight = 14;
        else if (nameLower.includes('academic') || nameLower.includes('block')) bHeight = 12;
        else if (nameLower.includes('hall') || nameLower.includes('auditorium')) bHeight = 10;
        else bHeight = 8;
      }

      // Check if this building matches a canonical location
      const matchedLoc = buildingIdToLocation.get(f.properties?.id);

      const isHall =
        !!matchedLoc &&
        (matchedLoc.category.toLowerCase().includes('auditorium') ||
          matchedLoc.category.toLowerCase().includes('hall') ||
          matchedLoc.id === 'P008');

      // Check if this building is selected (either matched directly or through location id)
      const isSelected =
        (selectedLocationId && locationToBuildingId.get(selectedLocationId) === f.properties?.id);

      // Determine building material color
      let baseColor = 0xe2e8f0; // Slate-200 default
      if (isHall && matchedLoc) {
        const hallStatus = hallsLiveStatus[matchedLoc.id];
        if (hallStatus === 'in_session') baseColor = 0xef4444; // Red
        else if (hallStatus === 'reserved_soon') baseColor = 0xf59e0b; // Amber
        else baseColor = 0x10b981; // Emerald free
      } else if (isSelected) {
        baseColor = 0x2563eb; // Royal blue highlight
      } else if (matchedLoc) {
        const cat = matchedLoc.category.toLowerCase();
        if (cat.includes('academic')) baseColor = 0xf1f5f9;
        else if (cat.includes('hostel')) baseColor = 0xecfdf5;
        else if (cat.includes('dining')) baseColor = 0xffedd5;
        else if (cat.includes('admin')) baseColor = 0xffe4e6;
        else if (cat.includes('sports')) baseColor = 0xe0f2fe;
      }

      const bGeom = new THREE.ExtrudeGeometry(shape, { depth: bHeight, bevelEnabled: false });
      bGeom.rotateX(-Math.PI / 2);

      const bMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.55,
        metalness: 0.08,
        emissive: isSelected ? 0x1d4ed8 : 0x000000,
        emissiveIntensity: isSelected ? 0.35 : 0,
      });

      const mesh = new THREE.Mesh(bGeom, bMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Crisp edge lines
      const edgeGeo = new THREE.EdgesGeometry(bGeom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x2563eb : 0x64748b,
        opacity: isSelected ? 0.8 : 0.35,
        transparent: true,
      });
      const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
      mesh.add(edgeLines);

      scene.add(mesh);
      buildingMeshes.push(mesh);

      const meta: BuildingMetadata = {
        id: matchedLoc ? matchedLoc.id : `OSM_${f.properties?.id || Math.random()}`,
        name: matchedLoc?.name || f.properties?.name || 'Campus Building',
        category: matchedLoc?.category || f.properties?.type || 'Building',
        height: bHeight,
        centroid: [cx, cz],
        location: matchedLoc,
        isHall,
      };
      meshMetaMap.set(mesh.id, meta);

      // ONLY label buildings that match a location in data/campus-locations.json!
      if (matchedLoc) {
        labelAnchors.push({
          meta,
          pos: new THREE.Vector3(cx, bHeight + 2.5, cz),
        });
      }
    });

    // Add Road Lines
    if (roadVertices.length > 0) {
      const roadGeo = new THREE.BufferGeometry();
      roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
      const roadMat = new THREE.LineBasicMaterial({
        color: 0x94a3b8,
        opacity: 0.75,
        transparent: true,
      });
      const roadSegments = new THREE.LineSegments(roadGeo, roadMat);
      scene.add(roadSegments);
    }

    // 11. UNMATCHED LOCATION MARKER PIN
    // If selected place is an unmatched location (e.g. Ettimadai station, open football ground):
    // Show a distinct 3D marker pin instead of highlighting a wrong building!
    let pinMeshGroup: THREE.Group | null = null;
    if (selectedLocation && unmatchedLocationIds.has(selectedLocation.id)) {
      pinMeshGroup = new THREE.Group();
      const [px, pz] = latLngToXZ(selectedLocation.lat, selectedLocation.lng);

      // Ground ring
      const ringGeo = new THREE.RingGeometry(1.6, 2.4, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(px, 0.1, pz);
      pinMeshGroup.add(ringMesh);

      // Pin pole
      const poleGeo = new THREE.CylinderGeometry(0.25, 0.25, 9, 8);
      poleGeo.translate(0, 4.5, 0);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
      const poleMesh = new THREE.Mesh(poleGeo, poleMat);
      poleMesh.position.set(px, 0.1, pz);
      pinMeshGroup.add(poleMesh);

      // Pin top sphere
      const headGeo = new THREE.SphereGeometry(1.4, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xb91c1c });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.set(px, 9.6, pz);
      pinMeshGroup.add(headMesh);

      scene.add(pinMeshGroup);
    }

    // 12. 3D ROUTE DRAWING (Blue Ribbon + Moving Pulse Dot + Frame View)
    let routeGroup: THREE.Group | null = null;
    let routePulseDot: THREE.Mesh | null = null;
    let route3DPoints: THREE.Vector3[] = [];

    if (activeRoute && activeRoute.coordinates.length > 1) {
      routeGroup = new THREE.Group();
      route3DPoints = activeRoute.coordinates.map(([lat, lng]) => {
        const [rx, rz] = latLngToXZ(lat, lng);
        return new THREE.Vector3(rx, 0.28, rz);
      });

      // Blue ribbon path line
      const lineGeo = new THREE.BufferGeometry().setFromPoints(route3DPoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x2563eb,
        linewidth: 4,
      });
      const routeLine = new THREE.Line(lineGeo, lineMat);
      routeGroup.add(routeLine);

      // White outline casing for high contrast
      const casingPoints = route3DPoints.map((p) => new THREE.Vector3(p.x, 0.25, p.z));
      const casingGeo = new THREE.BufferGeometry().setFromPoints(casingPoints);
      const casingMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 6,
      });
      const casingLine = new THREE.Line(casingGeo, casingMat);
      routeGroup.add(casingLine);

      // Animated glowing pulse dot along route
      const dotGeo = new THREE.SphereGeometry(1.2, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      routePulseDot = new THREE.Mesh(dotGeo, dotMat);
      routePulseDot.position.copy(route3DPoints[0]);
      routeGroup.add(routePulseDot);

      scene.add(routeGroup);

      // Frame route in camera view
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      route3DPoints.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });
      const midX = (minX + maxX) / 2;
      const midZ = (minZ + maxZ) / 2;
      const span = Math.max(maxX - minX, maxZ - minZ);
      const elev = Math.max(50, span * 1.2);

      controls.target.set(midX, 0, midZ);
      camera.position.set(midX + elev * 0.4, elev, midZ + elev * 0.6);
    }

    // Camera Flight Controller
    let cameraTargetAnim: {
      active: boolean;
      startPos: THREE.Vector3;
      endPos: THREE.Vector3;
      startTarget: THREE.Vector3;
      endTarget: THREE.Vector3;
      progress: number;
    } | null = null;

    flyCameraRef.current = (target: [number, number], height = 45, lookHeight = 0) => {
      const [tx, tz] = target;
      cameraTargetAnim = {
        active: true,
        startPos: camera.position.clone(),
        endPos: new THREE.Vector3(tx + 32, height, tz + 32),
        startTarget: controls.target.clone(),
        endTarget: new THREE.Vector3(tx, lookHeight, tz),
        progress: 0,
      };
    };

    setTopViewRef.current = () => {
      cameraTargetAnim = {
        active: true,
        startPos: camera.position.clone(),
        endPos: new THREE.Vector3(0, 260, 0.01),
        startTarget: controls.target.clone(),
        endTarget: new THREE.Vector3(0, 0, 0),
        progress: 0,
      };
    };

    resetCameraRef.current = () => {
      cameraTargetAnim = {
        active: true,
        startPos: camera.position.clone(),
        endPos: new THREE.Vector3(20, 140, 210),
        startTarget: controls.target.clone(),
        endTarget: new THREE.Vector3(0, 0, 0),
        progress: 0,
      };
    };

    // Raycasting for building selection and hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(buildingMeshes);

      if (intersects.length > 0) {
        const topMesh = intersects[0].object as THREE.Mesh;
        const meta = meshMetaMap.get(topMesh.id);
        setHoveredBuilding(meta || null);
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredBuilding(null);
        renderer.domElement.style.cursor = 'default';
      }
    };

    const onPointerClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(buildingMeshes);

      if (intersects.length > 0) {
        const topMesh = intersects[0].object as THREE.Mesh;
        const meta = meshMetaMap.get(topMesh.id);
        if (meta && meta.location) {
          onSelectPlace?.(meta.location.id);
          flyCameraRef.current?.(meta.centroid);
        }
      }
    };

    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onPointerClick);

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Animation Loop with Label Collision Avoidance & Pulse Dot
    let animId: number;
    let pulseT = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth camera interpolation
      if (cameraTargetAnim && cameraTargetAnim.active) {
        cameraTargetAnim.progress += 0.035;
        const t = Math.min(1, cameraTargetAnim.progress);
        const easeT = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(cameraTargetAnim.startPos, cameraTargetAnim.endPos, easeT);
        controls.target.lerpVectors(cameraTargetAnim.startTarget, cameraTargetAnim.endTarget, easeT);

        if (t >= 1) {
          cameraTargetAnim.active = false;
        }
      }

      controls.update();

      // Animate Route Pulse Dot along 3D route
      if (routePulseDot && route3DPoints.length > 1) {
        pulseT = (Date.now() * 0.0004) % 1.0;
        const totalSegments = route3DPoints.length - 1;
        const segmentProgress = pulseT * totalSegments;
        const segIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
        const frac = segmentProgress - segIndex;
        routePulseDot.position.lerpVectors(route3DPoints[segIndex], route3DPoints[segIndex + 1], frac);
        routePulseDot.position.y = 0.45;
      }

      // SCREEN PROJECTED LABELS WITH COLLISION-HIDE & DISTANCE FADE
      const candidateLabels: ScreenLabel[] = [];
      const camPos = camera.position;
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;

      for (const anchor of labelAnchors) {
        const dist = camPos.distanceTo(anchor.pos);
        // Distance visibility threshold
        if (dist > 30 && dist < 250) {
          const screenPos = anchor.pos.clone().project(camera);
          if (screenPos.z < 1) {
            const sx = (screenPos.x * 0.5 + 0.5) * w;
            const sy = (-(screenPos.y * 0.5) + 0.5) * h;

            let opacity = 1;
            if (dist > 180) {
              opacity = Math.max(0, (250 - dist) / 70);
            } else if (dist < 50) {
              opacity = Math.max(0, (dist - 30) / 20);
            }

            if (opacity > 0.08) {
              candidateLabels.push({
                id: anchor.meta.id,
                name: anchor.meta.name,
                x: sx,
                y: sy,
                opacity,
                isHall: !!anchor.meta.isHall,
                status: anchor.meta.location ? hallsLiveStatus[anchor.meta.location.id] : undefined,
              });
            }
          }
        }
      }

      // Collision detection: skip overlapping labels (max 14 visible)
      const placedLabels: ScreenLabel[] = [];
      const COLLISION_X = 85;
      const COLLISION_Y = 26;

      for (const cand of candidateLabels) {
        if (placedLabels.length >= 14) break;

        const collides = placedLabels.some(
          (p) => Math.abs(p.x - cand.x) < COLLISION_X && Math.abs(p.y - cand.y) < COLLISION_Y
        );

        if (!collides) {
          placedLabels.push(cand);
        }
      }

      setLabels(placedLabels);
      renderer.render(scene, camera);
    };

    animate();

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', onPointerMove);
      renderer.domElement.removeEventListener('click', onPointerClick);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [webGLSupported, locations, selectedLocationId, onSelectPlace, hallsLiveStatus, selectedLocation, activeRoute]);

  // Graceful WebGL Unsupported Fallback
  if (!webGLSupported) {
    return (
      <div className="w-full h-[calc(100vh-64px)] min-h-[500px] bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="p-6 rounded-3xl bg-slate-800/90 border border-slate-700 max-w-md space-y-4 shadow-2xl">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-base font-bold text-white">WebGL 3D Not Supported</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your current device or browser does not support WebGL graphics acceleration.
            You can continue exploring all campus buildings, halls, and live availability on the interactive 2D map.
          </p>
          <button
            onClick={onSwitchTo2D}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
          >
            Switch to 2D Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-64px)] min-h-[500px] flex flex-col md:flex-row overflow-hidden bg-slate-100">
      {/* 3D Canvas Mount Point */}
      <div className="relative flex-1 w-full h-full min-h-[500px] z-0">
        <div ref={mountRef} className="w-full h-full min-h-[500px]" />

        {/* Mandatory Concept View Banner */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <div className="bg-white/95 text-neutral-800 border border-neutral-200/90 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-semibold">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Concept view: building heights are estimated</span>
          </div>
        </div>

        {/* 3D Controls Group (Top-Right): Reset View & Top View */}
        <div className="absolute top-4 right-36 z-20 flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => setTopViewRef.current?.()}
            title="Switch to Top-Down 2D View"
            className="px-2.5 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-neutral-200/90 shadow-md text-xs font-bold text-neutral-700 hover:text-blue-600 active:scale-95 transition-all flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Top view</span>
          </button>

          <button
            onClick={() => resetCameraRef.current?.()}
            title="Reset to 3D Perspective"
            className="p-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-neutral-200/90 shadow-md text-neutral-700 hover:text-neutral-900 active:scale-95 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* BOTTOM-LEFT 3D LEGEND: Buildings & Route */}
        <div className="absolute bottom-6 left-4 z-10 pointer-events-none hidden sm:block">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-neutral-200/80 px-3.5 py-2 flex items-center gap-2.5 text-[11px] font-semibold text-neutral-700">
            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Halls:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
              Available
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs" />
              Reserved
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-xs" />
              In Use
            </span>
            <span className="text-neutral-300">|</span>
            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Buildings:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 border border-slate-400" />
              Academic
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-400" />
              Hostel
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-100 border border-rose-400" />
              Admin
            </span>
            {activeRoute && (
              <>
                <span className="text-neutral-300">|</span>
                <span className="flex items-center gap-1 text-blue-600 font-bold">
                  <span className="w-3 h-1 rounded-full bg-blue-600 animate-pulse" />
                  Route
                </span>
              </>
            )}
          </div>
        </div>

        {/* OSM Attribution (bottom-right) */}
        <div className="absolute bottom-2 right-4 z-10 pointer-events-none text-[10px] text-neutral-400 font-mono">
          © OpenStreetMap contributors (ODbL)
        </div>

        {/* Dynamic Non-Overlapping 3D Building Labels */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          {labels.map((lbl) => (
            <div
              key={lbl.id}
              style={{
                left: lbl.x,
                top: lbl.y,
                opacity: lbl.opacity,
                transform: 'translate(-50%, -100%)',
              }}
              className="absolute transition-opacity duration-75 flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-md whitespace-nowrap bg-white/95 text-neutral-800 border border-neutral-200/90"
            >
              {lbl.isHall && (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    lbl.status === 'in_session'
                      ? 'bg-red-500'
                      : lbl.status === 'reserved_soon'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
              )}
              <span className="truncate max-w-[140px]">{lbl.name}</span>
            </div>
          ))}
        </div>

        {/* Hover Tooltip */}
        {hoveredBuilding && (
          <div className="absolute bottom-6 right-6 z-20 bg-white/95 text-neutral-900 border border-neutral-200 p-3 rounded-2xl shadow-xl max-w-xs pointer-events-none backdrop-blur-md">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                {hoveredBuilding.id}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                {hoveredBuilding.category}
              </span>
            </div>
            <h4 className="font-bold text-xs leading-tight text-neutral-900">{hoveredBuilding.name}</h4>
            <p className="text-[10px] text-neutral-500 mt-0.5">Click building to view venue details</p>
          </div>
        )}
      </div>

      {/* Selected Location Details Panel */}
      {selectedLocation && (
        <PlaceDetailPanel
          location={selectedLocation}
          allLocations={locations}
          onClose={() => onSelectPlace?.(null)}
          onRouteCalculated={(route) => onRouteChange?.(route)}
          onClearRoute={() => onRouteChange?.(null)}
        />
      )}
    </div>
  );
}
