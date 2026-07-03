import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import type { TourismSite } from '../../rayfin/data/TourismSite';

interface HarbourSceneProps {
  sites: TourismSite[];
  /** Fired when the ferry arrives at a stop. */
  onArrive?: (site: TourismSite) => void;
}

/** World units per site-grid unit. Spreads the voxel harbour out a little. */
const SCALE = 1.35;
const WATER_LEVEL = 0;
const FERRY_SPEED = 7; // world units per second
const DWELL_SECONDS = 1.4; // pause time at each stop

/** Build a simple voxel box mesh. */
function box(
  w: number,
  h: number,
  d: number,
  color: THREE.ColorRepresentation,
  opts: { flat?: boolean } = {}
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.flat ? 1 : 0.75,
    metalness: 0,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** A little voxel tree for parks/gardens. */
function tree(): THREE.Group {
  const group = new THREE.Group();
  const trunk = box(0.4, 1, 0.4, '#6b4a2b');
  trunk.position.y = 0.5;
  const canopy = box(1.4, 1.4, 1.4, '#3f7a3a');
  canopy.position.y = 1.6;
  group.add(trunk, canopy);
  return group;
}

/**
 * Build a voxel landmark for a site. A few well-known sites get bespoke
 * silhouettes; everything else gets a tidy stacked-box building.
 */
function createLandmark(site: TourismSite): THREE.Group {
  const group = new THREE.Group();
  const name = site.name.toLowerCase();
  const color = site.color;

  // Base pad so every landmark reads as sitting on a patch of land.
  const padColor =
    site.category === 'beach'
      ? '#e6d3a3'
      : site.category === 'park'
        ? '#4f8f4a'
        : site.category === 'island'
          ? '#8a7f6b'
          : '#9a9186';
  const pad = box(4.4, 0.6, 4.4, padColor, { flat: true });
  pad.position.y = 0.3;
  group.add(pad);

  if (name.includes('opera')) {
    // Cluster of tilted white shells.
    const shellData: [number, number][] = [
      [-1, 0.2],
      [0, 0],
      [1, 0.25],
    ];
    shellData.forEach(([x, tilt], i) => {
      const shell = box(1.4, 2.4 - i * 0.2, 1.2, color);
      shell.position.set(x, 1.5, 0);
      shell.rotation.x = -0.35 - tilt;
      group.add(shell);
    });
  } else if (name.includes('bridge')) {
    // Two pylons and a stepped steel arch.
    const left = box(0.8, 3.2, 0.8, '#c9c2b6');
    left.position.set(-2.2, 1.9, 0);
    const right = box(0.8, 3.2, 0.8, '#c9c2b6');
    right.position.set(2.2, 1.9, 0);
    group.add(left, right);
    const archColor = color;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const x = (t - 0.5) * 4.4;
      const y = 2.4 + Math.sin(t * Math.PI) * 1.8;
      const seg = box(0.9, 0.4, 0.6, archColor);
      seg.position.set(x, y, 0);
      group.add(seg);
    }
    const deck = box(5, 0.3, 0.9, '#5c5c5c');
    deck.position.set(0, 2.3, 0);
    group.add(deck);
  } else if (name.includes('luna')) {
    // Amusement-park face arch + a little tower.
    const arch = box(3, 0.6, 0.6, color);
    arch.position.set(0, 3, 1.4);
    const legL = box(0.6, 3, 0.6, color);
    legL.position.set(-1.4, 1.5, 1.4);
    const legR = box(0.6, 3, 0.6, color);
    legR.position.set(1.4, 1.5, 1.4);
    const tower = box(1, 3.4, 1, '#d94f4f');
    tower.position.set(0, 1.7, -0.6);
    group.add(arch, legL, legR, tower);
  } else if (site.category === 'beach') {
    // Low sandy dunes with a beach umbrella.
    const dune = box(2.6, 0.8, 2.6, '#dcc487', { flat: true });
    dune.position.y = 0.9;
    const pole = box(0.2, 1.4, 0.2, '#8a6a3a');
    pole.position.set(0.6, 1.6, 0.6);
    const shade = box(1.6, 0.3, 1.6, '#d14f4f');
    shade.position.set(0.6, 2.3, 0.6);
    group.add(dune, pole, shade);
  } else if (site.category === 'park') {
    const t1 = tree();
    t1.position.set(-1, 0.6, -0.6);
    const t2 = tree();
    t2.position.set(1, 0.6, 0.8);
    t2.scale.setScalar(0.8);
    group.add(t1, t2);
  } else if (site.category === 'island') {
    const mound = box(2.4, 1, 2.4, '#8f8674', { flat: true });
    mound.position.y = 1;
    const towerBase = box(1, 2, 1, color);
    towerBase.position.y = 2.2;
    group.add(mound, towerBase);
  } else {
    // Generic little precinct: a cluster of stacked-box buildings.
    const heights = [3, 2.2, 2.6];
    const offsets: [number, number][] = [
      [-1.1, -0.6],
      [0.9, 0.4],
      [0, 1.2],
    ];
    heights.forEach((h, i) => {
      const [x, z] = offsets[i];
      const b = box(1.4, h, 1.4, color);
      b.position.set(x, 0.6 + h / 2, z);
      group.add(b);
      const roof = box(1.5, 0.3, 1.5, '#3d3d3d');
      roof.position.set(x, 0.6 + h + 0.15, z);
      group.add(roof);
    });
  }

  // A small marker post so each stop is easy to spot from above.
  const post = box(0.25, 2, 0.25, '#2f3b45');
  post.position.set(1.7, 1.6, 1.7);
  const flag = box(0.9, 0.5, 0.08, color);
  flag.position.set(2.1, 2.4, 1.7);
  group.add(post, flag);

  return group;
}

