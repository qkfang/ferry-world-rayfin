import * as THREE from 'three';

import { CONFIG } from '@/shared/config';

/**
 * Low-poly / voxel Sydney: two shorelines forming the central harbour channel,
 * the Harbour Bridge spanning it, the Opera House on Bennelong Point, and a
 * small CBD skyline. Everything is authored in world metres with the origin at
 * Circular Quay (see shared/geo.ts), so it lines up with the live ferries.
 *
 * Axes: +x = east, +z = south (north = -z), y = up.
 */

const C = CONFIG.colors;

// Deterministic pseudo-random so the coastline/skyline are stable across reloads.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260703);

function box(
  parent: THREE.Object3D,
  color: number,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  opts?: { flat?: boolean; rough?: number },
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    flatShading: opts?.flat ?? true,
    roughness: opts?.rough ?? 0.9,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const LAND_TOP = 10;
const LAND_THICK = 60;

/** A blocky shoreline: a bulk slab plus a jagged voxel rim, with optional bays. */
function shore(
  group: THREE.Group,
  opts: {
    side: 'south' | 'north';
    bulkEdgeZ: number; // z of the straight inner edge of the bulk landmass
    farZ: number; // z of the outer edge (off-screen)
    rimMin: number; // nearest the rim tiles reach toward the channel
    rimMax: number; // farthest back a rim tile sits
    bays: [number, number][]; // x-ranges kept as open water (e.g. Circular Quay)
  },
): void {
  const { side, bulkEdgeZ, farZ, rimMin, rimMax, bays } = opts;
  const dir = side === 'south' ? 1 : -1; // south land extends toward +z
  const x0 = -4200;
  const x1 = 4200;

  // Bulk landmass.
  const bulkDepth = Math.abs(farZ - bulkEdgeZ);
  box(group, C.land, x1 - x0, LAND_THICK, bulkDepth, (x0 + x1) / 2, LAND_TOP - LAND_THICK / 2, (bulkEdgeZ + farZ) / 2);

  // Jagged voxel rim (the actual coastline you fly over).
  const step = 130;
  for (let x = x0; x < x1; x += step) {
    const inBay = bays.some(([a, b]) => x + step / 2 > a && x + step / 2 < b);
    if (inBay) continue;
    const frontOffset = rimMin + rnd() * (rimMax - rimMin);
    const frontZ = bulkEdgeZ - dir * frontOffset;
    const depth = Math.abs(bulkEdgeZ - frontZ) + 20;
    const h = LAND_TOP + 2 + rnd() * 8;
    const cz = (bulkEdgeZ + frontZ) / 2;
    box(group, rnd() > 0.5 ? C.land : C.landHi, step - 6, h, depth, x + step / 2, h / 2 - LAND_THICK / 2 + 5, cz, {
      rough: 1,
    });
    // Sandy edge tile at the waterline.
    box(group, C.sand, step - 10, 6, 26, x + step / 2, 3, frontZ - dir * 10, { rough: 1 });
  }
}

function buildBridge(group: THREE.Group): void {
  const bridge = new THREE.Group();
  // The bridge runs roughly north-south across the channel near x ~ 0.
  const zSouth = 60; // Dawes Point (city) side
  const zNorth = -820; // Milsons Point side
  const span = zSouth - zNorth;
  const zc = (zSouth + zNorth) / 2;
  const deckY = 78;
  const archApex = 210;
  const trussX = 46;

  // Sandstone pylons at each end (two per end).
  for (const z of [zSouth - 30, zNorth + 30]) {
    for (const x of [-trussX - 12, trussX + 12]) {
      box(bridge, 0xcbbf9a, 34, 150, 46, x, 75, z);
    }
  }

  // Deck.
  box(bridge, C.bridgeDeck, 118, 8, span, 0, deckY, zc);

  // Two parabolic steel arches with vertical hangers.
  const segs = 22;
  for (const sx of [-trussX, trussX]) {
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const z = zNorth + t * span;
      const y = deckY + 18 + archApex * (1 - Math.pow(2 * t - 1, 2));
      const cur = new THREE.Vector3(sx, y, z);
      if (prev) {
        const mid = prev.clone().add(cur).multiplyScalar(0.5);
        const len = prev.distanceTo(cur);
        const seg = box(bridge, C.bridge, 10, 10, len, mid.x, mid.y, mid.z);
        seg.lookAt(cur);
      }
      // Vertical hanger down to the deck.
      if (i % 2 === 0 && y > deckY + 24) {
        box(bridge, C.bridge, 3, y - deckY, 3, sx, (y + deckY) / 2, z);
      }
      prev = cur;
    }
  }
  // Cross-braces between the two arches.
  for (let i = 2; i < segs - 1; i += 3) {
    const t = i / segs;
    const z = zNorth + t * span;
    const y = deckY + 18 + archApex * (1 - Math.pow(2 * t - 1, 2));
    box(bridge, C.bridge, trussX * 2, 5, 5, 0, y, z);
  }
  group.add(bridge);
}

