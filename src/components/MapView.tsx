import * as atlas from 'azure-maps-control';
import 'azure-maps-control/dist/atlas.min.css';
import { useEffect, useRef, useState } from 'react';

import { fetchBuildings } from '@/services/buildings';
import { fetchFerries, fetchReferenceLocations } from '@/services/ferryService';
import { CONFIG } from '@/shared/config';
import { SplatHero, type HeroFerry } from './SplatHero';

// Circular Quay area.
const KEY = import.meta.env.VITE_AZURE_MAPS_KEY;

// TfNSW-style ferry icon (bow points up = north, so icon rotation = heading).
const FERRY_SVG =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'>
      <path d='M22 3 L31 18 L31 37 Q22 43 13 37 L13 18 Z' fill='#0a7d3f' stroke='#054d28' stroke-width='1.5'/>
      <rect x='16' y='19' width='12' height='13' rx='2' fill='#f4f6f7'/>
      <rect x='16' y='22' width='12' height='4' fill='#24333d'/>
      <rect x='13' y='34' width='18' height='4' fill='#f3c000'/>
    </svg>`,
  );

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

interface Anim {
  prev: [number, number];
  target: [number, number];
  start: number;
}

export function MapView() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hero, setHero] = useState<HeroFerry | null>(null);

  useEffect(() => {
    if (!KEY) {
      setError('Missing Azure Maps key. Add VITE_AZURE_MAPS_KEY to Test_App/.env and restart the dev server.');
      return;
    }

    const map = new atlas.Map(mapDiv.current!, {
      center: [151.2075, -33.862],
      zoom: 14,
      pitch: 60,
      maxPitch: 75,
      bearing: 0,
      style: 'road',
      showLogo: true,
      authOptions: { authType: atlas.AuthenticationType.subscriptionKey, subscriptionKey: KEY },
    });

    const shapes = new Map<string, atlas.Shape>();
    const anim = new Map<string, Anim>();
    const meta = new Map<string, HeroFerry>();
    const lastSample = new Map<string, { lon: number; lat: number; t: number }>();
    const abort = new AbortController();
    let raf = 0;
    let poller = 0;
    let disposed = false;

    map.events.add('ready', () => {
      map.controls.add(
        [
          new atlas.control.ZoomControl(),
          new atlas.control.CompassControl(),
          new atlas.control.PitchControl(),
        ],
        { position: atlas.ControlPosition.TopRight },
      );

      // ── Real 3D buildings (OSM) ────────────────────────────────────────────
      const buildingSource = new atlas.source.DataSource();
      map.sources.add(buildingSource);
      map.layers.add(
        new atlas.layer.PolygonExtrusionLayer(buildingSource, undefined, {
          height: ['get', 'height'] as unknown as number,
          base: 0,
          fillOpacity: 0.92,
          fillColor: [
            'interpolate',
            ['linear'],
            ['get', 'height'],
            0, '#d3dae0',
            25, '#b3c0cc',
            70, '#8ea2b4',
            160, '#6d8296',
          ] as unknown as string,
        }),
        'labels',
      );
      void fetchBuildings(abort.signal)
        .then((fc) => buildingSource.add(fc as unknown as atlas.data.FeatureCollection))
        .catch(() => {/* buildings optional */});

      // ── Wharves ────────────────────────────────────────────────────────────
      const wharfSource = new atlas.source.DataSource();
      map.sources.add(wharfSource);
      map.layers.add(
        new atlas.layer.BubbleLayer(wharfSource, undefined, {
          radius: 4,
          color: '#6b4f2a',
          strokeColor: '#ffffff',
          strokeWidth: 1.5,
        }),
      );
      map.layers.add(
        new atlas.layer.SymbolLayer(wharfSource, undefined, {
          iconOptions: { image: 'none' },
          textOptions: {
            textField: ['get', 'name'],
            offset: [0, 1],
            size: 11,
            color: '#f4e9c8',
            haloColor: '#00000088',
            haloWidth: 1.5,
          },
        }),
      );
      void fetchReferenceLocations(abort.signal).then((r) => {
        wharfSource.add(
          r.locations.map(
            (l) => new atlas.data.Feature(new atlas.data.Point([l.lon, l.lat]), { name: l.name }),
          ),
        );
      });

      // ── Ferries ──────────────────────────────────────────────────────────
      const ferrySource = new atlas.source.DataSource();
      map.sources.add(ferrySource);

      map.imageSprite.add('ferry-icon', FERRY_SVG).then(() => {
        const ferryLayer = new atlas.layer.SymbolLayer(ferrySource, undefined, {
          iconOptions: {
            image: 'ferry-icon',
            allowOverlap: true,
            ignorePlacement: true,
            rotation: ['get', 'heading'] as unknown as number,
            rotationAlignment: 'map',
            size: 0.9,
          },
          textOptions: {
            textField: ['get', 'name'],
            offset: [0, 1.6],
            size: 11,
            color: '#ffffff',
            haloColor: '#0a1826',
            haloWidth: 1.5,
          },
        });
        map.layers.add(ferryLayer);

        // Click a ferry to "dive in" to the Babylon splat hero view.
        map.events.add('click', ferryLayer, (e) => {
          const shape = e.shapes?.[0];
          if (!shape || !(shape instanceof atlas.Shape)) return;
          const id = shape.getId() as string;
          const info = meta.get(id);
          const p = shape.getProperties() as { name?: string; destination?: string };
          setHero(info ?? { id, name: p.name ?? 'Ferry', destination: p.destination ?? '' });
        });
      });

      const poll = async () => {
        try {
          const feed = await fetchFerries(abort.signal);
          if (disposed) return;
          const now = performance.now();
          const seen = new Set<string>();
          for (const f of feed.ferries) {
            seen.add(f.id);
            const target: [number, number] = [f.lon, f.lat];
            const shape = shapes.get(f.id);

            // Derive speed (knots) from consecutive distinct samples.
            const prevS = lastSample.get(f.id);
            const moved = !prevS || prevS.lon !== f.lon || prevS.lat !== f.lat;
            let speedKn = meta.get(f.id)?.speedKn;
            if (prevS && moved) {
              const dtH = (Date.now() - prevS.t) / 3_600_000;
              if (dtH > 0) speedKn = haversineM([prevS.lon, prevS.lat], target) / 1852 / dtH;
            }
            if (moved) lastSample.set(f.id, { lon: f.lon, lat: f.lat, t: Date.now() });

            let headingDeg = meta.get(f.id)?.headingDeg ?? 0;
            if (shape) {
              const cur = shape.getCoordinates() as [number, number];
              if (cur[0] !== target[0] || cur[1] !== target[1]) headingDeg = bearing(cur, target);
              anim.set(f.id, { prev: cur, target, start: now });
              shape.setProperties({ name: f.name, destination: f.destination, heading: headingDeg });
            } else {
              const s = new atlas.Shape(new atlas.data.Point(target), f.id, {
                name: f.name,
                destination: f.destination,
                heading: 0,
              });
              ferrySource.add(s);
              shapes.set(f.id, s);
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
          // Remove ferries that dropped out of the feed.
          for (const [id, s] of shapes) {
            if (!seen.has(id)) {
              ferrySource.remove(s);
              shapes.delete(id);
              anim.delete(id);
            }
          }
          setCount(shapes.size);
          setAsOf(feed.asOf);
          setError(null);
        } catch (err) {
          if (!disposed) setError((err as Error).message);
        }
      };
      void poll();
      poller = window.setInterval(poll, CONFIG.pollMs);

      // Smoothly interpolate ferry positions between polls.
      const tick = () => {
        if (disposed) return;
        const now = performance.now();
        for (const [id, a] of anim) {
          const t = Math.min(1, (now - a.start) / CONFIG.pollMs);
          const lon = a.prev[0] + (a.target[0] - a.prev[0]) * t;
          const lat = a.prev[1] + (a.target[1] - a.prev[1]) * t;
          shapes.get(id)?.setCoordinates([lon, lat]);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      disposed = true;
      abort.abort();
      window.clearInterval(poller);
      cancelAnimationFrame(raf);
      map.dispose();
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0a1826]">
      <div ref={mapDiv} className="h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-4 select-none rounded-lg bg-slate-900/70 px-3 py-2 shadow-lg backdrop-blur-sm">
        <h1 className="text-lg font-semibold text-white">Sydney Ferries · Live Ferries</h1>
        <p className="text-sm text-white/85">
          {count} ferries live{asOf ? ` · updated ${new Date(asOf).toLocaleTimeString()}` : ''}
        </p>
      </div>

      {error && (
        <div className="absolute left-1/2 top-1/2 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-slate-900/90 px-5 py-4 text-center text-sm text-white shadow-xl">
          {error}
        </div>
      )}

      <SplatHero ferry={hero} onClose={() => setHero(null)} />
    </div>
  );
}
