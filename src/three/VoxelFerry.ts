import * as THREE from 'three';

import type { DeckId, DeckOccupancy } from '@/shared/contract';
import { DEFAULT_FERRY_SPEC } from '@/three/ferries/types';
import type { FerryModelSpec } from '@/three/ferries/types';

/**
 * A blocky, voxel-style ferry built entirely from boxes — a lower enclosed
 * saloon, an optional set-back upper deck, and a wheelhouse (the "driving"
 * capital section) — populated with little voxel passengers that walk around
 * each deck. Hull proportions, livery colours, deck count and hull type (twin
 * catamaran pontoons vs. a single monohull) come from a `FerryModelSpec` so
 * each real vessel (see `src/three/ferries/`) renders with its own look.
 * Passenger counts are driven by the Fabric digital-twin occupancy so the
 * scene mirrors what the telemetry reports. Voxel look and character
 * construction follow the design of qkfang/zava-claims-agent.
 *
 * Bow points +Z. Local units are roughly metres.
 */

/** One walkable deck: its floor height and the rectangle passengers roam in. */
interface DeckArea {
  deck: DeckId;
  y: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Cap on rendered figures so a full ferry stays performant. */
  cap: number;
}

/** Deck walk areas scaled to the vessel's hull length/beam; `upper` is omitted
 * for single-deck vessels so no passengers spawn on a deck that doesn't exist. */
function buildDeckAreas(spec: FerryModelSpec): Partial<Record<DeckId, DeckArea>> {
  const { length: lengthScale, beam: beamScale } = spec.scale;
  const areas: Partial<Record<DeckId, DeckArea>> = {
    lower: {
      deck: 'lower',
      y: 2.1,
      minX: -6.0 * beamScale,
      maxX: 6.0 * beamScale,
      minZ: -17 * lengthScale,
      maxZ: 12 * lengthScale,
      cap: 12,
    },
  };
  const bridgeY = spec.decks === 2 ? 7.0 : 4.6;
  if (spec.decks === 2) {
    areas.upper = {
      deck: 'upper',
      y: 7.0,
      minX: -4.8 * beamScale,
      maxX: 4.8 * beamScale,
      minZ: -13 * lengthScale,
      maxZ: 5 * lengthScale,
      cap: 8,
    };
  }
  areas.bridge = {
    deck: 'bridge',
    y: bridgeY,
    minX: -2.0 * beamScale,
    maxX: 2.0 * beamScale,
    minZ: 13 * lengthScale,
    maxZ: 16 * lengthScale,
    cap: 1,
  };
  return areas;
}

/** A few voxel-character colour packs (skin / shirt / trousers). */
const PALETTES: { skin: number; shirt: number; trousers: number }[] = [
  { skin: 0xf1c9a5, shirt: 0x2f6fb0, trousers: 0x2b2f36 },
  { skin: 0xd9a06b, shirt: 0xcf4b3a, trousers: 0x37414a },
  { skin: 0x8d5a3c, shirt: 0x2f9e6b, trousers: 0x3b3f47 },
  { skin: 0xf3d1b0, shirt: 0xe0a020, trousers: 0x394150 },
  { skin: 0xc98a5e, shirt: 0x7a4fb0, trousers: 0x2b2f36 },
  { skin: 0xe8b892, shirt: 0x40a0c0, trousers: 0x333a42 },
];

/** A whimsical, fictional travel card shown when a passenger is clicked. */
export interface PassengerTicket {
  ticketNo: string;
  name: string;
  from: string;
  to: string;
  journeyMin: number;
  mood: string;
  wantsToSee: string;
  drink: string;
  deck: string;
}

