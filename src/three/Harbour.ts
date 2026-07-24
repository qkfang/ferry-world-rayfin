import * as THREE from 'three';

import { CONFIG } from '@/shared/config';
import type { ReferenceLocation } from '@/shared/contract';
import { toWorld } from '@/shared/geo';
import { MapGround } from './MapGround';
import { makeTextSprite } from './labels';

/**
 * Harbour ground: real Sydney Ferries 3D terrain (see MapGround) — satellite
 * imagery draped over DEM elevation — aligned to the same projection as the
 * live ferries, plus wharf markers from the real ReferenceLocation rows.
 */
export class Harbour {
  readonly group = new THREE.Group();

  constructor() {
    // Real Sydney 3D terrain as the ground.
    this.group.add(new MapGround().group);
  }

  /** Place wharf markers from ReferenceLocation rows. */
  setWharves(locations: ReferenceLocation[]): void {
    for (const loc of locations) {
      const { x, z } = toWorld(loc.lat, loc.lon);
      this.group.add(this.makeWharf(x, z, loc.name));
    }
  }

  private makeWharf(x: number, z: number, name: string): THREE.Group {
    const { colors } = CONFIG;
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(46, 6, 30),
      new THREE.MeshStandardMaterial({ color: colors.wharf, flatShading: true }),
    );
    deck.position.y = 7;
    deck.castShadow = true;
    deck.receiveShadow = true;
    g.add(deck);

    const postGeo = new THREE.BoxGeometry(4, 16, 4);
    const postMat = new THREE.MeshStandardMaterial({ color: colors.wharfPost, flatShading: true });
    for (const [dx, dz] of [
      [-20, -12],
      [20, -12],
      [-20, 12],
      [20, 12],
    ]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(dx, 2, dz);
      g.add(post);
    }

    const label = makeTextSprite(name, { bg: 'rgba(255,241,214,0.92)' });
    label.position.set(0, 34, 0);
    g.add(label);
    return g;
  }

  /** No per-frame work for the static terrain. */
  update(_elapsed: number): void {
    void _elapsed;
  }
}