function buildOperaHouse(group: THREE.Group): void {
  // Bennelong Point — east of Circular Quay, just off the south shore.
  const opera = new THREE.Group();
  opera.position.set(360, 0, -70);

  // Podium.
  box(opera, C.sand, 200, 14, 120, 0, 7, 0, { rough: 1 });
  box(opera, 0xb0602a, 200, 4, 120, 0, 15, 0); // terracotta rim

  const shellMat = new THREE.MeshStandardMaterial({
    color: C.opera,
    flatShading: false,
    roughness: 0.35,
    metalness: 0.05,
  });

  // Two rows of sail shells of decreasing size.
  const makeShell = (x: number, z: number, s: number, tilt: number) => {
    const geo = new THREE.SphereGeometry(s, 16, 12, 0, Math.PI, 0, Math.PI / 2);
    const shell = new THREE.Mesh(geo, shellMat);
    shell.scale.set(0.6, 1.15, 1);
    shell.position.set(x, 14, z);
    shell.rotation.y = tilt;
    shell.castShadow = true;
    opera.add(shell);
  };
  const sizes = [46, 38, 30, 22];
  sizes.forEach((s, i) => makeShell(-40, -30 + i * 26, s, Math.PI));
  sizes.forEach((s, i) => makeShell(40, -30 + i * 26, s, 0));

  group.add(opera);
}

function buildSkyline(group: THREE.Group): void {
  // CBD towers on the south (city) shore behind Circular Quay.
  const towers = new THREE.Group();
  for (let i = 0; i < 34; i++) {
    const x = -560 + rnd() * 1120;
    const z = 360 + rnd() * 900;
    const h = 90 + rnd() * 430;
    const w = 40 + rnd() * 44;
    box(towers, rnd() > 0.5 ? C.tower : C.towerHi, w, h, w, x, LAND_TOP + h / 2, z);
  }
  group.add(towers);
}

/** Assemble the whole city + landmarks. */
export function buildCity(): THREE.Group {
  const group = new THREE.Group();

  // South (city) shore + the Circular Quay bay.
  shore(group, {
    side: 'south',
    bulkEdgeZ: 380,
    farZ: 4200,
    rimMin: 40,
    rimMax: 240,
    bays: [
      [-190, 190], // Circular Quay
      [900, 1300], // a cove east
    ],
  });

  // North shore (North Sydney / Kirribilli).
  shore(group, {
    side: 'north',
    bulkEdgeZ: -760,
    farZ: -4200,
    rimMin: 40,
    rimMax: 260,
    bays: [
      [-360, -80], // Lavender Bay / Milsons Point
      [700, 1000],
    ],
  });

  buildBridge(group);
  buildOperaHouse(group);
  buildSkyline(group);
  return group;
}