const WHARVES = [
  'Circular Quay',
  'Manly',
  'Taronga Zoo',
  'Watsons Bay',
  'Darling Harbour',
  'Barangaroo',
  'Balmain',
  'Cockatoo Island',
  'Mosman Bay',
  'Double Bay',
  'Rose Bay',
  'Neutral Bay',
];
const NAMES = [
  'Ava',
  'Leo',
  'Mia',
  'Noah',
  'Zoe',
  'Kai',
  'Ivy',
  'Ezra',
  'Lily',
  'Finn',
  'Isla',
  'Otis',
];
const MOODS = [
  'Relaxed',
  'Excited',
  'Sleepy',
  'Cheerful',
  'Pensive',
  'Awe-struck',
  'Chatty',
  'Content',
];
const SIGHTS = [
  'the Opera House',
  'the Harbour Bridge',
  'the city skyline at dusk',
  'passing sailboats',
  'Fort Denison',
  'the Manly shoreline',
  'a pod of dolphins',
  'the ferry wake',
];
const DRINKS = [
  'Flat white',
  'Long black',
  'Sparkling water',
  'Cold beer',
  'Chai latte',
  'Lemonade',
  'Iced tea',
  'Ginger ale',
];
const DECK_NAME: Record<DeckId, string> = {
  lower: 'Lower saloon',
  upper: 'Upper deck',
  bridge: 'Wheelhouse',
};

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function makeTicket(deck: DeckId): PassengerTicket {
  let from = pick(WHARVES);
  let to = pick(WHARVES);
  while (to === from) to = pick(WHARVES);
  return {
    ticketNo: 'SF-' + Math.floor(1000 + Math.random() * 9000),
    name: pick(NAMES),
    from,
    to,
    journeyMin: 8 + Math.floor(Math.random() * 38),
    mood: pick(MOODS),
    wantsToSee: pick(SIGHTS),
    drink: pick(DRINKS),
    deck: DECK_NAME[deck],
  };
}

interface Passenger {
  group: THREE.Group;
  area: DeckArea;
  target: THREE.Vector3;
  speed: number;
  phase: number;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  ticket: PassengerTicket;
}

export class VoxelFerry {
  readonly group = new THREE.Group();
  private readonly spec: FerryModelSpec;
  private readonly deckAreas: Partial<Record<DeckId, DeckArea>>;
  private readonly passengers: Passenger[] = [];
  private readonly perDeck = new Map<DeckId, Passenger[]>();

  // Enclosing surfaces (hull, cabin walls, glazing, roof) are rendered as a
  // translucent "cutaway" shell so the decks and passengers inside stay
  // visible from any outside angle. Structural pieces (floors, rails, trim,
  // funnel) stay opaque so the vessel still reads as solid. Colours come from
  // the ferry's livery spec so each real vessel matches its own reference photo.
  private readonly mat: Record<
    'hull' | 'boot' | 'cabin' | 'deck' | 'glass' | 'trim' | 'roof' | 'rail' | 'funnel' | 'seat' | 'frame' | 'wood',
    THREE.MeshStandardMaterial
  >;

