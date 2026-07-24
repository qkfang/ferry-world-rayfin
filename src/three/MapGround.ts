import * as THREE from 'three';

import { toWorld } from '@/shared/geo';

/**
 * Real Sydney Ferries as 3D terrain. For each map tile we build a subdivided
 * plane, drape it with a raster basemap tile, and displace its vertices using a
 * co-located DEM (digital elevation model) tile — so headlands, cliffs and the
 * Heads actually rise out of the water. Everything is positioned with the same
 * lat/lon → world projection as the ferries (shared/geo.ts).
 *
 * All tile sources are free and need no API key:
 *  - Basemap (satellite): Esri World Imagery
 *  - Basemap (street):    OpenStreetMap
 *  - Elevation:           AWS Terrarium terrain-RGB tiles
 */

type BasemapStyle = 'satellite' | 'street';
// Flip to 'street' for an OpenStreetMap labelled map (roads + place names).
const STYLE: BasemapStyle = 'satellite';

const BASEMAP: Record<BasemapStyle, string> = {
  satellite:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  street: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const ZOOM = 14; // crisper imagery
const TILE_SEG = 24; // terrain subdivisions per tile
const EXAG = 2.5; // vertical exaggeration so Sydney's modest relief reads in 3D

// Ferry network bounding box: Parramatta (W) → Manly (E), north shore → S of CBD.
const BBOX = { minLon: 150.99, maxLon: 151.31, minLat: -33.9, maxLat: -33.77 };

const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tile = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
const fill = (tpl: string, z: number, x: number, y: number) =>
  tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

/** Load a DEM tile and return a nearest-pixel height sampler (metres). */
function loadHeightSampler(
  z: number,
  x: number,
  y: number,
): Promise<(u: number, v: number) => number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
      resolve((u: number, v: number) => {
        // u: west→east (0..1), v: south→north (0..1). Image row 0 = north.
        const col = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
        const row = Math.min(height - 1, Math.max(0, Math.round((1 - v) * (height - 1))));
        const i = (row * width + col) * 4;
        const h = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        return Math.max(0, h); // clamp water/negatives to flat sea level
      });
    };
    img.onerror = () => resolve(() => 0);
    img.src = fill(DEM_URL, z, x, y);
  });
}

export class MapGround {
  readonly group = new THREE.Group();
  private readonly loader = new THREE.TextureLoader();

  constructor() {
    this.loader.setCrossOrigin('anonymous');
    const z = ZOOM;
    const xMin = lon2tile(BBOX.minLon, z);
    const xMax = lon2tile(BBOX.maxLon, z);
    const yMin = lat2tile(BBOX.maxLat, z); // north → smaller y
    const yMax = lat2tile(BBOX.minLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) this.addTile(z, x, y);
    }
  }

  private addTile(z: number, x: number, y: number): void {
    const lonL = tile2lon(x, z);
    const lonR = tile2lon(x + 1, z);
    const latT = tile2lat(y, z);
    const latB = tile2lat(y + 1, z);

    const nw = toWorld(latT, lonL);
    const se = toWorld(latB, lonR);
    const w = Math.abs(se.x - nw.x);
    const d = Math.abs(se.z - nw.z);
    const cx = (nw.x + se.x) / 2;
    const cz = (nw.z + se.z) / 2;

    // Plane in XY (width→x/east, height→y). Displaced along local z = world up
    // after the -90° X rotation.
    const geo = new THREE.PlaneGeometry(w, d, TILE_SEG, TILE_SEG);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9fb6c0, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1;
    this.group.add(mesh);

    void loadHeightSampler(z, x, y).then((sample) => {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) + w / 2) / w;
        const v = (pos.getY(i) + d / 2) / d;
        pos.setZ(i, sample(u, v) * EXAG);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    });

    this.loader.load(
      fill(BASEMAP[STYLE], z, x, y),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      },
      undefined,
      () => {
        mat.color.set(0x14506a);
        mat.needsUpdate = true;
      },
    );
  }
}
