import * as THREE from 'three';

import { CONFIG } from '@/shared/config';
import type { Ferry } from '@/shared/contract';
import { headingFromMove, toWorld, type World } from '@/shared/geo';
import { makeTextSprite } from './labels';

/**
 * A box (w×h×d) whose four vertical corners are rounded — used for the
 * First Fleet-class ferry's characteristically rounded superstructure ends.
 * Built by extruding a rounded rectangle (footprint in X/Z) upward along Y,
 * then centring it on the origin. `w` = beam (X), `d` = length (Z), `h` = up.
 */
function roundedBoxGeometry(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.max(0.05, Math.min(r, hw - 0.05, hd - 0.05));
  const shape = new THREE.Shape();
  shape.moveTo(-hw + rr, -hd);
  shape.lineTo(hw - rr, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  shape.lineTo(hw, hd - rr);
  shape.quadraticCurveTo(hw, hd, hw - rr, hd);
  shape.lineTo(-hw + rr, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - rr);
  shape.lineTo(-hw, -hd + rr);
  shape.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.rotateX(-Math.PI / 2); // extrude axis (was +Z) → +Y (up)
  geo.translate(0, -h / 2, 0); // centre on origin
  geo.computeVertexNormals();
  return geo;
}

/**
 * The vessel hull built by **lofting**: a series of cross-section "stations"
 * from stern to bow, each a smooth rounded-V outline whose beam and draft taper
 * toward a fine bow entry, with a rising **sheer** (deck edge sweeps up at the
 * bow) — stitched into a curved shell with a deck cap and a transom. Genuine
 * hull curvature rather than a box. Bow points +Z; centred on X and Z.
 */
function buildHull(
  len: number,
  maxHalfWidth: number,
  maxDepth: number,
  deckY: number,
  sheer: number,
): THREE.BufferGeometry {
  const NS = 28; // stations along the length
  const NU = 14; // points across each cross-section
  const zStern = -len / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  // Per-station beam/draft shape as a function of t (0 = stern, 1 = bow).
  const stationZ: number[] = [];
  const stationPts: [number, number][][] = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const z = zStern + t * len;
    // Beam: near-full amidships, slightly pinched transom, fine taper to bow.
    let wf: number;
    if (t < 0.12) wf = 0.84 + (t / 0.12) * 0.16;
    else if (t < 0.64) wf = 1.0;
    else wf = Math.max(0.05, 1 - ((t - 0.64) / 0.36) ** 1.7);
    // Draft: full amidships, forefoot rises sharply toward the bow.
    const df = t > 0.68 ? Math.max(0.12, 1 - ((t - 0.68) / 0.32) * 0.9) : 1.0;
    // Sheer: deck edge sweeps up toward the bow (and a touch at the stern).
    const topY = deckY + sheer * Math.max(0, (t - 0.5) / 0.5) ** 1.7 + 0.3 * Math.max(0, (0.12 - t) / 0.12);
    const hw = maxHalfWidth * wf;
    const keelY = -maxDepth * df;
    const pts: [number, number][] = [];
    for (let j = 0; j <= NU; j++) {
      const u = -1 + (2 * j) / NU;
      const x = u * hw;
      // Rounded-V section: keel at u=0, deck edge at u=±1 (power >1 = firm bilge).
      const y = keelY + (topY - keelY) * Math.abs(u) ** 1.7;
      pts.push([x, y]);
    }
    stationZ.push(z);
    stationPts.push(pts);
  }

  // Hull shell (quads between adjacent stations).
  const idx = (i: number, j: number) => i * (NU + 1) + j;
  for (let i = 0; i <= NS; i++) for (const [x, y] of stationPts[i]) positions.push(x, y, stationZ[i]);
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < NU; j++) {
      const a = idx(i, j);
      const b = idx(i, j + 1);
      const c = idx(i + 1, j + 1);
      const d = idx(i + 1, j);
      indices.push(a, b, d, b, c, d);
    }

  // Flat deck cap (ribbon between the two deck edges of each station).
  const topBase = positions.length / 3;
  for (let i = 0; i <= NS; i++) {
    const p = stationPts[i][0];
    const q = stationPts[i][NU];
    positions.push(p[0], p[1], stationZ[i], q[0], q[1], stationZ[i]);
  }
  for (let i = 0; i < NS; i++) {
    const a = topBase + i * 2;
    const b = topBase + i * 2 + 1;
    const c = topBase + (i + 1) * 2 + 1;
    const d = topBase + (i + 1) * 2;
    indices.push(a, b, c, a, c, d);
  }

  // Transom (flat stern face) — a fan over station 0's outline.
  const transBase = positions.length / 3;
  for (const [x, y] of stationPts[0]) positions.push(x, y, stationZ[0]);
  for (let j = 1; j < NU; j++) indices.push(transBase, transBase + j, transBase + j + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface FerryEntity {
  group: THREE.Group;
  hull: THREE.Mesh;
  prev: World;
  target: World;
  /** performance.now() when the current prev→target segment began. */
  segStart: number;
  segDuration: number;
  heading: number;
  targetHeading: number;
  ts: number;
  destination: string;
}

/**
 * Owns one mesh per ferry. On each feed it stores previous + target world
 * positions and tweens between them every frame (the feed has no speed field,
 * so motion is pure interpolation between samples), rotating each hull to face
 * its direction of travel and bobbing it on the swell.
 */
export class FerryManager {
  readonly group = new THREE.Group();
  private readonly ferries = new Map<string, FerryEntity>();
  /** Detailed vessel geometry, built once and cloned per ferry. */
  private template?: THREE.Group;
  private readonly mat = {
    // Livery sampled from the real "Friendship": deep-green hull, cream/pale-
    // yellow superstructure, dark tinted glazing, green eave trim, black
    // rubbing strake + boot-top, cream mast, dark radar/antennae.
    hull: new THREE.MeshStandardMaterial({ color: 0x0e7a3d, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, envMapIntensity: 0.85 }),
    cabin: new THREE.MeshStandardMaterial({ color: 0xeee0a4, roughness: 0.55, metalness: 0.02, envMapIntensity: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0e7a3d, roughness: 0.45, envMapIntensity: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x12181d, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.5 }),
    deckf: new THREE.MeshStandardMaterial({ color: 0xb3ab94, roughness: 0.85, envMapIntensity: 0.4 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xe7dfc0, roughness: 0.6, envMapIntensity: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xeee0a4, roughness: 0.5, envMapIntensity: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1e242a, roughness: 0.5, metalness: 0.5, envMapIntensity: 1.0 }),
    black: new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.85 }),
    ring: new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.5 }),
    flag: new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.6, side: THREE.DoubleSide }),
    navRed: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 2.2 }),
    navGreen: new THREE.MeshStandardMaterial({ color: 0x003000, emissive: 0x24ff34, emissiveIntensity: 2.2 }),
    navWhite: new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff2cc, emissiveIntensity: 2.2 }),
  };

  /** Update ferry set + positions from a feed. */
  ingest(ferries: Ferry[]): void {
    const seen = new Set<string>();
    const now = performance.now();

    for (const f of ferries) {
      seen.add(f.id);
      const target = toWorld(f.lat, f.lon);
      const existing = this.ferries.get(f.id);

      if (!existing) {
        this.spawn(f, target);
        continue;
      }

      // Freeze the current interpolated position as the new segment's start.
      existing.prev = this.currentPos(existing, now);
      existing.target = target;
      existing.segStart = now;
      existing.segDuration = CONFIG.pollMs;
      existing.ts = f.ts;
      existing.destination = f.destination;
      const h = headingFromMove(existing.prev, target);
      if (!Number.isNaN(h)) existing.targetHeading = h;
    }

    // Despawn ferries whose latest sample is stale.
    for (const [id, e] of this.ferries) {
      if (!seen.has(id) && Date.now() - e.ts > CONFIG.staleMs) {
        this.group.remove(e.group);
        this.ferries.delete(id);
      }
    }
  }

  /** Per-frame tween + heading + bob. */
  update(dt: number, elapsed: number): void {
    const now = performance.now();
    for (const e of this.ferries.values()) {
      const p = this.currentPos(e, now);
      const bob = Math.sin(elapsed * 1.4 + p.x * 0.01) * 1.5;
      e.group.position.set(p.x, 6 + bob, p.z);
      // Smoothly rotate toward travel heading.
      let d = e.targetHeading - e.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.heading += d * Math.min(1, dt * 3);
      e.group.rotation.y = e.heading;
    }
  }

  /** Hull meshes for click-to-board raycasting. */
  boardableHulls(): THREE.Object3D[] {
    return [...this.ferries.values()].map((e) => e.hull);
  }

  groupForHull(hull: THREE.Object3D): THREE.Group | null {
    for (const e of this.ferries.values()) if (e.hull === hull) return e.group;
    return null;
  }

  infoForHull(hull: THREE.Object3D): { id: string; destination: string } | null {
    for (const [id, e] of this.ferries) if (e.hull === hull) return { id, destination: e.destination };
    return null;
  }

  get count(): number {
    return this.ferries.size;
  }

  private currentPos(e: FerryEntity, now: number): World {
    const t = Math.min(1, (now - e.segStart) / e.segDuration);
    return {
      x: e.prev.x + (e.target.x - e.prev.x) * t,
      z: e.prev.z + (e.target.z - e.prev.z) * t,
    };
  }

  private spawn(f: Ferry, target: World): void {
    // Clone the shared, detailed vessel template (geometry + materials are
    // shared by reference, so many ferries stay cheap) and personalise it.
    const g = (this.template ??= this.buildTemplate()).clone(true);
    const hull = g.getObjectByName('boarding') as THREE.Mesh;
    hull.userData.ferryId = f.id;

    // Name label above the vessel (per-ferry, so added after cloning).
    const label = makeTextSprite(f.name);
    label.position.set(0, 22, 0);
    g.add(label);

    g.position.set(target.x, 6, target.z);
    this.group.add(g);

    this.ferries.set(f.id, {
      group: g,
      hull,
      prev: target,
      target,
      segStart: performance.now(),
      segDuration: CONFIG.pollMs,
      heading: 0,
      targetHeading: 0,
      ts: f.ts,
      destination: f.destination,
    });
  }

  /**
   * Builds the detailed Sydney Ferries "Friendship" (First Fleet-class) once:
   * a single lofted deep-green hull with a rising sheer, black rubbing strake +
   * boot-top, a cream/pale-yellow two-deck superstructure with dark tinted
   * glazing + cream window frames + green eave trim, a forward wheelhouse, a
   * low aft exhaust, a cream mast with radar, antennae, a red flag and
   * navigation lights, aft-deck railings and life rings — matching the real
   * vessel's livery. Modelled ~1.2× real scale (real LOA 25.4 m) for harbour
   * visibility. Bow points +Z; waterline ≈ local Y 0.
   */
  private buildTemplate(): THREE.Group {
    const g = new THREE.Group();
    const m = this.mat;
    const LEN = 30;
    const HALF_BEAM = 5.3;

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
      add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

    // ── Green hull (single lofted displacement hull, rising sheer) ────────────
    add(buildHull(LEN - 4, HALF_BEAM, 2.8, 2.9, 0.9), m.hull, 0, 0, -1);
    // Black rubbing strake at the deck edge + boot-top at the waterline.
    box(m.black, 0.32, 0.5, 20, -HALF_BEAM, 2.6, -1);
    box(m.black, 0.32, 0.5, 20, HALF_BEAM, 2.6, -1);
    box(m.black, 0.3, 0.45, 19, -HALF_BEAM + 0.5, 0.5, -1);
    box(m.black, 0.3, 0.45, 19, HALF_BEAM - 0.5, 0.5, -1);
    // Deck floor (grey) recessed into the hull top.
    add(roundedBoxGeometry(9.8, 0.4, LEN - 5, 1.4), m.deckf, 0, 2.95, -1);
    // Green foredeck bulwark (carries the white name on the real ship).
    add(roundedBoxGeometry(9.0, 1.4, 3.0, 0.9), m.hull, 0, 4.0, 11);

    // ── Lower saloon (main enclosed cabin, cream) — boarding target ───────────
    const hull = add(roundedBoxGeometry(9.0, 3.2, 24, 1.7), m.cabin, 0, 4.9, -1.5);
    hull.name = 'boarding';
    add(roundedBoxGeometry(9.1, 1.6, 22.2, 1.7), m.glass, 0, 5.05, -1.5); // glazing
    add(roundedBoxGeometry(9.15, 0.32, 22.8, 1.75), m.trim, 0, 6.3, -1.5); // green eave
    add(roundedBoxGeometry(9.3, 0.45, 24.2, 1.8), m.roof, 0, 6.7, -1.5); // roof
    this.addMullions(g, 4.58, 5.05, 1.55, -10, 8, 1.7);
    box(m.frame, 0.14, 2.1, 1.3, -4.55, 4.55, -9); // doors
    box(m.frame, 0.14, 2.1, 1.3, 4.55, 4.55, -9);

    // ── Upper deck (set back, cream) with aft open deck + railing ─────────────
    add(roundedBoxGeometry(7.6, 2.6, 15.5, 1.5), m.cabin, 0, 8.25, -3);
    add(roundedBoxGeometry(7.7, 1.4, 13.8, 1.5), m.glass, 0, 8.4, -3);
    add(roundedBoxGeometry(7.75, 0.28, 15.7, 1.5), m.trim, 0, 9.6, -3);
    add(roundedBoxGeometry(7.85, 0.4, 15.7, 1.5), m.roof, 0, 9.8, -3);
    this.addMullions(g, 3.88, 8.4, 1.35, -8, 6, 1.7);
    this.addRailing(g, m.frame, -3.8, 3.8, -13, -7, 6.95);

    // ── Wheelhouse (forward, cream, green roof trim) ─────────────────────────
    add(roundedBoxGeometry(5.4, 2.3, 4.6, 1.2), m.cabin, 0, 11.15, 4);
    add(roundedBoxGeometry(5.5, 1.4, 4.7, 1.2), m.glass, 0, 11.3, 4);
    add(roundedBoxGeometry(5.55, 0.28, 4.75, 1.2), m.trim, 0, 12.35, 4);
    add(roundedBoxGeometry(5.5, 0.2, 4.65, 1.15), m.roof, 0, 12.55, 4);

    // ── Low aft exhaust vent (no tall funnel on this class) ──────────────────
    box(m.cabin, 1.7, 1.3, 1.9, 0, 10.65, -9);
    add(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 10), m.black, -0.5, 11.9, -9);
    add(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 10), m.black, 0.5, 11.9, -9);

    // ── Cream mast with radar, antenna, red flag ──────────────────────────────
    add(new THREE.CylinderGeometry(0.12, 0.15, 5, 8), m.cabin, 0, 15, 3.2);
    box(m.dark, 2.4, 0.12, 0.12, 0, 16.3, 3.2); // cross-yard
    box(m.dark, 1.5, 0.2, 0.5, 0, 13.6, 3.2); // radar scanner
    add(new THREE.CylinderGeometry(0.03, 0.03, 2, 6), m.dark, 0.9, 17.4, 3.2); // antenna whip
    box(m.flag, 0.02, 0.7, 1.0, -1.0, 15.9, 3.2); // red flag

    // ── Navigation lights + life rings ───────────────────────────────────────
    const navLight = (mat: THREE.Material, x: number, y: number, z: number) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat);
      s.position.set(x, y, z);
      g.add(s);
    };
    navLight(m.navRed, -2.85, 11.5, 3.6); // port
    navLight(m.navGreen, 2.85, 11.5, 3.6); // starboard
    navLight(m.navWhite, 0, 17.0, 3.2); // masthead
    navLight(m.navWhite, 0, 7.0, -13.2); // stern
    const ringGeo = new THREE.TorusGeometry(0.42, 0.13, 8, 16);
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(ringGeo, m.ring);
      ring.position.set(sx * 4.62, 5.3, 5.0);
      ring.rotation.y = (sx * Math.PI) / 2;
      ring.castShadow = true;
      g.add(ring);
    }

    return g;
  }

  /** Vertical window-frame mullions down both sides of a glazing band. */
  private addMullions(
    g: THREE.Group,
    x: number,
    y: number,
    h: number,
    z0: number,
    z1: number,
    step: number,
  ): void {
    const geo = new THREE.BoxGeometry(0.16, h, 0.16);
    for (let z = z0; z <= z1 + 1e-6; z += step) {
      for (const sx of [-x, x]) {
        const bar = new THREE.Mesh(geo, this.mat.frame);
        bar.position.set(sx, y, z);
        g.add(bar);
      }
    }
  }

  /** Add a simple perimeter railing (top rail + evenly-spaced posts) around a
   *  rectangular open-deck footprint at height `y`. */
  private addRailing(
    g: THREE.Group,
    mat: THREE.Material,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
  ): void {
    const H = 1.1; // railing height
    const R = 0.06; // rail/post thickness
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const rail = (sx: number, sz: number, px: number, pz: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, R * 2, sz), mat);
      mesh.position.set(px, y + H, pz);
      g.add(mesh);
    };
    // Top rails on all four sides.
    rail(w, R * 2, cx, z0);
    rail(w, R * 2, cx, z1);
    rail(R * 2, d, x0, cz);
    rail(R * 2, d, x1, cz);
    // Corner + evenly-spaced posts along the two long sides.
    const posts = Math.max(2, Math.round(d / 2.4));
    for (let i = 0; i <= posts; i++) {
      const pz = z0 + (d * i) / posts;
      for (const px of [x0, x1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(R * 2, H, R * 2), mat);
        post.position.set(px, y + H / 2, pz);
        g.add(post);
      }
    }
  }
}
