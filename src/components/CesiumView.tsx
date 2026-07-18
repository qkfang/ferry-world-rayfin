import {
  Cartesian2,
  Cartesian3,
  CameraEventType,
  Color,
  createGooglePhotorealistic3DTileset,
  createOsmBuildingsAsync,
  defined,
  HeadingPitchRoll,
  HeightReference,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  Matrix4,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  Transforms,
  VerticalOrigin,
  Viewer,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { fetchBuildings } from '@/services/buildings';
import { fetchFerries, fetchReferenceLocations } from '@/services/ferryService';
import { KustoInteractionRequiredError } from '@/services/kustoClient';
import { CONFIG } from '@/shared/config';
import { type HeroFerry } from './SplatHero';

// A free Cesium Ion token (ion.cesium.com) unlocks world terrain, Cesium OSM
// Buildings and Google Photorealistic 3D Tiles. Without it we fall back to
// keyless OpenStreetMap imagery + our own OSM building extrusions.
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;

// Real 3D ferry model (glTF). Ships a bundled stylised Emerald-class vessel;
// point VITE_FERRY_MODEL_URL at any .glb to swap in a higher-fidelity model.
const FERRY_MODEL_URL = import.meta.env.VITE_FERRY_MODEL_URL || '/models/ferry.glb';
const FERRY_HEIGHT_M = 23; // Sydney sea level ≈ +22 m ellipsoidal (geoid offset)
const HEADING_OFFSET_DEG = -90; // model bow is authored along +Z

function bearing(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const dλ = toRad(b[0] - a[0]);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dφ = toRad(b[1] - a[1]);
  const dλ = toRad(b[0] - a[0]);
  const s =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function buildingColor(h: number): Color {
  // Match the Azure Maps ramp: light low-rise → steely high-rise.
  const t = Math.min(1, h / 160);
  return Color.fromCssColorString(
    t < 0.15 ? '#d3dae0' : t < 0.45 ? '#b3c0cc' : t < 0.75 ? '#8ea2b4' : '#6d8296',
  ).withAlpha(0.95);
}

// Opening (and "reset") camera pose over Circular Quay.
const HOME = { lon: 151.2075, lat: -33.88, height: 2600, headingDeg: 0, pitchDeg: -35 };

function flyHome(viewer: Viewer, duration = 1.4): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
    orientation: {
      heading: CesiumMath.toRadians(HOME.headingDeg),
      pitch: CesiumMath.toRadians(HOME.pitchDeg),
      roll: 0,
    },
    duration,
  });
}

/** Swoop the camera down to an oblique close-up of a point (a ferry). */
function flyToPoint(viewer: Viewer, lon: number, lat: number): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat - 0.0028, 180),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-26), roll: 0 },
    duration: 1.4,
  });
}

/** Orbit the camera around whatever point is under the screen centre. */
function orbit(viewer: Viewer, headingDelta: number, pitchDelta: number): void {
  const scene = viewer.scene;
  const canvas = scene.canvas;
  const centre = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  let target: Cartesian3 | undefined = scene.pickPosition(centre);
  if (!defined(target)) {
    const ray = viewer.camera.getPickRay(centre);
    target = ray ? scene.globe.pick(ray, scene) : undefined;
  }
  const camera = viewer.camera;
  if (defined(target)) {
    camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(target));
    if (headingDelta) camera.rotateRight(headingDelta);
    if (pitchDelta) camera.rotateUp(pitchDelta);
    camera.lookAtTransform(Matrix4.IDENTITY);
  } else {
    if (headingDelta) camera.rotateRight(headingDelta);
    if (pitchDelta) camera.rotateUp(pitchDelta);
  }
}

function zoom(viewer: Viewer, inward: boolean): void {
  const amount = Math.max(50, viewer.camera.positionCartographic.height * 0.35);
  if (inward) viewer.camera.zoomIn(amount);
  else viewer.camera.zoomOut(amount);
}

const HEADING_STEP = CesiumMath.toRadians(15);
const PITCH_STEP = CesiumMath.toRadians(8);

interface Anim {
  prev: [number, number];
  target: [number, number];
  start: number;
}