  constructor(spec: FerryModelSpec = DEFAULT_FERRY_SPEC) {
    this.spec = spec;
    this.deckAreas = buildDeckAreas(spec);
    const { livery } = spec;
    this.mat = {
      hull: new THREE.MeshStandardMaterial({
        color: livery.hull,
        roughness: 0.6,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      boot: new THREE.MeshStandardMaterial({ color: livery.boot, roughness: 0.8 }),
      cabin: new THREE.MeshStandardMaterial({
        color: livery.cabin,
        roughness: 0.7,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      deck: new THREE.MeshStandardMaterial({ color: 0xb3ab94, roughness: 0.9 }),
      glass: new THREE.MeshStandardMaterial({
        color: livery.glass,
        roughness: 0.2,
        metalness: 0.6,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      trim: new THREE.MeshStandardMaterial({ color: livery.trim, roughness: 0.5 }),
      roof: new THREE.MeshStandardMaterial({
        color: livery.roof,
        roughness: 0.7,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      rail: new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.6 }),
      funnel: new THREE.MeshStandardMaterial({ color: livery.funnel, roughness: 0.6 }),
      seat: new THREE.MeshStandardMaterial({ color: 0xb23a3a, roughness: 0.75 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.4 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.7 }),
    };
    this.buildFerry();
    for (const d of Object.keys(this.deckAreas) as DeckId[]) this.perDeck.set(d, []);
  }

  /** Match the number of rendered figures on each deck to the twin occupancy. */
  setOccupancy(decks: DeckOccupancy[]): void {
    for (const d of decks) {
      const area = this.deckAreas[d.deck];
      if (!area) continue;
      const want = Math.min(area.cap, Math.round((d.occupancy / Math.max(1, d.capacity)) * area.cap));
      const list = this.perDeck.get(d.deck)!;
      while (list.length < want) this.spawnPassenger(area, list);
      while (list.length > want) this.removePassenger(list);
    }
  }

  /** Walk every passenger toward its target with a simple two-legged gait. */
  update(dt: number): void {
    for (const p of this.passengers) {
      const pos = p.group.position;
      const dir = p.target.clone().sub(pos);
      dir.y = 0;
      if (dir.length() < 0.4) {
        p.target = this.randomPoint(p.area);
      } else {
        dir.normalize();
        pos.addScaledVector(dir, p.speed * dt);
        p.group.rotation.y = Math.atan2(dir.x, dir.z);
      }
      // Little leg swing so figures read as "walking".
      p.phase += dt * 8;
      const swing = Math.sin(p.phase) * 0.5;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const mat of Object.values(this.mat)) mat.dispose();
  }

  /** Walk up from a raycast-hit object to the passenger it belongs to. */
  ticketFor(obj: THREE.Object3D | null): PassengerTicket | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      const t = o.userData?.ticket as PassengerTicket | undefined;
      if (t) return t;
      o = o.parent;
    }
    return null;
  }

  // --- Ferry hull + superstructure -------------------------------------------

  private box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    // Translucent cutaway panels don't cast shadows, so the interior decks and
    // passengers stay lit and readable through the shell.
    mesh.castShadow = !(mat as THREE.Material).transparent;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Centre of the wheelhouse block: forward on classic double-decked ferries,
   * built into the single saloon's roof on modern single-deck catamarans. */
  private wheelhouseCenter(): { y: number; z: number } {
    const { decks, wheelhouse, scale } = this.spec;
    return {
      y: decks === 2 ? 8.5 : 6.0,
      z: (wheelhouse === 'forward' ? 14.5 : -2) * scale.length,
    };
  }

  private buildFerry(): void {
    const m = this.mat;
    const { hullType, scale, decks, hasFunnel } = this.spec;
    const L = scale.length;
    const B = scale.beam;
    const beam = 13 * B;
    const hullLen = 40 * L;
    const bowZ = 21.5 * L;
    const bowLen = 5 * L;

    // Hull + waterline boot-top. Catamarans get twin pontoons either side of
    // the centreline gap; a monohull (e.g. Freshwater class) gets one hull.
    if (hullType === 'catamaran') {
      const pontoonW = beam * 0.36;
      const half = (pontoonW + beam * 0.1) / 2;
      for (const side of [-1, 1] as const) {
        const x = side * half;
        this.box(m.hull, pontoonW, 2.4, hullLen, x, 0.8, 0);
        this.box(m.boot, pontoonW + 0.2, 0.6, hullLen + 0.2, x, -0.4, 0);
        this.box(m.hull, pontoonW * 0.85, 2.2, bowLen, x, 0.9, bowZ);
      }
    } else {
      this.box(m.hull, beam, 2.4, hullLen, 0, 0.8, 0);
      this.box(m.boot, beam + 0.2, 0.6, hullLen + 0.2, 0, -0.4, 0);
      this.box(m.hull, beam * 0.62, 2.2, bowLen, 0, 0.9, bowZ);
    }

    // Lower deck floor (widened for more usable saloon space).
    this.box(m.deck, beam * 0.97, 0.3, hullLen * 0.9, 0, 2.0, -1 * L);

    // Lower saloon (enclosed cabin) with a dark glazing band + roof.
    this.box(m.cabin, beam * 0.885, 3.4, hullLen * 0.75, 0, 3.9, -2 * L);
    this.box(m.glass, beam * 0.9, 1.5, hullLen * 0.7, 0, 4.3, -2 * L);
    this.box(m.trim, beam * 0.91, 0.4, hullLen * 0.755, 0, 5.7, -2 * L);
    this.box(m.roof, beam * 0.925, 0.5, hullLen * 0.7625, 0, 6.0, -2 * L);

    // Open lower fore/aft decks get simple perimeter rails.
    this.railRect(-beam * 0.46, beam * 0.46, 13 * L, 17.5 * L, 2.3);
    this.railRect(-beam * 0.46, beam * 0.46, -17 * L, -12 * L, 2.3);

    if (decks === 2) {
      // Upper deck floor + set-back saloon (widened for a roomier lounge).
      this.box(m.deck, beam * 0.815, 0.3, hullLen * 0.65, 0, 6.85, -4 * L);
      this.box(m.cabin, beam * 0.73, 2.8, hullLen * 0.5, 0, 8.4, -5 * L);
      this.box(m.glass, beam * 0.745, 1.3, hullLen * 0.45, 0, 8.7, -5 * L);
      this.box(m.trim, beam * 0.755, 0.35, hullLen * 0.505, 0, 9.9, -5 * L);
      this.box(m.roof, beam * 0.77, 0.45, hullLen * 0.5125, 0, 10.15, -5 * L);
      this.railRect(-beam * 0.385, beam * 0.385, 2.5 * L, 4.5 * L, 7.0);
    }

    // Wheelhouse — the "driving" capital section.
    const wh = this.wheelhouseCenter();
    this.box(m.cabin, beam * 0.5, 3.0, 6 * L, 0, wh.y, wh.z);
    this.box(m.glass, beam * 0.515, 1.6, 6.1 * L, 0, wh.y + 0.4, wh.z + 0.1 * L);
    this.box(m.trim, beam * 0.515, 0.35, 6.2 * L, 0, wh.y + 1.6, wh.z);
    this.box(m.roof, beam * 0.523, 0.4, 6.3 * L, 0, wh.y + 1.85, wh.z);
    // Helm console + mast hint the driving station.
    this.box(m.boot, 2.4 * B, 0.8, 0.8 * L, 0, wh.y - 0.9, wh.z + 1.9 * L);
    this.box(m.rail, 0.2, 4, 0.2, 0, wh.y + 4, wh.z - 2.5 * L);

    // Funnel — only the larger ocean-going classes (e.g. Freshwater) have one.
    if (hasFunnel) {
      this.box(m.funnel, 2.2 * B, 3.2, 2.2 * B, 0, 8.4, -13 * L);
      this.box(m.boot, 2.4 * B, 0.4, 2.4 * B, 0, 10.0, -13 * L);
    }

    this.furnish();
  }

  /** Seats, bar, captain's pit and open-air benches that dress each deck. */
  private furnish(): void {
    const { decks, scale } = this.spec;
    const L = scale.length;
    const B = scale.beam;

    // Lower saloon: forward-facing seat rows either side of a central aisle.
    for (const z of [7, 3, -1, -5]) {
      this.chair(-5.0 * B, 2.15, z * L, -1);
      this.chair(-3.6 * B, 2.15, z * L, -1);
      this.chair(3.6 * B, 2.15, z * L, -1);
      this.chair(5.0 * B, 2.15, z * L, -1);
    }
    // Lower saloon bar with stools, against the aft bulkhead.
    this.bar(0, 2.15, -12 * L);

    if (decks === 2) {
      // Upper saloon: a lounge of seats plus a small refreshment kiosk aft.
      for (const z of [1, -3, -7]) {
        this.chair(-3.8 * B, 7.0, z * L, -1);
        this.chair(3.8 * B, 7.0, z * L, -1);
      }
      this.bar(0, 7.0, -12 * L, 0.7);
    }

    // Captain's pit in the wheelhouse.
    this.captainPit();

    // Open-air benches on the bow and stern decks.
    this.bench(-3.2 * B, 2.3, 15.5 * L);
    this.bench(3.2 * B, 2.3, 15.5 * L);
    this.bench(-3.2 * B, 2.3, -15 * L);
    this.bench(3.2 * B, 2.3, -15 * L);
  }

  /** A single voxel seat; dir = -1 backrest aft, +1 backrest forward. */
  private chair(x: number, y: number, z: number, dir: 1 | -1): void {
    const s = this.mat.seat;
    const f = this.mat.frame;
    this.box(s, 0.9, 0.16, 0.9, x, y + 0.5, z);
    this.box(s, 0.9, 0.9, 0.16, x, y + 0.95, z + dir * 0.42);
    for (const sx of [-0.35, 0.35])
      for (const sz of [-0.35, 0.35]) this.box(f, 0.12, 0.5, 0.12, x + sx, y + 0.25, z + sz);
  }

  /** A bar counter with a bottle shelf and stools. `scale` shrinks a kiosk. */
  private bar(x: number, y: number, z: number, scale = 1): void {
    const w = 5 * scale;
    const wood = this.mat.wood;
    this.box(wood, w, 1.1, 1.4, x, y + 0.55, z);
    this.box(this.mat.trim, w + 0.4, 0.14, 1.7, x, y + 1.18, z);
    this.box(wood, w, 1.6, 0.4, x, y + 0.8, z - 1.6);
    const bottles = Math.round(w);
    for (let i = 0; i < bottles; i++)
      this.box(this.mat.glass, 0.16, 0.5, 0.16, x - w / 2 + 0.5 + i, y + 1.75, z - 1.6);
    const stools = Math.max(2, Math.round(w / 1.4));
    for (let i = 0; i < stools; i++) {
      const sx = x - (w / 2 - 0.6) + (i * (w - 1.2)) / Math.max(1, stools - 1);
      this.box(this.mat.frame, 0.5, 0.16, 0.5, sx, y + 0.75, z + 1.2);
      this.box(this.mat.frame, 0.1, 0.75, 0.1, sx, y + 0.37, z + 1.2);
    }
  }

  /** An open-air bench for the outdoor decks. */
  private bench(x: number, y: number, z: number): void {
    const wood = this.mat.wood;
    const f = this.mat.frame;
    this.box(wood, 3, 0.16, 0.7, x, y + 0.5, z);
    this.box(wood, 3, 0.7, 0.16, x, y + 0.85, z - 0.3);
    this.box(f, 0.12, 0.5, 0.12, x - 1.3, y + 0.25, z);
    this.box(f, 0.12, 0.5, 0.12, x + 1.3, y + 0.25, z);
  }

  /** The captain's driving pit: console, wheel and seat in the wheelhouse.
   * Faces the bow, whether the wheelhouse sits forward or amidships. */
  private captainPit(): void {
    const { wheelhouse, scale } = this.spec;
    const L = scale.length;
    const wh = this.wheelhouseCenter();
    const y = wh.y - 1.5;
    const dir: 1 | -1 = wheelhouse === 'forward' ? 1 : -1;
    this.box(this.mat.boot, 3.4, 1.0, 1.0, 0, y + 0.5, wh.z + dir * 1.3 * L);
    this.box(this.mat.glass, 3.2, 0.5, 0.25, 0, y + 1.15, wh.z + dir * 0.9 * L);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 20), this.mat.frame);
    wheel.position.set(0, y + 1.15, wh.z + dir * 0.6 * L);
    wheel.castShadow = true;
    this.group.add(wheel);
    this.chair(0, y, wh.z - dir * 1.1 * L, dir === 1 ? -1 : 1);
  }

  /** A simple voxel railing around a rectangular open deck at height `y`. */
  private railRect(x0: number, x1: number, z0: number, z1: number, y: number): void {
    const H = 1.1;
    const post = (x: number, z: number) => this.box(this.mat.rail, 0.14, H, 0.14, x, y + H / 2, z);
    const rail = (w: number, d: number, x: number, z: number) =>
      this.box(this.mat.rail, w, 0.1, d, x, y + H, z);
    rail(x1 - x0, 0.1, (x0 + x1) / 2, z0);
    rail(x1 - x0, 0.1, (x0 + x1) / 2, z1);
    rail(0.1, z1 - z0, x0, (z0 + z1) / 2);
    rail(0.1, z1 - z0, x1, (z0 + z1) / 2);
    const n = Math.max(2, Math.round((z1 - z0) / 2.5));
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      post(x0, z);
      post(x1, z);
    }
  }

  // --- Voxel passengers ------------------------------------------------------

  private buildFigure(): { group: THREE.Group; legL: THREE.Mesh; legR: THREE.Mesh } {
    const p = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: p.shirt, roughness: 0.8 });
    const trousers = new THREE.MeshStandardMaterial({ color: p.trousers, roughness: 0.8 });

