import * as THREE from 'three';

import type { DeckId, DeckOccupancy } from '@/shared/contract';

/**
 * A blocky, voxel-style ferry built entirely from boxes — a lower enclosed
 * saloon, a set-back upper deck, and a forward wheelhouse (the "driving"
 * capital section) — populated with little voxel passengers that walk around
 * each deck. Passenger counts are driven by the Fabric digital-twin occupancy
 * so the scene mirrors what the telemetry reports. Voxel look and character
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

const DECK_AREAS: Record<DeckId, DeckArea> = {
  lower: { deck: 'lower', y: 2.1, minX: -6.0, maxX: 6.0, minZ: -17, maxZ: 12, cap: 12 },
  upper: { deck: 'upper', y: 7.0, minX: -4.8, maxX: 4.8, minZ: -13, maxZ: 5, cap: 8 },
  bridge: { deck: 'bridge', y: 7.0, minX: -2.0, maxX: 2.0, minZ: 13, maxZ: 16, cap: 1 },
};

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

/** A uniformed crew member shown when a staff figure is clicked. */
export interface StaffCard {
  role: string;
  name: string;
  station: string;
  duty: string;
}

/** Optional overrides that turn a plain figure into a uniformed crew member. */
interface FigureStyle {
  shirt: number;
  trousers: number;
  cap?: number;
  vest?: number;
  apron?: number;
}

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
  private readonly passengers: Passenger[] = [];
  private readonly perDeck = new Map<DeckId, Passenger[]>();
  private readonly crew: THREE.Group[] = [];

  // Enclosing surfaces (hull, cabin walls, glazing, roof) are rendered as a
  // translucent "cutaway" shell so the decks and passengers inside stay
  // visible from any outside angle. Structural pieces (floors, rails, trim,
  // funnel) stay opaque so the vessel still reads as solid.
  private readonly mat = {
    hull: new THREE.MeshStandardMaterial({
      color: 0x0e7a3d,
      roughness: 0.6,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    boot: new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.8 }),
    cabin: new THREE.MeshStandardMaterial({
      color: 0xeee0a4,
      roughness: 0.7,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    deck: new THREE.MeshStandardMaterial({ color: 0xb3ab94, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x2a3b47,
      roughness: 0.2,
      metalness: 0.6,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0e7a3d, roughness: 0.5 }),
    roof: new THREE.MeshStandardMaterial({
      color: 0xe7dfc0,
      roughness: 0.7,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    rail: new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.6 }),
    funnel: new THREE.MeshStandardMaterial({ color: 0x0e7a3d, roughness: 0.6 }),
    seat: new THREE.MeshStandardMaterial({ color: 0xb23a3a, roughness: 0.75 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.7 }),
  };

  constructor() {
    this.buildFerry();
    this.buildCrew();
    for (const d of Object.keys(DECK_AREAS) as DeckId[]) this.perDeck.set(d, []);
  }

  /** Match the number of rendered figures on each deck to the twin occupancy. */
  setOccupancy(decks: DeckOccupancy[]): void {
    for (const d of decks) {
      const area = DECK_AREAS[d.deck];
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

  /** Walk up from a raycast-hit object to the passenger group it belongs to. */
  passengerFor(obj: THREE.Object3D | null): THREE.Object3D | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      if (o.userData?.ticket || o.userData?.staff) return o;
      o = o.parent;
    }
    return null;
  }

  /** Walk up from a raycast-hit object to the passenger it belongs to. */
  ticketFor(obj: THREE.Object3D | null): PassengerTicket | null {
    const p = this.passengerFor(obj);
    return p ? (p.userData.ticket as PassengerTicket) : null;
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

  private buildFerry(): void {
    const m = this.mat;
    // Hull + waterline boot-top.
    this.box(m.hull, 13, 2.4, 40, 0, 0.8, 0);
    this.box(m.boot, 13.2, 0.6, 40.2, 0, -0.4, 0);
    // Tapered bow block.
    this.box(m.hull, 8, 2.2, 5, 0, 0.9, 21.5);
    // Lower deck floor (widened for more usable saloon space).
    this.box(m.deck, 12.6, 0.3, 36, 0, 2.0, -1);

    // Lower saloon (enclosed cabin) with a dark glazing band + roof.
    this.box(m.cabin, 11.5, 3.4, 30, 0, 3.9, -2);
    this.box(m.glass, 11.7, 1.5, 28, 0, 4.3, -2);
    this.box(m.trim, 11.8, 0.4, 30.2, 0, 5.7, -2);
    this.box(m.roof, 12, 0.5, 30.5, 0, 6.0, -2);

    // Open lower fore/aft decks get simple perimeter rails.
    this.railRect(-6, 6, 13, 17.5, 2.3);
    this.railRect(-6, 6, -17, -12, 2.3);

    // Upper deck floor + set-back saloon (widened for a roomier lounge).
    this.box(m.deck, 10.6, 0.3, 26, 0, 6.85, -4);
    this.box(m.cabin, 9.5, 2.8, 20, 0, 8.4, -5);
    this.box(m.glass, 9.7, 1.3, 18, 0, 8.7, -5);
    this.box(m.trim, 9.8, 0.35, 20.2, 0, 9.9, -5);
    this.box(m.roof, 10, 0.45, 20.5, 0, 10.15, -5);
    this.railRect(-5, 5, 2.5, 4.5, 7.0);

    // Wheelhouse — the forward "driving" capital section.
    this.box(m.cabin, 6.5, 3.0, 6, 0, 8.5, 14.5);
    this.box(m.glass, 6.7, 1.6, 6.1, 0, 8.9, 14.6);
    this.box(m.trim, 6.7, 0.35, 6.2, 0, 10.1, 14.5);
    this.box(m.roof, 6.8, 0.4, 6.3, 0, 10.35, 14.5);
    // Helm console + mast hint the driving station.
    this.box(m.boot, 2.4, 0.8, 0.8, 0, 7.6, 16.4);
    this.box(m.rail, 0.2, 4, 0.2, 0, 12.5, 12);

    // Aft funnel.
    this.box(m.funnel, 2.2, 3.2, 2.2, 0, 8.4, -13);
    this.box(m.boot, 2.4, 0.4, 2.4, 0, 10.0, -13);

    this.furnish();
  }

  /** Seats, bar, captain's pit and open-air benches that dress each deck. */
  private furnish(): void {
    // Lower saloon: forward-facing seat rows either side of a central aisle.
    for (const z of [7, 3, -1, -5]) {
      this.chair(-5.0, 2.15, z, -1);
      this.chair(-3.6, 2.15, z, -1);
      this.chair(3.6, 2.15, z, -1);
      this.chair(5.0, 2.15, z, -1);
    }
    // Lower saloon bar with stools, against the aft bulkhead.
    this.bar(0, 2.15, -12);

    // Upper saloon: a lounge of seats plus a small refreshment kiosk aft.
    for (const z of [1, -3, -7]) {
      this.chair(-3.8, 7.0, z, -1);
      this.chair(3.8, 7.0, z, -1);
    }
    this.bar(0, 7.0, -12, 0.7);

    // Captain's pit in the forward wheelhouse.
    this.captainPit();

    // Open-air benches on the bow and stern decks.
    this.bench(-3.2, 2.3, 15.5);
    this.bench(3.2, 2.3, 15.5);
    this.bench(-3.2, 2.3, -15);
    this.bench(3.2, 2.3, -15);
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

  /** The captain's driving pit: console, wheel and seat in the wheelhouse. */
  private captainPit(): void {
    const y = 7.0;
    this.box(this.mat.boot, 3.4, 1.0, 1.0, 0, y + 0.5, 15.8);
    this.box(this.mat.glass, 3.2, 0.5, 0.25, 0, y + 1.15, 15.4);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 20), this.mat.frame);
    wheel.position.set(0, y + 1.15, 15.1);
    wheel.castShadow = true;
    this.group.add(wheel);
    this.chair(0, y, 13.9, -1);
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

  private buildFigure(style?: FigureStyle): { group: THREE.Group; legL: THREE.Mesh; legR: THREE.Mesh } {
    const p = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: style?.shirt ?? p.shirt, roughness: 0.8 });
    const trousers = new THREE.MeshStandardMaterial({
      color: style?.trousers ?? p.trousers,
      roughness: 0.8,
    });

    const part = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
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

    // Uniform extras that make each crew role recognisable.
    if (style?.vest !== undefined) {
      const vest = new THREE.MeshStandardMaterial({ color: style.vest, roughness: 0.6 });
      part(vest, 0.68, 0.6, 0.42, 0, 1.05); // hi-vis vest over the torso
    }
    if (style?.apron !== undefined) {
      const apron = new THREE.MeshStandardMaterial({ color: style.apron, roughness: 0.7 });
      part(apron, 0.5, 0.6, 0.42, 0, 0.85); // bar apron across the front
    }
    if (style?.cap !== undefined) {
      const cap = new THREE.MeshStandardMaterial({ color: style.cap, roughness: 0.6 });
      part(cap, 0.46, 0.16, 0.46, 0, 1.92); // crown
      part(cap, 0.5, 0.06, 0.22, 0, 1.86, 0.28); // peak
    }

    g.scale.setScalar(1.0);
    return { group: g, legL, legR };
  }

  /** Uniformed crew posted at their stations: captain, bar staff, deckhands. */
  private buildCrew(): void {
    const post = (
      style: FigureStyle,
      x: number,
      y: number,
      z: number,
      ry: number,
      card: StaffCard,
    ) => {
      const { group } = this.buildFigure(style);
      group.position.set(x, y, z);
      group.rotation.y = ry;
      group.userData.staff = card;
      this.crew.push(group);
      this.group.add(group);
    };

    const NAVY = 0x16294d;
    const DARK = 0x24272c;

    // Captain at the wheelhouse helm — navy uniform + white peaked cap.
    post({ shirt: NAVY, trousers: NAVY, cap: 0xf3f4f6 }, 1.4, 7.0, 14.2, 0, {
      role: 'Captain',
      name: pick(NAMES),
      station: 'Wheelhouse',
      duty: 'Driving the vessel',
    });

    // Bar attendants — white shirt + burgundy apron — behind each bar.
    post({ shirt: 0xf5f5f5, trousers: DARK, apron: 0x8a1c1c }, 0, 2.15, -12.8, 0, {
      role: 'Bar attendant',
      name: pick(NAMES),
      station: 'Lower saloon bar',
      duty: 'Serving drinks',
    });
    post({ shirt: 0xf5f5f5, trousers: DARK, apron: 0x8a1c1c }, 0, 7.0, -12.8, 0, {
      role: 'Bar attendant',
      name: pick(NAMES),
      station: 'Upper deck kiosk',
      duty: 'Serving drinks',
    });

    // Deckhands — navy uniform + hi-vis vest — supporting on the open decks.
    post({ shirt: NAVY, trousers: DARK, vest: 0xff7a1a }, 0, 2.15, 15, Math.PI, {
      role: 'Deckhand',
      name: pick(NAMES),
      station: 'Bow deck',
      duty: 'Assisting passengers',
    });
    post({ shirt: NAVY, trousers: DARK, vest: 0xff7a1a }, 3.8, 7.0, 0, -Math.PI / 2, {
      role: 'Deckhand',
      name: pick(NAMES),
      station: 'Upper deck',
      duty: 'Assisting passengers',
    });
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
