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
  lower: { deck: 'lower', y: 2.1, minX: -5.4, maxX: 5.4, minZ: -15, maxZ: 12, cap: 34 },
  upper: { deck: 'upper', y: 7.0, minX: -4.4, maxX: 4.4, minZ: -13, maxZ: 4, cap: 24 },
  bridge: { deck: 'bridge', y: 7.0, minX: -2.4, maxX: 2.4, minZ: 13, maxZ: 17, cap: 4 },
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

interface Passenger {
  group: THREE.Group;
  area: DeckArea;
  target: THREE.Vector3;
  speed: number;
  phase: number;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
}

export class VoxelFerry {
  readonly group = new THREE.Group();
  private readonly passengers: Passenger[] = [];
  private readonly perDeck = new Map<DeckId, Passenger[]>();

  private readonly mat = {
    hull: new THREE.MeshStandardMaterial({ color: 0x0e7a3d, roughness: 0.6 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.8 }),
    cabin: new THREE.MeshStandardMaterial({ color: 0xeee0a4, roughness: 0.7 }),
    deck: new THREE.MeshStandardMaterial({ color: 0xb3ab94, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a3b47, roughness: 0.2, metalness: 0.6 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0e7a3d, roughness: 0.5 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xe7dfc0, roughness: 0.7 }),
    rail: new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.6 }),
    funnel: new THREE.MeshStandardMaterial({ color: 0x0e7a3d, roughness: 0.6 }),
  };

  constructor() {
    this.buildFerry();
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

  // --- Ferry hull + superstructure -------------------------------------------

  private box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
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
    // Lower deck floor.
    this.box(m.deck, 12, 0.3, 34, 0, 2.0, -1);

    // Lower saloon (enclosed cabin) with a dark glazing band + roof.
    this.box(m.cabin, 11.5, 3.4, 30, 0, 3.9, -2);
    this.box(m.glass, 11.7, 1.5, 28, 0, 4.3, -2);
    this.box(m.trim, 11.8, 0.4, 30.2, 0, 5.7, -2);
    this.box(m.roof, 12, 0.5, 30.5, 0, 6.0, -2);

    // Open lower fore/aft decks get simple perimeter rails.
    this.railRect(-6, 6, 13, 17.5, 2.3);
    this.railRect(-6, 6, -17, -12, 2.3);

    // Upper deck floor + set-back saloon.
    this.box(m.deck, 10, 0.3, 24, 0, 6.85, -4);
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
    this.group.add(group);
    const p: Passenger = {
      group,
      area,
      target: this.randomPoint(area),
      speed: 1.1 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
      legL,
      legR,
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