    const part = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, 0);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };

    // Legs are pivoted at the hip so they can swing while walking.
    const leg = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.16, 0.7, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.28), trousers);
      mesh.position.set(0, -0.35, 0);
      mesh.castShadow = true;
      pivot.add(mesh);
      g.add(pivot);
      return pivot as unknown as THREE.Mesh;
    };
    const legL = leg(-1);
    const legR = leg(1);

    part(shirt, 0.62, 0.7, 0.36, 0, 1.05); // torso
    part(skin, 0.16, 0.5, 0.16, -0.4, 1.05); // arms
    part(skin, 0.16, 0.5, 0.16, 0.4, 1.05);
    part(skin, 0.42, 0.42, 0.42, 0, 1.65); // head

    g.scale.setScalar(1.0);
    return { group: g, legL, legR };
  }

  private spawnPassenger(area: DeckArea, list: Passenger[]): void {
    const { group, legL, legR } = this.buildFigure();
    const start = this.randomPoint(area);
    group.position.copy(start);
    const ticket = makeTicket(area.deck);
    group.userData.ticket = ticket;
    this.group.add(group);
    const p: Passenger = {
      group,
      area,
      target: this.randomPoint(area),
      speed: 1.1 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
      legL,
      legR,
      ticket,
    };
    list.push(p);
    this.passengers.push(p);
  }

  private removePassenger(list: Passenger[]): void {
    const p = list.pop();
    if (!p) return;
    const i = this.passengers.indexOf(p);
    if (i >= 0) this.passengers.splice(i, 1);
    this.group.remove(p.group);
    p.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }

  private randomPoint(area: DeckArea): THREE.Vector3 {
    return new THREE.Vector3(
      area.minX + Math.random() * (area.maxX - area.minX),
      area.y,
      area.minZ + Math.random() * (area.maxZ - area.minZ),
    );
  }
}