export interface CesiumHandle {
  /** Fly the camera to an oblique close-up over a ferry's position. */
  flyToFerry(lon: number, lat: number): void;
}

export interface CesiumStatus {
  count: number;
  asOf: string | null;
  photoreal: boolean;
  /** True when live data needs a one-time interactive sign-in. */
  needsAuth: boolean;
}

interface CesiumViewProps {
  /** Reports the live ferry count / freshness so the app chrome can show it. */
  onStatus?: (s: CesiumStatus) => void;
  /** Fired when a ferry is clicked — opens the full-screen voxel ferry view. */
  onSelectFerry?: (ferry: { id: string; name: string }) => void;
}

export const CesiumView = forwardRef<CesiumHandle, CesiumViewProps>(function CesiumView(
  { onStatus, onSelectFerry },
  ref,
) {
  const div = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [count, setCount] = useState(0);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const photoreal = Boolean(ION_TOKEN);

  // Bubble live status up to the app shell (kept in a ref so the effect below
  // always calls the latest callback without re-subscribing).
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onSelectFerryRef = useRef(onSelectFerry);
  onSelectFerryRef.current = onSelectFerry;
  useEffect(() => {
    onStatusRef.current?.({ count, asOf, photoreal, needsAuth });
  }, [count, asOf, photoreal, needsAuth]);

  useEffect(() => {
    if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;

    const viewer = new Viewer(div.current!, {
      // Allow screenshots / toDataURL of the WebGL canvas.
      contextOptions: { webgl: { preserveDrawingBuffer: true } },
      // Keyless base: OpenStreetMap tiles (no Ion token required).
      baseLayer: ION_TOKEN
        ? undefined
        : ImageryLayer.fromProviderAsync(
            Promise.resolve(
              new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
            ),
            {},
          ),
      terrain: ION_TOKEN ? Terrain.fromWorldTerrain() : undefined,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      timeline: false,
      animation: false,
      infoBox: false,
      selectionIndicator: false,
    });
    viewer.scene.globe.enableLighting = true;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    viewerRef.current = viewer;

    // Right-mouse drag orbits/tilts the view; keep wheel for zoom.
    const camCtrl = viewer.scene.screenSpaceCameraController;
    camCtrl.tiltEventTypes = [CameraEventType.RIGHT_DRAG, CameraEventType.PINCH];
    camCtrl.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];

    const abort = new AbortController();
    const shapes = new Map<string, Entity>();
    const anim = new Map<string, Anim>();
    const meta = new Map<string, HeroFerry>();
    const lastSample = new Map<string, { lon: number; lat: number; t: number }>();
    let poller = 0;
    let raf = 0;
    let disposed = false;

    // ── Fly to an oblique view over Circular Quay ────────────────────────────
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(HOME.lon, HOME.lat, HOME.height),
      orientation: {
        heading: CesiumMath.toRadians(HOME.headingDeg),
        pitch: CesiumMath.toRadians(HOME.pitchDeg),
        roll: 0,
      },
    });

    // ── Photoreal 3D (only with an Ion token) ────────────────────────────────
    if (ION_TOKEN) {
      // Google Photorealistic 3D Tiles give the true "wow" city mesh.
      void createGooglePhotorealistic3DTileset()
        .then((ts) => viewer.scene.primitives.add(ts))
        .catch(() => {
          // Fall back to Cesium OSM Buildings if Google tiles aren't enabled.
          void createOsmBuildingsAsync()
            .then((ts) => viewer.scene.primitives.add(ts))
            .catch(() => {/* ignore */});
        });
    } else {
      // ── Keyless: extrude our real OSM footprints as polygon entities ───────
      void fetchBuildings(abort.signal)
        .then((fc) => {
          for (const f of fc.features) {
            const ring = f.geometry.coordinates[0];
            if (!ring || ring.length < 4) continue;
            const flat: number[] = [];
            for (const [lon, lat] of ring) flat.push(lon, lat);
            viewer.entities.add({
              polygon: {
                hierarchy: Cartesian3.fromDegreesArray(flat),
                extrudedHeight: f.properties.height,
                material: buildingColor(f.properties.height),
                outline: false,
              },
            });
          }
        })
        .catch(() => {/* buildings optional */});
    }

    // ── Wharves ──────────────────────────────────────────────────────────────
    void fetchReferenceLocations(abort.signal).then((r) => {
      for (const l of r.locations) {
        viewer.entities.add({
          position: Cartesian3.fromDegrees(l.lon, l.lat),
          point: { pixelSize: 7, color: Color.fromCssColorString('#6b4f2a'), outlineColor: Color.WHITE, outlineWidth: 1.5, heightReference: HeightReference.CLAMP_TO_GROUND },
          label: {
            text: l.name,
            font: '12px sans-serif',
            fillColor: Color.fromCssColorString('#f4e9c8'),
            outlineColor: Color.fromCssColorString('#000000'),
            outlineWidth: 3,
            style: 2, // FILL_AND_OUTLINE
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian3(0, -12, 0),
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        });
      }
    });

    // ── Ferries: click to zoom the camera onto the vessel ────────────────────
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position);
      const id = picked?.id?.id as string | undefined;
      const a = id ? anim.get(id) : undefined;
      if (a) {
        flyToPoint(viewer, a.target[0], a.target[1]);
        // Open the full-screen voxel ferry view for the clicked vessel.
        const info = id ? meta.get(id) : undefined;
        if (id) onSelectFerryRef.current?.({ id, name: info?.name ?? id });
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    const poll = async () => {
      try {
        const feed = await fetchFerries(abort.signal);
        if (disposed) return;
        const now = performance.now();
        const seen = new Set<string>();
        for (const f of feed.ferries) {
          seen.add(f.id);
          const target: [number, number] = [f.lon, f.lat];
          const prevS = lastSample.get(f.id);
          const moved = !prevS || prevS.lon !== f.lon || prevS.lat !== f.lat;
          let speedKn = meta.get(f.id)?.speedKn;
          if (prevS && moved) {
            const dtH = (Date.now() - prevS.t) / 3_600_000;
            if (dtH > 0) speedKn = haversineM([prevS.lon, prevS.lat], target) / 1852 / dtH;
          }
          if (moved) lastSample.set(f.id, { lon: f.lon, lat: f.lat, t: Date.now() });

          let headingDeg = meta.get(f.id)?.headingDeg ?? 0;
          const existing = shapes.get(f.id);
          if (existing) {
            const cur = anim.get(f.id)?.target ?? target;
            if (cur[0] !== target[0] || cur[1] !== target[1]) headingDeg = bearing(cur, target);
            anim.set(f.id, { prev: cur, target, start: now });
          } else {
            const ent = viewer.entities.add({
              id: f.id,
              position: Cartesian3.fromDegrees(target[0], target[1], FERRY_HEIGHT_M),
              model: {
                uri: FERRY_MODEL_URL,
                minimumPixelSize: 56,
                maximumScale: 400,
                scale: 1,
              },
              label: {
                text: f.name,
                font: '11px sans-serif',
                fillColor: Color.WHITE,
                outlineColor: Color.fromCssColorString('#0a1826'),
                outlineWidth: 3,
                style: 2,
                verticalOrigin: VerticalOrigin.BOTTOM,
                pixelOffset: new Cartesian3(0, -22, 0),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            shapes.set(f.id, ent);
            anim.set(f.id, { prev: target, target, start: now });
          }

          meta.set(f.id, {
            id: f.id,
            name: f.name,
            destination: f.destination,
            headingDeg,
            speedKn,
            lastSeenMs: f.ts,
          });
        }
        for (const [id, ent] of shapes) {
          if (!seen.has(id)) {
            viewer.entities.remove(ent);
            shapes.delete(id);
            anim.delete(id);
          }
        }
        setCount(shapes.size);
        setAsOf(feed.asOf);
        setError(null);
        setNeedsAuth(false);
      } catch (err) {
        if (disposed) return;
        if (err instanceof KustoInteractionRequiredError) {
          setNeedsAuth(true);
        } else {
          setError((err as Error).message);
        }
      }
    };
    void poll();
    poller = window.setInterval(poll, CONFIG.pollMs);

    // Smoothly interpolate ferry positions + orient models to heading.
    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      for (const [id, a] of anim) {
        const t = Math.min(1, (now - a.start) / CONFIG.pollMs);
        const lon = a.prev[0] + (a.target[0] - a.prev[0]) * t;
        const lat = a.prev[1] + (a.target[1] - a.prev[1]) * t;
        const ent = shapes.get(id);
        if (!ent) continue;
        const pos = Cartesian3.fromDegrees(lon, lat, FERRY_HEIGHT_M);
        ent.position = pos as unknown as Entity['position'];
        const hd = meta.get(id)?.headingDeg ?? 0;
        const hpr = new HeadingPitchRoll(CesiumMath.toRadians(hd + HEADING_OFFSET_DEG), 0, 0);
        ent.orientation = Transforms.headingPitchRollQuaternion(pos, hpr) as unknown as Entity['orientation'];
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      abort.abort();
      window.clearInterval(poller);
      cancelAnimationFrame(raf);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Continuous auto-orbit while enabled.
  useEffect(() => {
    if (!autoOrbit) return;
    const id = window.setInterval(() => {
      const v = viewerRef.current;
      if (v) orbit(v, CesiumMath.toRadians(0.2), 0);
    }, 30);
    return () => window.clearInterval(id);
  }, [autoOrbit]);

  const nudge = (headingDelta: number, pitchDelta: number) => {
    const v = viewerRef.current;
    if (v) orbit(v, headingDelta, pitchDelta);
  };
  const doZoom = (inward: boolean) => {
    const v = viewerRef.current;
    if (v) zoom(v, inward);
  };
  const resetView = () => {
    const v = viewerRef.current;
    if (v) flyHome(v);
  };
  const flyToFerry = (lon: number, lat: number) => {
    const v = viewerRef.current;
    if (v) flyToPoint(v, lon, lat);
  };
  useImperativeHandle(ref, () => ({ flyToFerry }), []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a1826]">
      <div ref={div} className="h-full w-full" />

      {/* Camera controls */}
      <div className="absolute bottom-16 right-4 z-20 flex select-none flex-col items-center gap-1.5">
        <button
          onClick={() => nudge(0, PITCH_STEP)}
          title="Tilt up (more top-down)"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900/70 text-lg leading-none text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/90"
        >
          ▲
        </button>
        <div className="flex gap-1.5">
          <button
            onClick={() => nudge(-HEADING_STEP, 0)}
            title="Rotate left"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900/70 text-lg leading-none text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/90"
          >
            ◀
          </button>
          <button
            onClick={resetView}
            title="Reset view"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900/70 text-base leading-none text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/90"
          >
            ⌂
          </button>
          <button
            onClick={() => nudge(HEADING_STEP, 0)}
            title="Rotate right"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900/70 text-lg leading-none text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/90"
          >
            ▶
          </button>
        </div>
        <button
          onClick={() => nudge(0, -PITCH_STEP)}
          title="Tilt down (more horizontal)"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900/70 text-lg leading-none text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/90"
        >
          ▼
        </button>
        <div className="mt-1 flex gap-1.5">
          <button
            onClick={() => doZoom(false)}
            title="Zoom out"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900/70 text-xl leading-none text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/90"
          >
            −
          </button>
          <button
            onClick={() => doZoom(true)}
            title="Zoom in"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900/70 text-xl leading-none text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800/90"
          >
            +
          </button>
        </div>
        <button
          onClick={() => setAutoOrbit((o) => !o)}
          title="Toggle auto-orbit"
          className={`mt-1 flex h-9 items-center justify-center gap-1 rounded-md px-3 text-xs font-medium shadow-lg backdrop-blur-sm transition-colors ${
            autoOrbit ? 'bg-emerald-600/80 text-white hover:bg-emerald-600' : 'bg-slate-900/70 text-white hover:bg-slate-800/90'
          }`}
        >
          {autoOrbit ? '⏸ Orbit' : '⟳ Orbit'}
        </button>
      </div>

      {error && (
        <div className="absolute left-1/2 top-1/2 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-slate-900/90 px-5 py-4 text-center text-sm text-white shadow-xl">
          {error}
        </div>
      )}
    </div>
  );
});