/** A chunky voxel ferry. */
function createFerry(): THREE.Group {
  const group = new THREE.Group();
  const hull = box(3.4, 0.9, 1.6, '#1f6f4a');
  hull.position.y = 0.45;
  const hullTop = box(3.4, 0.5, 1.6, '#f2f0e6');
  hullTop.position.y = 1.1;
  const cabin = box(2, 0.9, 1.2, '#ffffff');
  cabin.position.set(-0.2, 1.75, 0);
  const roof = box(2.1, 0.2, 1.3, '#2f7d57');
  roof.position.set(-0.2, 2.3, 0);
  const funnel = box(0.5, 0.9, 0.5, '#d9b641');
  funnel.position.set(-1, 2.6, 0);
  const bow = box(0.8, 0.9, 1.2, '#1f6f4a');
  bow.position.set(1.9, 0.5, 0);
  bow.rotation.y = 0;
  group.add(hull, hullTop, cabin, roof, funnel, bow);
  return group;
}

export function HarbourScene({ sites, onArrive }: HarbourSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || sites.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#7fb4d6');

    // Route points in world space, ordered by routeOrder.
    const route = [...sites]
      .sort((a, b) => a.routeOrder - b.routeOrder)
      .map((site) => ({
        site,
        pos: new THREE.Vector3(site.posX * SCALE, WATER_LEVEL, site.posZ * SCALE),
      }));

    // Compute bounds to frame the whole harbour.
    const boundsBox = new THREE.Box3();
    route.forEach((r) => boundsBox.expandByPoint(r.pos));
    const center = boundsBox.getCenter(new THREE.Vector3());
    const size = boundsBox.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z) + 16;

    // Water plane.
    const water = box(span * 1.5, 0.4, span * 1.5, '#3d84b0', { flat: true });
    water.position.set(center.x, WATER_LEVEL - 0.4, center.z);
    scene.add(water);

    // Landmarks.
    route.forEach((r) => {
      const landmark = createLandmark(r.site);
      landmark.position.copy(r.pos);
      landmark.scale.setScalar(1.5);
      scene.add(landmark);
    });

    // Ferry.
    const ferry = createFerry();
    ferry.scale.setScalar(1.4);
    ferry.position.copy(route[0].pos);
    ferry.position.y = WATER_LEVEL + 0.1;
    scene.add(ferry);

    // Lighting.
    const hemi = new THREE.HemisphereLight('#ffffff', '#4a6a80', 1.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e0', 1.1);
    sun.position.set(20, 40, 20);
    scene.add(sun);
    scene.add(new THREE.AmbientLight('#ffffff', 0.25));

    // Isometric orthographic camera.
    const frustum = span * 0.62;
    const camera = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.1, 2000);
    const camOffset = new THREE.Vector3(60, 70, 60);
    camera.position.copy(center).add(camOffset);
    camera.lookAt(center);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight || 1;
      const aspect = w / h;
      camera.left = -frustum * aspect;
      camera.right = frustum * aspect;
      camera.top = frustum;
      camera.bottom = -frustum;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Ferry travel state machine along the looping route.
    let segment = 0;
    let dwellTimer = 0;
    let arrived = true; // start docked at the first stop
    if (route.length > 0) onArriveRef.current?.(route[0].site);

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;

      const from = route[segment].pos;
      const to = route[(segment + 1) % route.length].pos;

      if (arrived) {
        dwellTimer -= delta;
        if (dwellTimer <= 0) {
          arrived = false;
        }
      } else {
        const dir = new THREE.Vector3().subVectors(to, from);
        const dist = dir.length();
        const step = (FERRY_SPEED * delta) / (dist || 1);
        const current = ferry.position.clone();
        current.y = WATER_LEVEL;
        const travelled = new THREE.Vector3().subVectors(current, from).length();
        const nextT = Math.min(1, (travelled + FERRY_SPEED * delta) / (dist || 1));

        ferry.position.lerpVectors(from, to, nextT);
        // Face the direction of travel.
        if (dist > 0.001) {
          ferry.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2;
        }
        void step;

        if (nextT >= 1) {
          segment = (segment + 1) % route.length;
          arrived = true;
          dwellTimer = DWELL_SECONDS;
          onArriveRef.current?.(route[segment].site);
        }
      }

      // Gentle bob on the water.
      ferry.position.y = WATER_LEVEL + 0.1 + Math.sin(elapsed * 2.2) * 0.08;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sites]);

  return <div ref={containerRef} className="h-full w-full" />;
}
