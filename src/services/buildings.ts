/**
 * Fetch real building footprints from OpenStreetMap (Overpass API) for the
 * central Sydney area and turn them into a GeoJSON FeatureCollection of
 * polygons with an estimated `height` (metres). Rendered as an Azure Maps
 * PolygonExtrusionLayer, this gives the actual CBD / Barangaroo / Milsons
 * Point buildings in 3D — no API key required.
 */

export interface BuildingProps {
  height: number;
  name?: string;
}

export interface BuildingFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  properties: BuildingProps;
}

export interface BuildingCollection {
  type: 'FeatureCollection';
  features: BuildingFeature[];
}

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// Central Sydney: The Rocks, CBD, Barangaroo, Circular Quay, Milsons Point.
// [south, west, north, east]
const BBOX: [number, number, number, number] = [-33.874, 151.198, -33.852, 151.221];

interface OsmNode {
  lat: number;
  lon: number;
}
interface OsmElement {
  type: string;
  geometry?: OsmNode[];
  tags?: Record<string, string>;
}

function estimateHeight(tags: Record<string, string> = {}): number {
  const h = parseFloat(tags.height ?? tags['building:height'] ?? '');
  if (Number.isFinite(h) && h > 0) return h;
  const levels = parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) return levels * 3.3;
  return 9; // default low-rise
}

export async function fetchBuildings(signal?: AbortSignal): Promise<BuildingCollection> {
  const [s, w, n, e] = BBOX;
  const query = `[out:json][timeout:30];(way["building"](${s},${w},${n},${e}););out geom;`;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements: OsmElement[] };

  const features: BuildingFeature[] = [];
  for (const el of json.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) continue;
    const ring = el.geometry.map((p) => [p.lon, p.lat] as [number, number]);
    // Ensure the ring is closed.
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { height: estimateHeight(el.tags), name: el.tags?.name },
    });
  }

  return { type: 'FeatureCollection', features };
}
